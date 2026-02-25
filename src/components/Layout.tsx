import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  SlidersHorizontal,
  House,
  ClipboardList,
  Bike,
  LogOut,
  type LucideIcon
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const NavLink = ({
  to,
  icon: Icon,
  label,
  active
}: {
  to: string
  icon: LucideIcon
  label: string
  active: boolean
}) => (
  <Link
    to={to}
    className={cn(
      'flex flex-1 flex-col items-center justify-end gap-1.5 transition-colors group',
      active ? 'text-primary' : 'text-text-secondary hover:text-white'
    )}
  >
    <Icon
      className={cn(
        'w-6 h-6',
        active ? 'fill-primary/20' : 'group-hover:scale-110 transition-transform'
      )}
    />
    <p className="text-xs font-bold leading-normal tracking-wide">{label}</p>
  </Link>
)

// Routes where the back button should be shown
const BACK_ROUTES = ['/comanda/crear', '/settings']

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()

  if (!profile) return <Outlet />

  const isAdmin = profile.role === 'admin'
  const isStaff = profile.role === 'staff'
  const isDelivery = profile.role === 'delivery'

  const showBack = BACK_ROUTES.some((r) => location.pathname.startsWith(r))

  return (
    <div className="bg-background-light dark:bg-background-dark font-display antialiased h-screen flex flex-col overflow-hidden text-slate-900 dark:text-white">
      {/* Header */}
      <header className="flex items-center bg-surface-dark p-4 pb-2 justify-between border-b border-border-dark shrink-0 z-10">
        {/* Back button — only on sub-pages */}
        {showBack ? (
          <button
            onClick={() => navigate(-1)}
            className="text-white flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        ) : (
          <div className="size-12 shrink-0" />
        )}

        {/* App Title */}
        <h2 className="text-white text-lg font-black leading-tight tracking-tight flex-1 text-center">
          Comanda<span className="text-primary">Flash</span>
        </h2>

        {/* Actions */}
        <div className="flex gap-1 items-center">
          <button
            onClick={signOut}
            title="Cerrar sesión"
            className="flex w-10 h-10 items-center justify-center rounded-full hover:bg-red-500/10 text-text-secondary hover:text-red-500 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
          {isAdmin && (
            <Link
              to="/settings"
              title="Configuración"
              className={cn(
                'flex w-10 h-10 items-center justify-center rounded-full transition-colors',
                location.pathname === '/settings'
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-white/10 text-text-secondary hover:text-white'
              )}
            >
              <SlidersHorizontal className="w-5 h-5" />
            </Link>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative flex-1 min-h-0 w-full overflow-y-auto bg-background-dark">
        <Outlet />
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="flex gap-2 border-t border-border-dark bg-surface-dark px-4 pb-6 pt-3 shrink-0 z-20 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]">
        {isAdmin && <NavLink to="/" icon={House} label="Home" active={location.pathname === '/'} />}

        {(isAdmin || isStaff) && (
          <NavLink
            to="/comanda"
            icon={ClipboardList}
            label="Comanda"
            active={location.pathname.startsWith('/comanda')}
          />
        )}

        {isDelivery && (
          <NavLink
            to="/delivery"
            icon={Bike}
            label="Viajes"
            active={location.pathname === '/delivery'}
          />
        )}
      </nav>
    </div>
  )
}
