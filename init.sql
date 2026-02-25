-- 1. ENUMS
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'delivery');
CREATE TYPE order_status AS ENUM ('pending', 'preparing', 'ready', 'shipping', 'delivered', 'cancelled', 'failed');

-- 2. TABLES
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  full_name TEXT,
  role user_role DEFAULT 'staff',
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  address_text TEXT,
  location_url TEXT,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION,
  status order_status DEFAULT 'pending',
  delivery_id UUID REFERENCES profiles(id),
  is_paid BOOLEAN DEFAULT false,
  total_amount DECIMAL(10,2),
  fail_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER,
  subtotal DECIMAL(10,2)
);

-- 3. AUTOMATION: AUTOMATIC PROFILE CREATION
-- This function automatically creates a profile when a new user signs up in auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'staff');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. REALTIME ENABLEMENT
-- Enable Realtime for tables that need it
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- 5. INITIAL DATA (OPTIONAL PRODUCTS)
INSERT INTO products (name, price) VALUES 
('Pizza Margherita', 1200.00),
('Hamburguesa Completa', 950.00),
('Papas Fritas', 500.00),
('Gaseosa 500ml', 300.00);

-- 6. INSTRUCTIONS FOR CREATING SPECIFIC USERS:
/*
  Para crear los usuarios iniciales (Admin, Comanda, Delivery), sigue estos pasos:
  
  1. Ve a la pestaña "Authentication" -> "Users" en tu Dashboard de Supabase.
  2. Haz clic en "Add User" -> "Create new user".
  3. Crea 3 usuarios con los correos que desees.
  4. Una vez creados, copia sus IDs (UUID) de la lista de usuarios.
  5. Ejecuta los siguientes comandos reemplazando 'ID_AQUI' con los UUIDs correspondientes:

  -- Para el ADMIN:
  UPDATE profiles SET role = 'admin', full_name = 'Administrador Flash' WHERE id = 'ID_DEL_ADMIN';

  -- Para el que maneja la COMANDA (Staff):
  UPDATE profiles SET role = 'staff', full_name = 'Manejador de Comanda' WHERE id = 'ID_DEL_STAFF';

  -- Para el DELIVERY:
  UPDATE profiles SET role = 'delivery', full_name = 'Repartidor 1' WHERE id = 'ID_DEL_DELIVERY';
*/
