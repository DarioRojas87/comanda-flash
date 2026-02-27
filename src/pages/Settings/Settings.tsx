import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, UserPlus, Trash2, Bike, ClipboardList, X, Eye, EyeOff } from 'lucide-react'

interface Profile {
  id: string
  full_name: string
  role: 'admin' | 'staff' | 'delivery'
}

const fetchProfiles = async (): Promise<Profile[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['staff', 'delivery'])
    .order('role')
  if (error) throw new Error(error.message)
  return data || []
}

const EMPTY_FORM = { full_name: '', email: '', password: '', role: 'staff' as 'staff' | 'delivery' }

export default function SettingsPage() {
  const { profile: currentProfile } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const insertAuditLog = async (action: string, entityType: 'product' | 'category' | 'user') => {
    if (!currentProfile) return
    try {
      await supabase.from('audit_logs').insert({
        user_id: currentProfile.id,
        user_name: currentProfile.full_name,
        action,
        entity_type: entityType
      })
    } catch {
      // Non-critical
    }
  }

  const resetAndClose = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowPassword(false)
    setShowForm(false)
  }

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['settingsProfiles'],
    queryFn: fetchProfiles
  })

  const createUserMutation = useMutation({
    mutationFn: async () => {
      // 1. Save admin session so we can restore it after signUp logs us out
      const {
        data: { session: adminSession }
      } = await supabase.auth.getSession()
      if (!adminSession) throw new Error('No hay sesión activa de administrador')

      // 2. Sign up the new user — this will AUTO sign-in the new user
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { full_name: form.full_name } }
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('No se pudo crear el usuario')

      const newUserId = data.user.id

      // 3. Immediately restore the admin session (the signUp changed our auth state)
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token
      })

      // 4. Upsert the new user's profile with correct role and name.
      //    Using upsert so it works whether or not the trigger already created the row.
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: newUserId,
        full_name: form.full_name,
        role: form.role
      })

      if (profileError) throw profileError
    },
    onSuccess: () => {
      insertAuditLog(`Creó usuario "${form.full_name}" con rol "${form.role}"`, 'user')
      queryClient.invalidateQueries({ queryKey: ['settingsProfiles'] })
      resetAndClose()
    },
    onError: (err: Error) => {
      setFormError(err.message)
    }
  })

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // First, clear any orders that reference this user as their delivery driver.
      // Without this step, the FK on orders.delivery_id would block the profile deletion (409 Conflict).
      await supabase.from('orders').update({ delivery_id: null }).eq('delivery_id', userId)

      const { error } = await supabase.from('profiles').delete().eq('id', userId)
      if (error) throw error
    },
    onSuccess: (_data, userId) => {
      const deleted = profiles.find((p) => p.id === userId)
      if (deleted)
        insertAuditLog(`Eliminó usuario "${deleted.full_name}" (${deleted.role})`, 'user')
      queryClient.invalidateQueries({ queryKey: ['settingsProfiles'] })
    }
  })

  const handleCreate = () => {
    setFormError(null)
    if (!form.full_name.trim() || !form.email.trim() || !form.password) {
      setFormError('Todos los campos son obligatorios.')
      return
    }
    if (form.password.length < 6) {
      setFormError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    createUserMutation.mutate()
  }

  const staffUsers = profiles.filter((p) => p.role === 'staff')
  const deliveryUsers = profiles.filter((p) => p.role === 'delivery')

  return (
    <div className="flex flex-col w-full pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background-dark px-4 pt-4 pb-3 flex items-center justify-between border-b border-border-dark">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">
              Configuración
            </h1>
            <p className="text-xs text-text-muted mt-1">Gestión de usuarios</p>
          </div>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY_FORM)
            setFormError(null)
            setShowForm(true)
          }}
          className="bg-primary hover:bg-orange-600 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 transition-all shrink-0"
        >
          <UserPlus className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 pt-5 space-y-6">
        {/* Staff Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
              Staff ({staffUsers.length})
            </h2>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
            </div>
          ) : staffUsers.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm bg-surface-dark/50 rounded-2xl border border-dashed border-border-dark">
              No hay usuarios staff
            </div>
          ) : (
            <div className="space-y-2">
              {staffUsers.map((u) => (
                <UserRow key={u.id} user={u} onDelete={() => deleteUserMutation.mutate(u.id)} />
              ))}
            </div>
          )}
        </section>

        {/* Delivery Section */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Bike className="w-4 h-4 text-green-400" />
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
              Delivery ({deliveryUsers.length})
            </h2>
          </div>
          {deliveryUsers.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm bg-surface-dark/50 rounded-2xl border border-dashed border-border-dark">
              No hay repartidores
            </div>
          ) : (
            <div className="space-y-2">
              {deliveryUsers.map((u) => (
                <UserRow key={u.id} user={u} onDelete={() => deleteUserMutation.mutate(u.id)} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Create User Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface-dark w-full max-w-sm rounded-3xl shadow-2xl border border-border-dark">
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-white">Nuevo Usuario</h2>
                <button
                  onClick={resetAndClose}
                  className="w-8 h-8 rounded-full bg-background-dark flex items-center justify-center text-text-secondary hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {formError}
                </div>
              )}

              {/* Role selector */}
              <div className="grid grid-cols-2 gap-2">
                {(['staff', 'delivery'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, role: r }))}
                    className={`py-2.5 rounded-xl text-sm font-bold transition-all border ${
                      form.role === r
                        ? 'bg-primary border-primary text-white shadow-md'
                        : 'bg-background-dark border-border-dark text-text-secondary hover:text-white'
                    }`}
                  >
                    {r === 'staff' ? '🍳 Staff' : '🚴 Delivery'}
                  </button>
                ))}
              </div>

              <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
                <input
                  autoComplete="off"
                  name="user-full-name"
                  placeholder="Nombre completo"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 focus:ring-1 focus:ring-primary outline-none text-sm placeholder:text-slate-600 mb-3"
                />
                <input
                  autoComplete="off"
                  name="user-email"
                  placeholder="Email"
                  type="text"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 focus:ring-1 focus:ring-primary outline-none text-sm placeholder:text-slate-600 mb-3"
                />
                <div className="relative">
                  <input
                    autoComplete="new-password"
                    name="new-password"
                    placeholder="Contraseña (mín. 6 caracteres)"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 pr-11 focus:ring-1 focus:ring-primary outline-none text-sm placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </form>

              <button
                type="button"
                onClick={handleCreate}
                disabled={createUserMutation.isPending}
                className="w-full py-3.5 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 mt-2"
              >
                {createUserMutation.isPending ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" /> Crear Usuario
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UserRow({ user, onDelete }: { user: Profile; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex items-center gap-3 p-4 bg-surface-dark rounded-2xl border border-border-dark">
      <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-sm font-black text-primary">
        {user.full_name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white text-sm truncate">{user.full_name}</p>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
            user.role === 'delivery'
              ? 'text-green-400 bg-green-400/10'
              : 'text-primary bg-primary/10'
          }`}
        >
          {user.role}
        </span>
      </div>
      {confirming ? (
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-text-muted hover:text-white px-2 py-1"
          >
            No
          </button>
          <button
            onClick={onDelete}
            className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg font-bold"
          >
            Sí, eliminar
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
