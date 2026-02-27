import { ScrollText, X } from 'lucide-react'
import type { AuditLog } from '../types'

interface Props {
  logs: AuditLog[]
  isLoading: boolean
  onClose: () => void
}

export default function AuditLogModal({ logs, isLoading, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface-dark w-full max-w-lg rounded-3xl shadow-2xl border border-border-dark flex flex-col max-h-[85vh]">
        <div className="flex justify-between items-center p-6 border-b border-border-dark shrink-0">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-purple-400" /> Logs de Actividad
            </h2>
            <p className="text-xs text-text-muted mt-0.5">Últimas 2 semanas</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-background-dark flex items-center justify-center text-text-secondary hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-400" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-10">
              No hay actividad registrada.
            </p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="flex gap-3 p-3 bg-background-dark/60 border border-border-dark rounded-xl"
              >
                <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 text-xs font-black text-purple-400">
                  {log.user_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium leading-snug">{log.action}</p>
                  <p className="text-text-muted text-xs mt-0.5">
                    <span className="text-primary font-bold">{log.user_name}</span>
                    {' · '}
                    {new Date(log.created_at).toLocaleString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
