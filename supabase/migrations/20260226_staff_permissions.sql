-- Grant staff role same permissions as admin for product_categories and products
-- This allows staff to create, edit, and delete categories and products

-- Product categories: staff can insert
CREATE POLICY "Staff can insert categories"
  ON product_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Note: The existing "Admins can insert categories" policy only covers admin.
-- The new policy covers staff. Both can coexist in Supabase (OR logic).

-- Product categories: staff can delete
CREATE POLICY "Staff can delete categories"
  ON product_categories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Product categories: staff can update
CREATE POLICY "Staff can update categories"
  ON product_categories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Products: ensure staff can manage products
-- Check if products table has RLS enabled and add staff policies
DO $$
BEGIN
  -- Staff insert products (if not already covered)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products'
    AND policyname = 'Staff can insert products'
  ) THEN
    EXECUTE '
      CREATE POLICY "Staff can insert products"
        ON products FOR INSERT
        TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN (''admin'', ''staff'')
          )
        )
    ';
  END IF;

  -- Staff update products
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products'
    AND policyname = 'Staff can update products'
  ) THEN
    EXECUTE '
      CREATE POLICY "Staff can update products"
        ON products FOR UPDATE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN (''admin'', ''staff'')
          )
        )
    ';
  END IF;

  -- Staff delete products
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products'
    AND policyname = 'Staff can delete products'
  ) THEN
    EXECUTE '
      CREATE POLICY "Staff can delete products"
        ON products FOR DELETE
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN (''admin'', ''staff'')
          )
        )
    ';
  END IF;
END $$;
