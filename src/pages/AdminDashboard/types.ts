// AdminDashboard-specific types

export interface AdminOrder {
  id: string
  customer_name: string
  lat: number | null
  lng: number | null
  status: string
  total_amount: number | null
  is_paid: boolean
  delivery_id: string | null
  address_text: string | null
  created_at: string | null
}

export interface AdminProfile {
  id: string
  full_name: string
  role: string
  current_lat: number | null
  current_lng: number | null
}

export interface ProductCategory {
  id: string
  name: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  price: number
  active: boolean
  category_id: string | null
  ingredients: string | null
  stock: number | null
}

export interface AuditLog {
  id: string
  user_name: string
  action: string
  entity_type: string
  created_at: string
}

export interface CashSummary {
  totalSales: number
  totalLosses: number
}
