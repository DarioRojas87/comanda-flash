// Shared order types — used by DigitalComanda and DeliveryModule

export type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'shipping'
  | 'delivered'
  | 'cancelled'
  | 'failed'
  | 'picked_up'

export interface OrderItem {
  id: string
  product_id: string | null
  quantity: number
  subtotal: number | null
  parent_item_id: string | null
  products?: { name: string } | null
}

export interface Order {
  id: string
  customer_name: string
  address_text: string | null
  lat: number | null
  lng: number | null
  status: OrderStatus
  total_amount: number | null
  created_at: string
  delivery_id: string | null
  notes: string | null
  indicaciones: string | null
  is_paid: boolean
  order_items?: OrderItem[]
}

export interface DeliveryProfile {
  id: string
  full_name: string
  role: string
}
