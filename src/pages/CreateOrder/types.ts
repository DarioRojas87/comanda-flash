// CreateOrder-specific types
import type { Product } from '@/shared/types/product'

export type { Product }

export interface ExtraEntry {
  product_id: string
  name: string
  price: number
  quantity: number
}

// One entry per UNIT of a product in the cart (3x burger = 3 CartUnit entries)
export interface CartUnit {
  instanceId: string
  product_id: string
  name: string
  price: number
  extras: ExtraEntry[]
}
