-- Add 'indicaciones' field to orders (customer delivery instructions)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS indicaciones TEXT;

-- Recreate the RPC to accept p_indicaciones and parent_item_id per item
CREATE OR REPLACE FUNCTION create_order_with_stock(
  p_customer_name TEXT,
  p_address_text TEXT,
  p_location_url TEXT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_is_paid BOOLEAN,
  p_total_amount DOUBLE PRECISION,
  p_notes TEXT,
  p_indicaciones TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INTEGER;
  v_unit_price DOUBLE PRECISION;
  v_current_stock INTEGER;
  v_product_name TEXT;
  -- Map from a temporary "client-side index" to the real DB item UUID
  -- We store inserted item ids keyed by product_id so children can reference their parent
  v_parent_item_id UUID;
  v_new_item_id UUID;
  -- Associative array: product_id -> order_item UUID (for parent lookup)
  v_item_id_map JSONB := '{}'::JSONB;
BEGIN
  -- ---------------------------------------------------------------
  -- PASS 1: Stock verification + deduction (only for non-child items)
  -- ---------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Skip items that are extras/agregados linked to a parent (they don't deduct stock)
    IF v_item->>'parent_product_id' IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;

    SELECT stock, name INTO v_current_stock, v_product_name
    FROM products
    WHERE id = v_product_id
    FOR UPDATE;

    IF v_current_stock IS NOT NULL THEN
      IF v_current_stock < v_quantity THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto: % (Disponible: %)', v_product_name, v_current_stock;
      END IF;

      UPDATE products
      SET stock = stock - v_quantity,
          active = CASE WHEN (stock - v_quantity) <= 0 THEN false ELSE active END
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  -- ---------------------------------------------------------------
  -- Create the order
  -- ---------------------------------------------------------------
  INSERT INTO orders (
    customer_name,
    address_text,
    location_url,
    lat,
    lng,
    is_paid,
    status,
    total_amount,
    notes,
    indicaciones
  ) VALUES (
    p_customer_name,
    p_address_text,
    p_location_url,
    p_lat,
    p_lng,
    p_is_paid,
    'pending',
    p_total_amount,
    p_notes,
    p_indicaciones
  ) RETURNING id INTO v_order_id;

  -- ---------------------------------------------------------------
  -- PASS 2: Insert parent items first, collect their IDs
  -- ---------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'parent_product_id' IS NOT NULL THEN
      CONTINUE; -- skip children in this pass
    END IF;

    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DOUBLE PRECISION;

    INSERT INTO order_items (order_id, product_id, quantity, subtotal)
    VALUES (v_order_id, v_product_id, v_quantity, v_quantity * v_unit_price)
    RETURNING id INTO v_new_item_id;

    -- Store the mapping: product_id -> order_item.id
    v_item_id_map := v_item_id_map || jsonb_build_object(v_product_id::TEXT, v_new_item_id::TEXT);
  END LOOP;

  -- ---------------------------------------------------------------
  -- PASS 3: Insert child items (extras/agregados) linked to parent
  -- ---------------------------------------------------------------
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'parent_product_id' IS NULL THEN
      CONTINUE; -- skip parents in this pass
    END IF;

    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DOUBLE PRECISION;

    -- Look up the parent item's DB id
    v_parent_item_id := (v_item_id_map->>(v_item->>'parent_product_id'))::UUID;

    INSERT INTO order_items (order_id, product_id, quantity, subtotal, parent_item_id)
    VALUES (v_order_id, v_product_id, v_quantity, v_quantity * v_unit_price, v_parent_item_id);
  END LOOP;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
