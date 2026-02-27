import { Plus, X } from 'lucide-react'
import type { ProductCategory } from '../types'

interface Props {
  name: string
  price: string
  stock: string
  categoryId: string
  ingredients: string
  categories: ProductCategory[]
  onNameChange: (v: string) => void
  onPriceChange: (v: string) => void
  onStockChange: (v: string) => void
  onCategoryChange: (v: string) => void
  onIngredientsChange: (v: string) => void
  onCreate: () => void
  onClose: () => void
}

export default function CreateProductModal({
  name,
  price,
  stock,
  categoryId,
  ingredients,
  categories,
  onNameChange,
  onPriceChange,
  onStockChange,
  onCategoryChange,
  onIngredientsChange,
  onCreate,
  onClose
}: Props) {
  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface-dark w-full max-w-md rounded-3xl shadow-2xl border border-border-dark">
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black text-white">Nuevo Producto</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-background-dark flex items-center justify-center text-text-secondary hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Nombre del producto *"
              className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                value={price}
                onChange={(e) => onPriceChange(e.target.value)}
                placeholder="Precio *"
                min="0"
                step="0.01"
                className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
              />
              <input
                type="number"
                value={stock}
                onChange={(e) => onStockChange(e.target.value)}
                placeholder="Stock (opcional)"
                min="0"
                className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
              />
            </div>
            <select
              value={categoryId}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary"
            >
              <option value="">Seleccionar categoría *</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <textarea
              value={ingredients}
              onChange={(e) => onIngredientsChange(e.target.value)}
              placeholder="Ingredientes / descripción (opcional)"
              rows={2}
              className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <button
            onClick={onCreate}
            disabled={!name.trim() || !price || !categoryId}
            className="w-full py-3.5 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Crear Producto
          </button>
        </div>
      </div>
    </div>
  )
}
