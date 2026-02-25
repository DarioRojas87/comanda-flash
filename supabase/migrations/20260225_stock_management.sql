ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT NULL;

-- 2. Create RPC function for atomic order creation with stock deduction
CREATE OR REPLACE FUNCTION create_order_with_stock(
  p_customer_name TEXT,
  p_address_text TEXT,
  p_location_url TEXT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_is_paid BOOLEAN,
  p_total_amount DOUBLE PRECISION,
  p_notes TEXT,
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
BEGIN
  -- We need to lock the products to prevent concurrent negative stock.
  -- Loop through items to verify and deduct stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    
    -- Lock the specific product row for update
    SELECT stock, name INTO v_current_stock, v_product_name
    FROM products 
    WHERE id = v_product_id
    FOR UPDATE;
    
    -- If stock is not null, verify and deduct
    IF v_current_stock IS NOT NULL THEN
      IF v_current_stock < v_quantity THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto: % (Disponible: %)', v_product_name, v_current_stock;
      END IF;
      
      -- Deduct stock and automatically set active to false if stock reaches 0
      UPDATE products 
      SET stock = stock - v_quantity,
          active = CASE WHEN (stock - v_quantity) <= 0 THEN false ELSE active END
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  -- If we get here, all stock checks passed and stock is deducted.
  -- Create the order
  INSERT INTO orders (
    customer_name, 
    address_text, 
    location_url, 
    lat, 
    lng, 
    is_paid,
    status, 
    total_amount, 
    notes
  ) VALUES (
    p_customer_name,
    p_address_text,
    p_location_url,
    p_lat,
    p_lng,
    p_is_paid,
    'pending',
    p_total_amount,
    p_notes
  ) RETURNING id INTO v_order_id;

  -- Create order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_quantity := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DOUBLE PRECISION;
    
    INSERT INTO order_items (
      order_id,
      product_id,
      quantity,
      subtotal
    ) VALUES (
      v_order_id,
      v_product_id,
      v_quantity,
      v_quantity * v_unit_price
    );
  END LOOP;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
