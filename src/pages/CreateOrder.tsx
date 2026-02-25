import { useState } from 'react'
import { useFormik } from 'formik'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import {
  MapPin,
  ShoppingBag,
  Plus,
  Minus,
  Tag,
  CheckCircle2,
  StickyNote,
  XCircle
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useGoogleMaps } from '@/hooks/useGoogleMaps'
import { extractCoordsFromUrl } from '@/utils/googleMapsParser'

interface Product {
  id: string
  name: string
  price: number
}

const fetchProducts = async (): Promise<Product[]> => {
  const { data, error } = await supabase.from('products').select('*').eq('active', true)
  if (error) throw new Error(error.message)
  return data || []
}

export default function CreateOrder() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { processShortUrl, loading: expandingCoords } = useGoogleMaps()

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts
  })

  const formik = useFormik({
    initialValues: {
      customer_name: '',
      address_text: '',
      location_url: '',
      notes: '',
      is_paid: false,
      items: [] as { product_id: string; quantity: number; price: number; name: string }[]
    },
    validate: (values) => {
      const errors: Record<string, string> = {}

      if (!values.address_text && !values.location_url) {
        errors.address_text = 'Debes ingresar una dirección o un link de ubicación.'
      }

      if (values.address_text) {
        const address = values.address_text.trim()
        const hasLetters = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(address)
        const hasNumbers = /[0-9]/.test(address)
        const isUrl =
          /^(http|https):\/\//.test(address) || address.includes('www.') || address.includes('.com')

        if (isUrl) {
          errors.address_text = 'La dirección no puede ser un link. Usa el campo de abajo.'
        } else if (!hasLetters || !hasNumbers) {
          errors.address_text = 'La dirección debe incluir calle y número.'
        }
      }

      if (values.location_url) {
        const url = values.location_url.trim()
        const startsWithHttp = /^https?:\/\//.test(url)
        const isGoogleMapsShort = /^(https?:\/\/)(maps\.app\.goo\.gl|goo\.gl)\//.test(url)
        const hasDirectCoords = extractCoordsFromUrl(url) !== null

        if (!startsWithHttp || (!isGoogleMapsShort && !hasDirectCoords)) {
          errors.location_url = 'Asegúrate de que sea un link de Maps válido (https://...)'
        }
      }

      return errors
    },
    onSubmit: async (values) => {
      if (values.items.length === 0) {
        setError('Debes agregar al menos un producto al pedido.')
        return
      }
      setLoading(true)
      setError(null)

      try {
        let coords = extractCoordsFromUrl(values.location_url)

        // If not found in the URL, check if it's a short URL and expand it
        if (!coords && values.location_url.includes('goo.gl')) {
          coords = await processShortUrl(values.location_url)
        }

        // Si no tenemos coords y ademas el user escribio un link, tirar error fuerte
        if (!coords && values.location_url.trim() !== '') {
          throw new Error('No se pudieron extraer las coordenadas del link proporcionado.')
        }

        const total_amount = values.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

        // 1. Insert Order
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .insert({
            customer_name: values.customer_name,
            address_text: values.address_text,
            location_url: values.location_url,
            lat: coords?.lat,
            lng: coords?.lng,
            is_paid: values.is_paid,
            total_amount,
            notes: values.notes || null,
            status: 'pending'
          })
          .select()
          .single()

        if (orderError) throw orderError

        // 2. Insert Items into order_items table
        const orderItems = values.items.map((i) => ({
          order_id: orderData.id,
          product_id: i.product_id,
          quantity: i.quantity,
          subtotal: i.price * i.quantity
        }))

        const { error: itemsError } = await supabase.from('order_items').insert(orderItems)
        if (itemsError) throw itemsError

        navigate('/comanda')
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('Error al crear el pedido')
        }
      } finally {
        setLoading(false)
      }
    }
  })

  const handleItemToggle = (product: Product) => {
    const existing = formik.values.items.find((i) => i.product_id === product.id)
    if (existing) {
      formik.setFieldValue(
        'items',
        formik.values.items.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      )
    } else {
      formik.setFieldValue('items', [
        ...formik.values.items,
        { product_id: product.id, quantity: 1, price: product.price, name: product.name }
      ])
    }
  }

  const handleItemRemove = (productId: string) => {
    const existing = formik.values.items.find((i) => i.product_id === productId)
    if (existing && existing.quantity > 1) {
      formik.setFieldValue(
        'items',
        formik.values.items.map((i) =>
          i.product_id === productId ? { ...i, quantity: i.quantity - 1 } : i
        )
      )
    } else {
      formik.setFieldValue(
        'items',
        formik.values.items.filter((i) => i.product_id !== productId)
      )
    }
  }

  const getTotal = () =>
    formik.values.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-24">
      <div className="p-4 bg-surface-dark sticky top-0 z-10 border-b border-border-dark flex items-center gap-3 shadow-sm">
        <ShoppingBag className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-white">Nuevo Pedido</h1>
      </div>

      <div className="p-4 space-y-6">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl text-red-500 text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={formik.handleSubmit} className="space-y-6">
          {/* Customer Details */}
          <section className="bg-surface-dark p-5 rounded-3xl border border-border-dark space-y-4">
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-2">
              Datos del Cliente
            </h2>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5 ml-1">
                Nombre Completo
              </label>
              <input
                name="customer_name"
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.customer_name}
                className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-slate-600"
                placeholder="Ej. Juan Pérez"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5 ml-1">
                Dirección Física
              </label>
              <input
                name="address_text"
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.address_text}
                className={`w-full bg-background-dark border text-white rounded-2xl px-4 py-3.5 focus:ring-1 outline-none transition-all placeholder:text-slate-600 ${formik.errors.address_text && formik.touched.address_text ? 'border-red-500/50 focus:ring-red-500 focus:border-red-500' : 'border-border-dark focus:ring-primary focus:border-primary'}`}
                placeholder="Calle Falsa 123"
                required={!formik.values.location_url}
              />
              {formik.errors.address_text && formik.touched.address_text && (
                <p className="text-xs text-red-500 mt-1.5 ml-1">
                  {formik.errors.address_text as string}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5 ml-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> Link de Google Maps / WhatsApp
              </label>
              <input
                name="location_url"
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                value={formik.values.location_url}
                className={`w-full bg-background-dark border text-white rounded-2xl px-4 py-3.5 focus:ring-1 outline-none transition-all placeholder:text-slate-600 font-mono text-sm ${formik.errors.location_url && formik.touched.location_url ? 'border-red-500/50 focus:ring-red-500 focus:border-red-500' : 'border-border-dark focus:ring-primary focus:border-primary'}`}
                placeholder="https://maps.app.goo.gl/..."
              />
              {formik.errors.location_url && formik.touched.location_url ? (
                <p className="text-xs text-red-500 mt-1.5 ml-1 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> {formik.errors.location_url as string}
                </p>
              ) : formik.values.location_url && !formik.errors.location_url ? (
                <p className="text-xs text-green-500 mt-2 ml-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Link válido{' '}
                  {formik.values.location_url.includes('goo.gl')
                    ? '(se expandirá)'
                    : '(coordenadas ok)'}
                </p>
              ) : null}
            </div>
          </section>

          {/* Product Selection */}
          <section className="bg-surface-dark p-5 rounded-3xl border border-border-dark space-y-4">
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-2 flex items-center gap-2">
              <Tag className="w-4 h-4" /> Productos
            </h2>

            {products.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">Cargando productos...</p>
            ) : (
              <div className="grid gap-3">
                {products.map((prod) => {
                  const item = formik.values.items.find((i) => i.product_id === prod.id)
                  const qty = item?.quantity || 0

                  return (
                    <div
                      key={prod.id}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-colors ${qty > 0 ? 'bg-primary/10 border-primary/40' : 'bg-background-dark border-border-dark'}`}
                    >
                      <div>
                        <p className="font-semibold text-white text-sm">{prod.name}</p>
                        <p className="text-text-secondary text-xs mt-0.5">${prod.price}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        {qty > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleItemRemove(prod.id)}
                              className="w-8 h-8 rounded-full bg-surface-dark border border-border-dark flex items-center justify-center text-text-secondary hover:text-white"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="font-black text-white w-5 text-center text-base">
                              {qty}
                            </span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleItemToggle(prod)}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${qty > 0 ? 'bg-primary text-white' : 'bg-surface-dark border border-border-dark text-text-secondary hover:text-white'}`}
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="bg-surface-dark p-5 rounded-3xl border border-border-dark space-y-3">
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <StickyNote className="w-4 h-4" /> Notas del Pedido
            </h2>
            <textarea
              name="notes"
              onChange={formik.handleChange}
              value={formik.values.notes}
              rows={3}
              className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-slate-600 text-sm resize-none"
              placeholder="Ej: Sin aderezos, sin cebolla, extra queso..."
            />
          </section>

          {/* Payment & Submit */}
          <section className="bg-surface-dark p-5 rounded-3xl border border-border-dark space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-white">Estado del Pago</p>
                <p className="text-xs text-text-muted">¿El cliente ya abonó el pedido?</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  name="is_paid"
                  onChange={formik.handleChange}
                  checked={formik.values.is_paid}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-background-dark border-border-dark peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary peer-checked:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>

            <div className="pt-4 border-t border-border-dark flex items-end justify-between">
              <span className="text-text-secondary font-medium">Total</span>
              <span className="text-3xl font-black text-white tracking-tighter">${getTotal()}</span>
            </div>

            <button
              type="submit"
              disabled={loading || expandingCoords || formik.values.items.length === 0}
              className="w-full bg-primary hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-primary focus:ring-4 focus:ring-primary/20 text-white font-bold rounded-2xl py-4 transition-all flex items-center justify-center gap-2 group shadow-xl shadow-primary/20"
            >
              {loading || expandingCoords ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  Confirmar Pedido
                </>
              )}
            </button>
          </section>
        </form>
      </div>
    </div>
  )
}
