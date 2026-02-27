// Settings-specific types
export interface Profile {
  id: string
  full_name: string
  role: 'admin' | 'staff' | 'delivery'
}
