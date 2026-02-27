import type { Profile } from './types'

export const EMPTY_FORM: {
  full_name: string
  email: string
  password: string
  role: 'staff' | 'delivery'
} = { full_name: '', email: '', password: '', role: 'staff' }

export { type Profile }
