-- 1. Add the permanent "Agregados" category (no-op if already exists)
INSERT INTO product_categories (name)
VALUES ('Agregados')
ON CONFLICT (name) DO NOTHING;

-- 2. Add parent_item_id to order_items so extras can be linked to a specific product item
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE;

-- 3. orders.status is already TEXT, so 'picked_up' works without a type change.
-- Document the new status value here for clarity.
-- Valid statuses: pending, preparing, ready, shipping, delivered, cancelled, failed, picked_up
COMMENT ON COLUMN orders.status IS 'pending | preparing | ready | shipping | delivered | cancelled | failed | picked_up';
