import { Trash2 } from 'lucide-react'

interface Props {
  name: string
  onConfirm: () => void
  onCancel: () => void
}

export default function DeleteCategoryModal({ name, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface-dark w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-border-dark">
        <div className="flex items-center justify-center w-14 h-14 bg-red-500/10 rounded-full mx-auto mb-4 border border-red-500/20">
          <Trash2 className="w-7 h-7 text-red-400" />
        </div>
        <h2 className="text-xl font-black text-center text-white mb-2">Eliminar Categoría</h2>
        <p className="text-sm text-text-muted text-center mb-6 leading-relaxed">
          Los productos de <span className="text-white font-bold">"{name}"</span> pasarán
          automáticamente a la categoría <span className="text-primary font-bold">General</span>.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-background-dark border border-border-dark text-text-muted font-bold hover:text-white transition-all text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold transition-all text-sm"
          >
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
