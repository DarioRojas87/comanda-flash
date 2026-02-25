-- 1. Create product_categories table
CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- Base policy: anyone authenticated can read categories
CREATE POLICY "Anyone can read categories"
  ON product_categories FOR SELECT
  TO authenticated
  USING (true);

-- Admin policy: only admins can manage categories
CREATE POLICY "Admins can insert categories"
  ON product_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update categories"
  ON product_categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete categories"
  ON product_categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );


-- 2. Update existing products table
-- Add category_id and ingredients columns
ALTER TABLE products 
  ADD COLUMN category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  ADD COLUMN ingredients TEXT;

-- For backward compatibility with existing products during the transition,
-- we'll create a default 'General' category and assign existing products to it
INSERT INTO product_categories (id, name) VALUES (gen_random_uuid(), 'General');
UPDATE products SET category_id = (SELECT id FROM product_categories WHERE name = 'General') WHERE category_id IS NULL;
