// Shared product types — used by CreateOrder and AdminDashboard

export interface Product {
  id: string
  name: string
  price: number
  category_id: string | null
  stock: number | null
  active?: boolean
  ingredients?: string | null
}

export interface Category {
  id: string
  name: string
  created_at?: string
}
