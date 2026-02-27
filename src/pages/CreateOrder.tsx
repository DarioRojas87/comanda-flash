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
  XCircle,
  ChevronDown,
  ChevronUp,
  Info,
  Trash2,
  Store,
  ShoppingCart
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useGoogleMaps } from '@/hooks/useGoogleMaps'
import { extractCoordsFromUrl } from '@/utils/googleMapsParser'

interface Product {
  id: string
  name: string
  price: number
  category_id: string | null
  stock: number | null
}

interface Category {
  id: string
  name: string
}

// One entry per UNIT of a product (so 3x hamburgers = 3 CartUnit entries)
interface CartUnit {
  instanceId: string // unique per unit
  product_id: string
  name: string
  price: number
  extras: ExtraEntry[]
}

interface ExtraEntry {
  product_id: string
  name: string
  price: number
  quantity: number
}

// generate a short unique id
const uid = () => Math.random().toString(36).slice(2, 9)

const fetchData = async (): Promise<{ products: Product[]; categories: Category[] }> => {
  const [productsRes, categoriesRes] = await Promise.all([
    supabase.from('products').select('*').eq('active', true).order('name'),
    supabase.from('product_categories').select('*').order('name')
  ])
  if (productsRes.error) throw new Error(productsRes.error.message)
  if (categoriesRes.error) throw new Error(categoriesRes.error.message)
  return { products: productsRes.data || [], categories: categoriesRes.data || [] }
}

export default function CreateOrder() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cart, setCart] = useState<CartUnit[]>([])
  const [openExtraFor, setOpenExtraFor] = useState<string | null>(null) // instanceId
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})
  const [pickupInStore, setPickupInStore] = useState(false)

  const { processShortUrl, loading: expandingCoords } = useGoogleMaps()

  const { data, isLoading: loadingData } = useQuery({
    queryKey: ['createOrderData'],
    queryFn: fetchData
  })

  const products = data?.products || []
  const categories = data?.categories || []
  const agregadosCategory = categories.find((c) => c.name === 'Agregados')
  const agregadosProducts = products.filter((p) => p.category_id === agregadosCategory?.id)

  const toggleCategory = (categoryId: string) =>
    setExpandedCategories((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }))

  // ── Cart helpers ──────────────────────────────────────────────────────────

  const addUnit = (product: Product) => {
    // Check max stock: count existing units of this product
    const currentCount = cart.filter((u) => u.product_id === product.id).length
    if (product.stock !== null && currentCount >= product.stock) return
    setCart((prev) => [
      ...prev,
      {
        instanceId: uid(),
        product_id: product.id,
        name: product.name,
        price: product.price,
        extras: []
      }
    ])
  }

  const removeUnit = (instanceId: string) => {
    setCart((prev) => prev.filter((u) => u.instanceId !== instanceId))
    if (openExtraFor === instanceId) setOpenExtraFor(null)
  }

  const addExtra = (instanceId: string, extra: Product) => {
    setCart((prev) =>
      prev.map((u) => {
        if (u.instanceId !== instanceId) return u
        const existing = u.extras.find((e) => e.product_id === extra.id)
        if (existing) {
          return {
            ...u,
            extras: u.extras.map((e) =>
              e.product_id === extra.id ? { ...e, quantity: e.quantity + 1 } : e
            )
          }
        }
        return {
          ...u,
          extras: [
            ...u.extras,
            { product_id: extra.id, name: extra.name, price: extra.price, quantity: 1 }
          ]
        }
      })
    )
  }

  const removeExtra = (instanceId: string, extraProductId: string) => {
    setCart((prev) =>
      prev.map((u) => {
        if (u.instanceId !== instanceId) return u
        const existing = u.extras.find((e) => e.product_id === extraProductId)
        if (!existing) return u
        if (existing.quantity > 1) {
          return {
            ...u,
            extras: u.extras.map((e) =>
              e.product_id === extraProductId ? { ...e, quantity: e.quantity - 1 } : e
            )
          }
        }
        return { ...u, extras: u.extras.filter((e) => e.product_id !== extraProductId) }
      })
    )
  }

  const getTotal = () =>
    cart.reduce(
      (sum, u) => sum + u.price + u.extras.reduce((s, e) => s + e.price * e.quantity, 0),
      0
    )

  const unitCountForProduct = (productId: string) =>
    cart.filter((u) => u.product_id === productId).length

  // ── Formik ────────────────────────────────────────────────────────────────

  const formik = useFormik({
    initialValues: {
      customer_name: '',
      address_text: '',
      location_url: '',
      indicaciones: '',
      notes: '',
      is_paid: false
    },
    validate: (values) => {
      const errors: Record<string, string> = {}

      if (!pickupInStore) {
        if (!values.address_text && !values.location_url) {
          errors.address_text = 'Debes ingresar una dirección o un link de ubicación.'
        }

        if (values.address_text) {
          const address = values.address_text.trim()
          const hasLetters = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(address)
          const hasNumbers = /[0-9]/.test(address)
          const isUrl =
            /^(http|https):\/\//.test(address) ||
            address.includes('www.') ||
            address.includes('.com')
          if (isUrl)
            errors.address_text = 'La dirección no puede ser un link. Usa el campo de abajo.'
          else if (!hasLetters || !hasNumbers)
            errors.address_text = 'La dirección debe incluir calle y número.'
        }

        if (values.location_url) {
          const url = values.location_url.trim()
          const startsWithHttp = /^https?:\/\//.test(url)
          const isShort = /^(https?:\/\/)(maps\.app\.goo\.gl|goo\.gl)\//.test(url)
          const hasCoords = extractCoordsFromUrl(url) !== null
          if (!startsWithHttp || (!isShort && !hasCoords)) {
            errors.location_url = 'Asegúrate de que sea un link de Maps válido (https://...)'
          }
        }
      }

      return errors
    },
    onSubmit: async (values) => {
      if (cart.length === 0) {
        setError('Debes agregar al menos un producto al pedido.')
        return
      }
      setLoading(true)
      setError(null)

      try {
        let coords = extractCoordsFromUrl(values.location_url)
        if (!coords && values.location_url.includes('goo.gl')) {
          coords = await processShortUrl(values.location_url)
        }
        if (!coords && values.location_url.trim() !== '') {
          throw new Error('No se pudieron extraer las coordenadas del link proporcionado.')
        }

        const total_amount = getTotal()

        // Flatten cart to RPC items with instance_id for parent-child linking
        const rpcItems: object[] = []
        for (const unit of cart) {
          rpcItems.push({
            instance_id: unit.instanceId,
            product_id: unit.product_id,
            quantity: 1,
            unit_price: unit.price
          })
          for (const extra of unit.extras) {
            rpcItems.push({
              instance_id: uid(),
              product_id: extra.product_id,
              quantity: extra.quantity,
              unit_price: extra.price,
              parent_instance_id: unit.instanceId
            })
          }
        }

        const orderPayload = {
          p_customer_name: values.customer_name,
          p_address_text: pickupInStore ? null : values.address_text || null,
          p_location_url: pickupInStore ? null : values.location_url || null,
          p_lat: pickupInStore ? null : (coords?.lat ?? null),
          p_lng: pickupInStore ? null : (coords?.lng ?? null),
          p_is_paid: values.is_paid,
          p_total_amount: total_amount,
          p_notes: values.notes || null,
          p_indicaciones: pickupInStore ? 'Retira en local' : values.indicaciones || null,
          p_items: rpcItems
        }

        const { error: orderError } = await supabase.rpc('create_order_with_stock', orderPayload)
        if (orderError) throw new Error(orderError.message || JSON.stringify(orderError))

        navigate('/comanda')
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al crear el pedido')
      } finally {
        setLoading(false)
      }
    }
  })

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
          {/* ── Pickup in store toggle ── */}
          <section className="bg-surface-dark p-4 rounded-3xl border border-border-dark">
            <button
              type="button"
              onClick={() => setPickupInStore((v) => !v)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border font-bold text-sm transition-all ${pickupInStore ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-background-dark border-border-dark text-text-muted hover:text-white'}`}
            >
              <span className="flex items-center gap-2">
                <Store className="w-4 h-4" />
                Retira del local
              </span>
              <span
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${pickupInStore ? 'bg-blue-500 border-blue-500' : 'border-border-dark'}`}
              >
                {pickupInStore && <CheckCircle2 className="w-3 h-3 text-white" />}
              </span>
            </button>
            {pickupInStore && (
              <p className="text-xs text-blue-400/70 mt-2 ml-1">
                No se requiere dirección ni ubicación GPS.
              </p>
            )}
          </section>

          {/* ── Customer Details ── */}
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

            {!pickupInStore && (
              <>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1.5 ml-1">
                    Dirección Física
                  </label>
                  <input
                    name="address_text"
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    value={formik.values.address_text}
                    className={`w-full bg-background-dark border text-white rounded-2xl px-4 py-3.5 focus:ring-1 outline-none transition-all placeholder:text-slate-600 ${formik.errors.address_text && formik.touched.address_text ? 'border-red-500/50 focus:ring-red-500' : 'border-border-dark focus:ring-primary focus:border-primary'}`}
                    placeholder="Calle Falsa 123"
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
                    className={`w-full bg-background-dark border text-white rounded-2xl px-4 py-3.5 focus:ring-1 outline-none transition-all placeholder:text-slate-600 font-mono text-sm ${formik.errors.location_url && formik.touched.location_url ? 'border-red-500/50 focus:ring-red-500' : 'border-border-dark focus:ring-primary focus:border-primary'}`}
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

                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1.5 ml-1 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Indicaciones de entrega
                  </label>
                  <input
                    name="indicaciones"
                    onChange={formik.handleChange}
                    value={formik.values.indicaciones}
                    className="w-full bg-background-dark border border-border-dark text-white rounded-2xl px-4 py-3.5 focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-slate-600"
                    placeholder="Ej: Casa rejas negras, frente al hospital, timbre roto"
                  />
                </div>
              </>
            )}
          </section>

          {/* ── Product Selector (all categories including Agregados) ── */}
          <section className="bg-surface-dark p-5 rounded-3xl border border-border-dark space-y-4">
            <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Tag className="w-4 h-4" /> Agregar Productos
            </h2>

            {loadingData ? (
              <p className="text-sm text-text-muted text-center py-4">Cargando menú...</p>
            ) : products.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">
                No hay productos disponibles.
              </p>
            ) : (
              <div className="grid gap-3">
                {categories.map((cat) => {
                  const catProducts = products.filter((p) => p.category_id === cat.id)
                  if (catProducts.length === 0) return null
                  const isExpanded = categories.length === 1 ? true : !!expandedCategories[cat.id]
                  const isAgregados = cat.name === 'Agregados'

                  return (
                    <div
                      key={`ord-cat-${cat.id}`}
                      className={`border rounded-2xl overflow-hidden bg-background-dark ${isAgregados ? 'border-yellow-500/25' : 'border-border-dark'}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className={`w-full flex items-center justify-between p-4 transition-colors ${isAgregados ? 'bg-yellow-500/5 hover:bg-yellow-500/10' : 'bg-surface-dark/50 hover:bg-surface-dark'}`}
                      >
                        <span
                          className={`font-bold text-base ${isAgregados ? 'text-yellow-300' : 'text-white'}`}
                        >
                          {cat.name}
                        </span>
                        <span className="text-text-muted flex items-center gap-2 text-xs">
                          {catProducts.length} productos
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="p-3 grid gap-2">
                          {catProducts.map((prod) => {
                            const qty = unitCountForProduct(prod.id)
                            const stockLeft = prod.stock !== null ? prod.stock - qty : null
                            return (
                              <div
                                key={prod.id}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${qty > 0 ? (isAgregados ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-primary/10 border-primary/40') : 'bg-background-dark border-border-dark'}`}
                              >
                                <div>
                                  <p className="font-semibold text-white text-sm">{prod.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-text-secondary text-xs">${prod.price}</p>
                                    {stockLeft !== null && (
                                      <span className="text-[10px] font-mono bg-background-dark border border-border-dark px-1.5 rounded text-text-muted">
                                        Quedan: {stockLeft}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {qty > 0 && (
                                    <span
                                      className={`text-sm font-black ${isAgregados ? 'text-yellow-300' : 'text-primary'}`}
                                    >
                                      ×{qty}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => addUnit(prod)}
                                    disabled={stockLeft !== null && stockLeft <= 0}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors disabled:opacity-30 ${qty > 0 ? (isAgregados ? 'bg-yellow-500 text-white' : 'bg-primary text-white') : 'bg-surface-dark border border-border-dark text-text-secondary hover:text-white'}`}
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* ── Cart Summary — one card per unit ── */}
          {cart.length > 0 && (
            <section className="bg-surface-dark p-5 rounded-3xl border border-border-dark space-y-3">
              <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> Pedido actual ({cart.length} unidades)
              </h2>

              {cart.map((unit) => (
                <div
                  key={unit.instanceId}
                  className="bg-background-dark border border-border-dark rounded-2xl overflow-hidden"
                >
                  {/* Unit header */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="font-bold text-white text-sm">{unit.name}</p>
                      <p className="text-primary font-mono text-xs">${unit.price}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Toggle extras panel */}
                      {agregadosProducts.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpenExtraFor(
                              openExtraFor === unit.instanceId ? null : unit.instanceId
                            )
                          }
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${openExtraFor === unit.instanceId ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' : 'bg-surface-dark border-border-dark text-text-muted hover:text-yellow-400 hover:border-yellow-500/40'}`}
                        >
                          <Plus className="w-3 h-3" /> Extra
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeUnit(unit.instanceId)}
                        className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Extras already attached */}
                  {unit.extras.length > 0 && (
                    <div className="px-4 pb-2 space-y-1">
                      {unit.extras.map((extra) => (
                        <div
                          key={extra.product_id}
                          className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-yellow-400 text-xs">↳</span>
                            <span className="text-yellow-200 text-xs font-semibold">
                              {extra.name}
                            </span>
                            <span className="text-yellow-500/60 text-[10px]">+${extra.price}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => removeExtra(unit.instanceId, extra.product_id)}
                              className="w-5 h-5 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 hover:bg-yellow-500/20"
                            >
                              <Minus className="w-2.5 h-2.5" />
                            </button>
                            <span className="text-yellow-300 font-black text-xs w-3 text-center">
                              {extra.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                addExtra(
                                  unit.instanceId,
                                  products.find((p) => p.id === extra.product_id)!
                                )
                              }
                              className="w-5 h-5 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 hover:bg-yellow-500/20"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Extra selector */}
                  {openExtraFor === unit.instanceId && (
                    <div className="border-t border-yellow-500/20 bg-yellow-500/5 px-4 py-3 space-y-2">
                      <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">
                        Extras para "{unit.name}"
                      </p>
                      {agregadosProducts.map((extra) => {
                        const existingQty =
                          unit.extras.find((e) => e.product_id === extra.id)?.quantity || 0
                        return (
                          <div key={extra.id} className="flex items-center justify-between">
                            <div>
                              <p className="text-white text-xs font-semibold">{extra.name}</p>
                              <p className="text-text-muted text-[10px]">+${extra.price}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {existingQty > 0 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => removeExtra(unit.instanceId, extra.id)}
                                    className="w-6 h-6 rounded-full bg-background-dark border border-border-dark flex items-center justify-center text-text-secondary hover:text-white"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="font-black text-white text-sm w-4 text-center">
                                    {existingQty}
                                  </span>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => addExtra(unit.instanceId, extra)}
                                className="w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-yellow-400 hover:bg-yellow-500/30"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* ── Notes ── */}
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

          {/* ── Payment & Submit ── */}
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
              disabled={loading || expandingCoords || cart.length === 0}
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
