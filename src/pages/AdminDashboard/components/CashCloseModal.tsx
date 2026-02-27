import { Download, ReceiptText } from 'lucide-react'
import type { CashSummary } from '../types'

interface Props {
  summary: CashSummary
  onClose: () => void
  onConfirm: () => void
  onDownload7Days: () => void
}

export default function CashCloseModal({ summary, onClose, onConfirm, onDownload7Days }: Props) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface-dark w-full max-w-sm rounded-3xl p-6 shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-border-dark animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mx-auto mb-4 border border-primary/20">
          <ReceiptText className="w-8 h-8 text-primary" />
        </div>

        <h2 className="text-2xl font-black text-center text-white mb-1 tracking-tight">
          Resumen de Caja
        </h2>
        <p className="text-center text-xs text-text-muted mb-1 font-mono">
          {new Date().toLocaleDateString('es-AR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </p>
        <p className="text-center text-[10px] text-text-muted/60 mb-6">
          Turno hasta las{' '}
          {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </p>

        <div className="space-y-3 mb-8">
          <div className="flex justify-between items-center p-4 bg-green-500/10 border border-green-500/20 rounded-2xl">
            <div>
              <span className="block text-green-400 font-bold text-xs uppercase tracking-wider mb-0.5">
                Venta Bruta
              </span>
              <span className="text-green-500/60 text-[10px] font-medium">Pedidos completados</span>
            </div>
            <span className="text-green-400 font-black text-xl">
              ${summary.totalSales.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
            <div>
              <span className="block text-red-400 font-bold text-xs uppercase tracking-wider mb-0.5">
                Pérdidas
              </span>
              <span className="text-red-500/60 text-[10px] font-medium">Pedidos cancelados</span>
            </div>
            <span className="text-red-400 font-black text-xl">
              -${summary.totalLosses.toFixed(2)}
            </span>
          </div>

          <div className="pt-4 mt-2 border-t border-dashed border-border-dark flex justify-between items-end px-1">
            <span className="text-text-secondary font-bold text-sm uppercase tracking-wide">
              Balance Neto
            </span>
            <span className="text-white font-black text-3xl tracking-tighter">
              ${(summary.totalSales - summary.totalLosses).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="w-full py-3.5 bg-primary text-white font-bold rounded-2xl hover:bg-orange-600 shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" /> Cerrar Turno y Descargar PDF
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-background-dark border border-border-dark text-text-muted font-bold hover:text-white rounded-2xl transition-all text-sm"
            >
              Volver
            </button>
            <button
              onClick={onDownload7Days}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-1.5 text-sm"
            >
              <Download className="w-3.5 h-3.5" /> Últimos 7 días
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
