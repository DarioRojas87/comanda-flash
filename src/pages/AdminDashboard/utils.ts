import { supabase } from '@/lib/supabase'
import type { AdminOrder, AdminProfile, ProductCategory, Product } from './types'

export const fetchAdminData = async () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const {
    data: { session }
  } = await supabase.auth.getSession()
  const userId = session?.user?.id

  const [ordersRes, profilesRes, categoriesRes, productsRes, adminProfileRes] = await Promise.all([
    supabase.from('orders').select('*').gte('created_at', today.toISOString()),
    supabase.from('profiles').select('*').eq('role', 'delivery'),
    supabase.from('product_categories').select('*').order('name'),
    supabase.from('products').select('*').order('name'),
    userId
      ? supabase.from('profiles').select('*').eq('id', userId).single()
      : Promise.resolve({ data: null, error: null })
  ])

  if (ordersRes.error) throw new Error(ordersRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (categoriesRes.error) throw new Error(categoriesRes.error.message)
  if (productsRes.error) throw new Error(productsRes.error.message)
  if (adminProfileRes.error && adminProfileRes.error.code !== 'PGRST116')
    throw new Error(adminProfileRes.error.message)

  return {
    orders: ordersRes.data as AdminOrder[],
    profiles: profilesRes.data as AdminProfile[],
    categories: categoriesRes.data as ProductCategory[],
    products: productsRes.data as Product[],
    adminProfile: adminProfileRes.data as AdminProfile | null
  }
}

export const insertAuditLog = async (
  action: string,
  entityType: 'product' | 'category' | 'user',
  profile: { id: string; full_name: string } | null
) => {
  if (!profile) return
  try {
    await supabase.from('audit_logs').insert({
      user_id: profile.id,
      user_name: profile.full_name,
      action,
      entity_type: entityType
    })
  } catch {
    // Non-critical: don't block UX if logging fails
  }
}
