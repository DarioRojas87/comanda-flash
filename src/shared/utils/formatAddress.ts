import type { Order } from '@/shared/types/order'

/**
 * Formats an order's location into a human-readable string.
 * Used in DigitalComanda and DeliveryModule.
 */
export function formatAddress(order: Pick<Order, 'address_text' | 'lat' | 'lng'>): string {
  const hasGps = order.lat !== null && order.lng !== null
  const hasText = !!order.address_text

  if (hasText && hasGps) return `Ubicación por WhatsApp · ${order.address_text}`
  if (hasText) return order.address_text!
  if (hasGps) return 'Ubicación por GPS'
  return 'Sin ubicación'
}
