import type { OrderItem } from '@/shared/types/order'

/** Build a parent-child tree from a flat list of order items */
export function buildItemTree(items: OrderItem[]): (OrderItem & { extras: OrderItem[] })[] {
  const parents = items.filter((i) => !i.parent_item_id)
  return parents.map((parent) => ({
    ...parent,
    extras: items.filter((i) => i.parent_item_id === parent.id)
  }))
}
