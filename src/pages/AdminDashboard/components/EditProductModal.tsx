import { Trash2, X } from 'lucide-react'
import type { Product, ProductCategory } from '../types'

interface Props {
  product: Product
  name: string
  price: string
  stock: string
  categoryId: string
  ingredients: string
  active: boolean
  categories: ProductCategory[]
  onNameChange: (v: string) => void
  onPriceChange: (v: string) => void
  onStockChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onIngredientsChange: (v: string) => void
  onActiveToggle: () => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

export default function EditProductModal({
  name,
  price,
  stock,
  categoryId,
  ingredients,
  active,
  categories,
  onNameChange,
  onPriceChange,
  onStockChange,
  onCategoryChange,
  onIngredientsChange,
  onActiveToggle,
  onSave,
  onDelete,
  onClose
}: Props) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface-dark w-full max-w-md rounded-3xl shadow-2xl border border-border-dark">
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black text-white">Editar Producto</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-background-dark flex items-center justify-center text-text-secondary hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
                Nombre
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  Precio ($)
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => onPriceChange(e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  Stock <span className="normal-case font-normal">(vacío = sin límite)</span>
                </label>
                <input
                  type="number"
                  value={stock}
                  onChange={(e) => onStockChange(e.target.value)}
                  placeholder="—"
                  min="0"
                  className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
                Categoría
              </label>
              <select
                value={categoryId}
                onChange={(e) => onCategoryChange(e.target.value)}
                className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
                Ingredientes / Descripción
              </label>
              <textarea
                value={ingredients}
                onChange={(e) => onIngredientsChange(e.target.value)}
                placeholder="Opcional..."
                rows={2}
                className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-text-muted uppercase tracking-wider">
                Disponibilidad
              </label>
              <button
                onClick={onActiveToggle}
                className={`w-full py-2.5 rounded-2xl text-sm font-bold transition-all border ${active ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-red-500/20 border-red-500/30 text-red-400'}`}
              >
                {active ? '✓ Disponible' : '✗ Agotado'} — toca para cambiar
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onDelete}
              className="py-3 px-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold hover:bg-red-500/20 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onSave}
              disabled={!name.trim() || !price}
              className="flex-1 py-3 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all text-sm"
            >
              Guardar Cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
