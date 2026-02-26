import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ReceiptText,
  MonitorPlay,
  Download,
  Map as MapIcon,
  Menu as MenuIcon,
  Tags,
  Coffee,
  Plus,
  Trash2,
  Pencil,
  X,
  ScrollText,
  ChevronUp,
  ChevronDown
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

// Delivery color palette — one color per driver, assigned by array index
const DELIVERY_COLORS = [
  '#f97316',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#eab308',
  '#ec4899'
]

// Colored circular SVG icon for a delivery driver
const createDriverIcon = (color: string) =>
  new L.DivIcon({
    className: '',
    html: `<div style="
      width:32px;height:32px;
      background:${color};
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    ">
      <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'>
        <circle cx='18.5' cy='17.5' r='3.5'/><circle cx='5.5' cy='17.5' r='3.5'/>
        <path d='M15 6a1 1 0 0 0 0-2h-1l-5 5H1m18.5 0H15'/>
        <path d='m6 17 3-9h5.5l2 5 2 4'/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  })

// Colored teardrop pin icon for an order destination
const createDestIcon = (color: string) =>
  new L.DivIcon({
    className: '',
    html: `<div style="position:relative;width:26px;height:38px;">
      <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 38' width='26' height='38'>
        <path d='M13 0C6 0 0 6 0 13c0 9.5 13 25 13 25S26 22.5 26 13C26 6 20 0 13 0z' fill='${color}' stroke='white' stroke-width='1.5'/>
        <circle cx='13' cy='13' r='5' fill='white' opacity='0.9'/>
      </svg>
    </div>`,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -40]
  })

interface Order {
  id: string
  customer_name: string
  lat: number | null
  lng: number | null
  status: string
  total_amount: number | null
  is_paid: boolean
  delivery_id: string | null
  address_text: string | null
  created_at: string | null
}

interface Profile {
  id: string
  full_name: string
  role: string
  current_lat: number | null
  current_lng: number | null
}

export interface ProductCategory {
  id: string
  name: string
  created_at: string
}

export interface Product {
  id: string
  name: string
  price: number
  active: boolean
  category_id: string | null
  ingredients: string | null
  stock: number | null
}

interface AuditLog {
  id: string
  user_name: string
  action: string
  entity_type: string
  created_at: string
}

const fetchAdminData = async () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const {
    data: { session }
  } = await supabase.auth.getSession()
  const userId = session?.user?.id

  const [ordersRes, profilesRes, categoriesRes, productsRes, adminProfileRes] = await Promise.all([
    supabase.from('orders').select('*').gte('created_at', today.toISOString()),
    supabase.from('profiles').select('*').eq('role', 'delivery'),
    supabase.from('product_categories').select('*').order('name'),
    supabase.from('products').select('*').order('name'),
    userId
      ? supabase.from('profiles').select('*').eq('id', userId).single()
      : Promise.resolve({ data: null, error: null })
  ])

  if (ordersRes.error) throw new Error(ordersRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (categoriesRes.error) throw new Error(categoriesRes.error.message)
  if (productsRes.error) throw new Error(productsRes.error.message)
  if (adminProfileRes.error && adminProfileRes.error.code !== 'PGRST116')
    throw new Error(adminProfileRes.error.message)

  return {
    orders: ordersRes.data as Order[],
    profiles: profilesRes.data as Profile[],
    categories: categoriesRes.data as ProductCategory[],
    products: productsRes.data as Product[],
    adminProfile: adminProfileRes.data as Profile | null
  }
}

export default function AdminDashboard() {
  const { profile: currentProfile } = useAuth()
  const [activeTab, setActiveTab] = useState<'map' | 'menu'>('map')
  const [cashCloseMode, setCashCloseMode] = useState(false)
  const [cashSummary, setCashSummary] = useState({ totalSales: 0, totalLosses: 0 })
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['adminData'],
    queryFn: fetchAdminData
  })

  // Category form state
  const [newCatName, setNewCatName] = useState('')
  const [isAddingCat, setIsAddingCat] = useState(false)
  const [deletingCat, setDeletingCat] = useState<{ id: string; name: string } | null>(null)

  // Create product modal state
  const [showCreateProdModal, setShowCreateProdModal] = useState(false)
  const [newProdName, setNewProdName] = useState('')
  const [newProdPrice, setNewProdPrice] = useState('')
  const [newProdStock, setNewProdStock] = useState('')
  const [newProdCategoryId, setNewProdCategoryId] = useState('')
  const [newProdIngredients, setNewProdIngredients] = useState('')

  // Edit product modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editProdName, setEditProdName] = useState('')
  const [editProdPrice, setEditProdPrice] = useState('')
  const [editProdStock, setEditProdStock] = useState('')
  const [editProdCategoryId, setEditProdCategoryId] = useState('')
  const [editProdIngredients, setEditProdIngredients] = useState('')
  const [editProdActive, setEditProdActive] = useState(true)

  // Audit logs modal state
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Accordion state for product categories
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({})

  // Per-product stock input state (tracks the text value while editing)
  const [editingStock, setEditingStock] = useState<Record<string, string>>({})

  const orders = data?.orders || []
  const profiles = data?.profiles || []
  const categories = data?.categories || []
  const products = data?.products || []

  useEffect(() => {
    const ordersChannel = supabase
      .channel('admin_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['adminData'] })
      })
      .subscribe()

    const profilesChannel = supabase
      .channel('admin_profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['adminData'] })
      })
      .subscribe()

    const productsChannel = supabase
      .channel('admin_products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        queryClient.invalidateQueries({ queryKey: ['adminData'] })
      })
      .subscribe()

    const categoriesChannel = supabase
      .channel('admin_categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_categories' }, () => {
        queryClient.invalidateQueries({ queryKey: ['adminData'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(profilesChannel)
      supabase.removeChannel(productsChannel)
      supabase.removeChannel(categoriesChannel)
    }
  }, [queryClient])

  // Audit log helper
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
      // Non-critical: don't block UX if logging fails
    }
  }

  // Category Management Handlers
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    const { error } = await supabase
      .from('product_categories')
      .insert([{ name: newCatName.trim() }])
    if (error) alert('Error al crear categoría: ' + error.message)
    else {
      await insertAuditLog(`Creó la categoría "${newCatName.trim()}"`, 'category')
      setNewCatName('')
      setIsAddingCat(false)
      refetch()
    }
  }

  const handleDeleteCategory = (id: string, name: string) => {
    if (name === 'General') return
    setDeletingCat({ id, name })
  }

  const confirmDeleteCategory = async () => {
    if (!deletingCat) return
    const { id, name } = deletingCat
    const generalCat = categories.find((c) => c.name === 'General')
    if (generalCat) {
      await supabase.from('products').update({ category_id: generalCat.id }).eq('category_id', id)
    }
    const { error } = await supabase.from('product_categories').delete().eq('id', id)
    if (error) alert('Error al eliminar: ' + error.message)
    else {
      await insertAuditLog(`Eliminó la categoría "${name}"`, 'category')
      setDeletingCat(null)
      refetch()
    }
  }

  // Product Management Handlers
  const handleAddProduct = async () => {
    if (!newProdName.trim() || !newProdPrice || !newProdCategoryId) return
    const { error } = await supabase.from('products').insert([
      {
        name: newProdName.trim(),
        price: parseFloat(newProdPrice),
        category_id: newProdCategoryId,
        ingredients: newProdIngredients.trim() || null,
        active: true,
        stock: newProdStock.trim() === '' ? null : parseInt(newProdStock)
      }
    ])
    if (error) alert('Error al crear producto: ' + error.message)
    else {
      await insertAuditLog(`Creó el producto "${newProdName.trim()}"`, 'product')
      setNewProdName('')
      setNewProdPrice('')
      setNewProdStock('')
      setNewProdCategoryId('')
      setNewProdIngredients('')
      setShowCreateProdModal(false)
      refetch()
    }
  }

  const openEditProduct = (prod: Product) => {
    setEditingProduct(prod)
    setEditProdName(prod.name)
    setEditProdPrice(String(prod.price))
    setEditProdStock(prod.stock !== null ? String(prod.stock) : '')
    setEditProdCategoryId(prod.category_id || '')
    setEditProdIngredients(prod.ingredients || '')
    setEditProdActive(prod.active)
  }

  const handleEditProduct = async () => {
    if (!editingProduct) return
    const { error } = await supabase
      .from('products')
      .update({
        name: editProdName.trim(),
        price: parseFloat(editProdPrice),
        category_id: editProdCategoryId || null,
        ingredients: editProdIngredients.trim() || null,
        stock: editProdStock.trim() === '' ? null : parseInt(editProdStock),
        active: editProdActive
      })
      .eq('id', editingProduct.id)
    if (error) alert('Error al editar producto: ' + error.message)
    else {
      await insertAuditLog(`Editó el producto "${editProdName.trim()}"`, 'product')
      setEditingProduct(null)
      refetch()
    }
  }

  const handleSetStock = async (id: string, value: string) => {
    const parsed = parseInt(value)
    if (value.trim() === '' || isNaN(parsed) || parsed < 0) return
    const { error } = await supabase
      .from('products')
      .update({ stock: parsed, active: parsed > 0 })
      .eq('id', id)
    if (error) alert('Error al actualizar stock: ' + error.message)
    else refetch()
  }

  const handleToggleStockTracking = async (id: string, currentStock: number | null) => {
    const newStock = currentStock === null ? 0 : null
    const { error } = await supabase
      .from('products')
      .update({ stock: newStock, active: newStock === 0 ? false : true })
      .eq('id', id)
    if (error) alert('Error al actualizar stock: ' + error.message)
    else refetch()
  }

  const handleDeleteProduct = async (id: string, name: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) alert('Error al eliminar: ' + error.message)
    else {
      await insertAuditLog(`Eliminó el producto "${name}"`, 'product')
      setEditingProduct(null)
      refetch()
    }
  }

  const handleToggleProductStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('products')
      .update({ active: !currentStatus })
      .eq('id', id)
    if (error) alert('Error al actualizar disponibilidad: ' + error.message)
    else refetch()
  }

  const fetchLogs = async () => {
    setLogsLoading(true)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    await supabase.from('audit_logs').delete().lt('created_at', cutoff.toISOString())
    const { data: logsData } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
    setLogs((logsData as AuditLog[]) || [])
    setLogsLoading(false)
  }

  const handleCashClose = () => {
    const delivered = orders.filter((o) => o.status === 'delivered')
    const failed = orders.filter((o) => o.status === 'failed' || o.status === 'cancelled')
    const totalSales = delivered.reduce((acc, curr) => acc + (curr.total_amount || 0), 0)
    const totalLosses = failed.reduce((acc, curr) => acc + (curr.total_amount || 0), 0)
    setCashSummary({ totalSales, totalLosses })
    setCashCloseMode(true)
  }

  const handleDownloadPDF = () => {
    const doc = new jsPDF()
    const today = new Date().toLocaleDateString('es-AR')
    const deliveredOrders = orders.filter((o) => o.status === 'delivered')
    const failedOrders = orders.filter((o) => o.status === 'failed' || o.status === 'cancelled')

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('ComandaFlash - Resumen de Caja', 14, 20)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Fecha: ${today}`, 14, 28)
    doc.text(
      `Venta Bruta: $${cashSummary.totalSales.toFixed(2)}    Pérdidas: $${cashSummary.totalLosses.toFixed(2)}    Neto: $${(cashSummary.totalSales - cashSummary.totalLosses).toFixed(2)}`,
      14,
      35
    )

    // Group by delivery person
    const deliveryGroups: Record<string, { name: string; orders: Order[] }> = {}
    for (const o of deliveredOrders) {
      const key = o.delivery_id ?? 'sin-asignar'
      const profile = profiles.find((p) => p.id === key)
      const name = profile?.full_name ?? 'Sin asignar'
      if (!deliveryGroups[key]) deliveryGroups[key] = { name, orders: [] }
      deliveryGroups[key].orders.push(o)
    }

    let y = 45
    for (const { name, orders: delivOrders } of Object.values(deliveryGroups)) {
      const subtotal = delivOrders.reduce((a, o) => a + (o.total_amount || 0), 0)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(`Repartidor: ${name}  (Subtotal: $${subtotal.toFixed(2)})`, 14, y)
      y += 4

      autoTable(doc, {
        startY: y,
        head: [['Cliente', 'Dirección', 'Monto', 'Pagado']],
        body: [
          ...delivOrders.map((o) => [
            o.customer_name,
            o.address_text ?? '-',
            `$${(o.total_amount ?? 0).toFixed(2)}`,
            o.is_paid ? 'Sí' : 'No'
          ]),
          [
            { content: 'SUBTOTAL', colSpan: 2, styles: { fontStyle: 'bold' } },
            `$${subtotal.toFixed(2)}`,
            ''
          ]
        ],
        styles: { fontSize: 8 },
        headStyles: { fillColor: [238, 124, 43] },
        margin: { left: 14, right: 14 }
      })
      y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
    }

    if (failedOrders.length > 0) {
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(
        `Pedidos Cancelados / Fallidos (Pérdidas: $${cashSummary.totalLosses.toFixed(2)})`,
        14,
        y
      )
      y += 4
      autoTable(doc, {
        startY: y,
        head: [['Cliente', 'Dirección', 'Monto', 'Estado']],
        body: failedOrders.map((o) => [
          o.customer_name,
          o.address_text ?? '-',
          `$${(o.total_amount ?? 0).toFixed(2)}`,
          o.status
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [239, 68, 68] },
        margin: { left: 14, right: 14 }
      })
    }

    doc.save(`cierre-caja-${today.replace(/\//g, '-')}.pdf`)
  }

  const handleResetDay = () => {
    // Auto-download PDF before closing
    handleDownloadPDF()
    // Mark the close time so Comanda history resets from this point
    localStorage.setItem('cf_last_closed_at', new Date().toISOString())
    setCashCloseMode(false)
  }

  const handleDownload7DayPDF = async () => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data: weekOrders } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', sevenDaysAgo.toISOString())
      .eq('status', 'delivered')
      .order('created_at', { ascending: true })

    if (!weekOrders || weekOrders.length === 0) {
      alert('No hay pedidos entregados en los últimos 7 días.')
      return
    }

    const doc = new jsPDF()
    const from = sevenDaysAgo.toLocaleDateString('es-AR')
    const to = new Date().toLocaleDateString('es-AR')
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('ComandaFlash — Historial 7 Días', 14, 18)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Período: ${from} al ${to}`, 14, 25)

    const total = weekOrders.reduce((a: number, o: Order) => a + (o.total_amount ?? 0), 0)
    doc.text(`Total entregado: $${total.toFixed(2)}   Pedidos: ${weekOrders.length}`, 14, 31)

    autoTable(doc, {
      startY: 38,
      head: [['Fecha', 'Cliente', 'Dirección', 'Monto']],
      body: weekOrders.map((o: Order) => [
        new Date(o.created_at ?? '').toLocaleDateString('es-AR'),
        o.customer_name,
        o.address_text ?? '-',
        `$${(o.total_amount ?? 0).toFixed(2)}`
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 14, right: 14 }
    })

    doc.save(`historial-7dias-${to.replace(/\//g, '-')}.pdf`)
  }

  // Active delivery orders (shipping)
  const shippingOrders = orders.filter((o) => o.status === 'shipping' && o.lat && o.lng)

  return (
    <div className="relative flex flex-col h-full bg-background-light dark:bg-background-dark p-4 gap-4">
      {/* Top Header / Stats Overview + Tabs Nav */}
      <div className="flex flex-col gap-4 shrink-0 mb-2">
        <div className="flex gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <MonitorPlay className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight dark:text-white leading-none">
                Panel <span className="text-primary">Admin</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-text-muted mt-1 font-medium">
                Gestión Central
              </p>
            </div>
          </div>
        </div>

        {/* Custom Tabs */}
        <div className="flex p-1 bg-surface-dark border border-border-dark rounded-xl w-full max-w-sm">
          <button
            onClick={() => setActiveTab('map')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'map' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
          >
            <MapIcon className="w-4 h-4" /> Mapa en Vivo
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'menu' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
          >
            <MenuIcon className="w-4 h-4" /> Gestión Menú
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-border-dark relative shadow-[0_0_30px_rgba(0,0,0,0.5)] bg-surface-dark">
        {isLoading && activeTab === 'map' && (
          <div className="absolute inset-0 z-[500] bg-background-dark/80 backdrop-blur-sm flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        )}

        {/* TAB 1: LIVE MAP */}
        <div className={`w-full h-full relative ${activeTab === 'map' ? 'block' : 'hidden'}`}>
          {!isLoading && (
            <MapContainer
              center={
                data?.adminProfile?.current_lat && data?.adminProfile?.current_lng
                  ? [data.adminProfile.current_lat, data.adminProfile.current_lng]
                  : [-27.0551, -65.3983] // Famaillá, Tucumán default fallback
              }
              zoom={12}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />

              {/* Render Shipping Orders Destinations */}
              {shippingOrders.map((o) => {
                if (o.lat === null || o.lng === null) return null
                const driverIdx = profiles.findIndex((p) => p.id === o.delivery_id)
                const color =
                  driverIdx >= 0 ? DELIVERY_COLORS[driverIdx % DELIVERY_COLORS.length] : '#ef4444'
                const driverName = driverIdx >= 0 ? profiles[driverIdx].full_name : null
                return (
                  <Marker
                    key={`order-${o.id}`}
                    position={[o.lat, o.lng]}
                    icon={createDestIcon(color)}
                  >
                    <Popup className="custom-popup">
                      <strong className="text-slate-900">{o.customer_name}</strong>
                      <br />
                      {driverName && (
                        <span
                          className="inline-flex items-center gap-1 text-xs font-bold mt-1"
                          style={{ color }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: color
                            }}
                          />
                          {driverName}
                        </span>
                      )}
                    </Popup>
                  </Marker>
                )
              })}

              {/* Render Delivery Driver Live Locations */}
              {profiles
                .filter((p) => p.current_lat && p.current_lng)
                .map((p, idx) => (
                  <Marker
                    key={`profile-${p.id}`}
                    position={[p.current_lat!, p.current_lng!]}
                    icon={createDriverIcon(DELIVERY_COLORS[idx % DELIVERY_COLORS.length])}
                  >
                    <Popup>
                      <strong className="text-slate-900">🛵 {p.full_name}</strong>
                    </Popup>
                  </Marker>
                ))}
            </MapContainer>
          )}

          {/* Delivery Legend + status counters */}
          <div className="absolute top-4 right-4 z-[400] bg-surface-dark/95 backdrop-blur shadow-2xl rounded-2xl p-4 border border-border-dark flex flex-col gap-3 min-w-[180px] max-w-[220px]">
            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">
              Repartidores
            </p>
            {profiles.length === 0 && (
              <p className="text-xs text-text-muted italic">Sin repartidores</p>
            )}
            {profiles.map((p, idx) => {
              const color = DELIVERY_COLORS[idx % DELIVERY_COLORS.length]
              const orderCount = shippingOrders.filter((o) => o.delivery_id === p.id).length
              const isOnline = !!(p.current_lat && p.current_lng)
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <span
                    style={{ background: color }}
                    className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-white/20"
                  />
                  <span className="text-xs font-bold text-white truncate flex-1">
                    {p.full_name}
                  </span>
                  {orderCount > 0 && (
                    <span
                      style={{ background: color }}
                      className="text-[10px] font-black text-white px-1.5 py-0.5 rounded-full leading-none"
                    >
                      {orderCount}
                    </span>
                  )}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isOnline ? 'bg-green-400 animate-pulse' : 'bg-slate-600'
                    }`}
                    title={isOnline ? 'En línea' : 'Sin ubicación'}
                  />
                </div>
              )
            })}
            <div className="border-t border-border-dark pt-2 mt-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                En camino
              </span>
              <span className="bg-primary/20 text-primary border border-primary/30 text-xs font-black px-2 py-0.5 rounded-md">
                {shippingOrders.length}
              </span>
            </div>
          </div>
        </div>

        {/* TAB 2: MENU MANAGEMENT */}
        <div
          className={`w-full h-full flex flex-col p-4 overflow-y-auto ${activeTab === 'menu' ? 'block' : 'hidden'}`}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-background-dark border border-border-dark p-5 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-text-muted uppercase tracking-wider mb-1">
                  Venta Bruta Diaria
                </p>
                <p className="text-3xl font-black text-white">
                  $
                  {orders
                    .filter((o) => o.status === 'delivered')
                    .reduce((acc, curr) => acc + (curr.total_amount || 0), 0)
                    .toFixed(0)}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center">
                <ReceiptText className="w-6 h-6 text-green-400" />
              </div>
            </div>

            <div className="md:col-span-2 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowLogsModal(true); fetchLogs() }}
                className="bg-background-dark border border-border-dark hover:border-purple-500/50 text-white font-bold h-12 px-5 rounded-2xl shadow-lg flex items-center gap-2 transition-all cursor-pointer group"
              >
                <ScrollText className="w-5 h-5 text-purple-400 group-hover:scale-110 transition-transform" />
                <span className="text-sm">Logs</span>
              </button>
              <button
                onClick={handleCashClose}
                className="bg-background-dark border border-border-dark hover:border-primary/50 text-white font-bold h-12 px-6 rounded-2xl shadow-lg flex items-center gap-3 transition-all cursor-pointer group"
              >
                <ReceiptText className="w-5 h-5 text-green-400 group-hover:scale-110 transition-transform" />
                <span className="text-sm">Realizar Cierre de Caja</span>
              </button>
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Categories Section */}
            <div className="bg-background-dark rounded-2xl border border-border-dark p-0 flex flex-col overflow-hidden">
              <div className="p-5 border-b border-border-dark flex items-center justify-between bg-surface-dark/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Tags className="w-5 h-5 text-primary" /> Categorías
                </h3>
                <button
                  onClick={() => setIsAddingCat(!isAddingCat)}
                  className={`p-2 rounded-lg transition-colors border ${isAddingCat ? 'bg-primary text-white border-transparent' : 'text-primary border-primary/30 hover:bg-primary hover:text-white hover:border-transparent'}`}
                >
                  {isAddingCat ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </button>
              </div>

              {isAddingCat && (
                <div className="p-4 bg-primary/5 border-b border-border-dark flex gap-2">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="Nombre de nueva categoría..."
                    className="flex-1 bg-background-dark border border-border-dark rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  />
                  <button
                    onClick={handleAddCategory}
                    disabled={!newCatName.trim()}
                    className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                  >
                    Guardar
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-2">
                {categories.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-8">
                    No hay categorías. Crea una.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {categories.map((cat) => (
                      <li
                        key={cat.id}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 group transition-colors"
                      >
                        <span className="text-slate-200 font-medium">{cat.name}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {cat.name !== 'General' && (
                            <button
                              onClick={() => handleDeleteCategory(cat.id, cat.name)}
                              className="p-1.5 text-red-400 hover:bg-red-400/20 rounded-md"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Products Section */}
            <div className="bg-background-dark rounded-2xl border border-border-dark p-0 flex flex-col overflow-hidden">
              <div className="p-5 border-b border-border-dark flex items-center justify-between bg-surface-dark/50">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Coffee className="w-5 h-5 text-primary" /> Productos del Menú
                </h3>
                <button
                  onClick={() => setShowCreateProdModal(true)}
                  className="p-2 rounded-lg transition-colors border text-primary border-primary/30 hover:bg-primary hover:text-white hover:border-transparent"
                  title="Nuevo producto"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {categories.map((cat) => {
                  const catProducts = products.filter((p) => p.category_id === cat.id)
                  if (catProducts.length === 0) return null

                  const isExpanded = expandedCats[cat.id] ?? catProducts.length <= 6

                  return (
                    <div
                      key={`prod-cat-${cat.id}`}
                      className="bg-surface-dark/30 border border-border-dark rounded-xl overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedCats((prev) => ({ ...prev, [cat.id]: !isExpanded }))
                        }
                        className="w-full flex items-center justify-between p-4 text-left group hover:bg-white/5 transition-colors"
                      >
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                          {cat.name}
                          <span className="text-xs font-mono bg-background-dark/50 border border-border-dark px-2 py-0.5 rounded-full text-text-muted">
                            {catProducts.length}
                          </span>
                        </h4>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-text-muted group-hover:text-primary transition-colors" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-text-muted group-hover:text-primary transition-colors" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="p-4 pt-4 space-y-2 border-t border-border-dark/50">
                          {catProducts.map((prod) => (
                            <div
                              key={prod.id}
                              className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface-dark border border-border-dark rounded-xl hover:bg-white/5 transition-colors group"
                            >
                              <div className="flex flex-col min-w-[120px] flex-1">
                                <span className="text-white font-bold leading-tight">
                                  {prod.name}
                                </span>
                                <span className="text-primary font-mono text-sm">
                                  ${prod.price}
                                </span>
                                {prod.stock !== null && (
                                  <span className="text-sm font-mono bg-background-dark/50 border border-border-dark px-2.5 py-0.5 rounded-md text-text-muted mt-1 w-fit">
                                    Stock: {prod.stock}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Disable Stock Tracking Button */}
                                {prod.stock !== null && (
                                  <button
                                    onClick={() => handleToggleStockTracking(prod.id, prod.stock)}
                                    className="w-9 h-9 flex items-center justify-center bg-background-dark/50 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors text-base border border-border-dark/60 hover:border-red-500/30"
                                    title="Desactivar control de stock"
                                  >
                                    ∞
                                  </button>
                                )}

                                {/* Stock Controls */}
                                <div className="flex items-center gap-1 bg-background-dark/50 rounded-lg border border-border-dark/60 p-1 mr-2">
                                  {prod.stock !== null ? (
                                    <input
                                      type="number"
                                      min="0"
                                      value={editingStock[prod.id] ?? String(prod.stock)}
                                      onChange={(e) =>
                                        setEditingStock((prev) => ({
                                          ...prev,
                                          [prod.id]: e.target.value
                                        }))
                                      }
                                      onBlur={(e) => {
                                        handleSetStock(prod.id, e.target.value)
                                        setEditingStock((prev) => {
                                          const next = { ...prev }
                                          delete next[prod.id]
                                          return next
                                        })
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.currentTarget.blur()
                                        }
                                      }}
                                      className="w-16 h-8 text-center text-base font-mono font-bold text-white bg-transparent outline-none border-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => handleToggleStockTracking(prod.id, prod.stock)}
                                      className="px-4 py-2 h-8 flex items-center justify-center text-text-muted hover:text-white hover:bg-white/10 rounded-md transition-colors text-xs font-medium"
                                    >
                                      Controlar Stock
                                    </button>
                                  )}
                                </div>

                                <button
                                  onClick={() => handleToggleProductStatus(prod.id, prod.active)}
                                  className={`text-[10px] font-bold px-3 py-1.5 rounded-md uppercase tracking-wide transition-all ${prod.active ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                                >
                                  {prod.active ? 'Disponible' : 'Agotado'}
                                </button>
                                <button
                                  onClick={() => openEditProduct(prod)}
                                  className="p-2 text-text-muted hover:text-primary hover:bg-primary/20 rounded-md transition-colors"
                                  title="Editar producto"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm(`¿Eliminar "${prod.name}"?`))
                                      handleDeleteProduct(prod.id, prod.name)
                                  }}
                                  className="p-2 text-text-muted hover:text-red-400 hover:bg-red-400/20 rounded-md transition-colors"
                                  title="Eliminar producto"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                {products.length === 0 && (
                  <p className="text-sm text-text-muted text-center py-4">
                    No hay productos creados.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Category Modal */}
      {deletingCat && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-surface-dark w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-border-dark">
            <div className="flex items-center justify-center w-14 h-14 bg-red-500/10 rounded-full mx-auto mb-4 border border-red-500/20">
              <Trash2 className="w-7 h-7 text-red-400" />
            </div>
            <h2 className="text-xl font-black text-center text-white mb-2">Eliminar Categoría</h2>
            <p className="text-sm text-text-muted text-center mb-6 leading-relaxed">
              Los productos de <span className="text-white font-bold">"{deletingCat.name}"</span> pasarán
              automáticamente a la categoría <span className="text-primary font-bold">General</span>.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingCat(null)} className="flex-1 py-3 rounded-2xl bg-background-dark border border-border-dark text-text-muted font-bold hover:text-white transition-all text-sm">Cancelar</button>
              <button onClick={confirmDeleteCategory} className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-bold transition-all text-sm">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Product Modal */}
      {showCreateProdModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface-dark w-full max-w-md rounded-3xl shadow-2xl border border-border-dark">
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-white">Nuevo Producto</h2>
                <button onClick={() => setShowCreateProdModal(false)} className="w-8 h-8 rounded-full bg-background-dark flex items-center justify-center text-text-secondary hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <input type="text" value={newProdName} onChange={(e) => setNewProdName(e.target.value)} placeholder="Nombre del producto *" className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" value={newProdPrice} onChange={(e) => setNewProdPrice(e.target.value)} placeholder="Precio *" min="0" step="0.01" className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary" />
                  <input type="number" value={newProdStock} onChange={(e) => setNewProdStock(e.target.value)} placeholder="Stock (opcional)" min="0" className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary" />
                </div>
                <select value={newProdCategoryId} onChange={(e) => setNewProdCategoryId(e.target.value)} className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary">
                  <option value="">Seleccionar categoría *</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <textarea value={newProdIngredients} onChange={(e) => setNewProdIngredients(e.target.value)} placeholder="Ingredientes / descripción (opcional)" rows={2} className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary resize-none" />
              </div>
              <button onClick={handleAddProduct} disabled={!newProdName.trim() || !newProdPrice || !newProdCategoryId} className="w-full py-3.5 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Crear Producto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface-dark w-full max-w-md rounded-3xl shadow-2xl border border-border-dark">
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-black text-white">Editar Producto</h2>
                <button onClick={() => setEditingProduct(null)} className="w-8 h-8 rounded-full bg-background-dark flex items-center justify-center text-text-secondary hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <input type="text" value={editProdName} onChange={(e) => setEditProdName(e.target.value)} placeholder="Nombre del producto" className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" value={editProdPrice} onChange={(e) => setEditProdPrice(e.target.value)} placeholder="Precio" min="0" step="0.01" className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary" />
                  <input type="number" value={editProdStock} onChange={(e) => setEditProdStock(e.target.value)} placeholder="Stock (vacío = sin límite)" min="0" className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary" />
                </div>
                <select value={editProdCategoryId} onChange={(e) => setEditProdCategoryId(e.target.value)} className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary">
                  <option value="">Sin categoría</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <textarea value={editProdIngredients} onChange={(e) => setEditProdIngredients(e.target.value)} placeholder="Ingredientes / descripción" rows={2} className="w-full bg-background-dark border border-border-dark rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary resize-none" />
                <button onClick={() => setEditProdActive((v) => !v)} className={`w-full py-2.5 rounded-2xl text-sm font-bold transition-all border ${editProdActive ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-red-500/20 border-red-500/30 text-red-400'}`}>
                  {editProdActive ? '✓ Disponible' : '✗ Agotado'} — toca para cambiar
                </button>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { if (confirm(`¿Eliminar "${editingProduct.name}" permanentemente?`)) handleDeleteProduct(editingProduct.id, editingProduct.name) }} className="py-3 px-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold hover:bg-red-500/20 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={handleEditProduct} disabled={!editProdName.trim() || !editProdPrice} className="flex-1 py-3 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white font-bold rounded-2xl transition-all text-sm">Guardar Cambios</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-surface-dark w-full max-w-lg rounded-3xl shadow-2xl border border-border-dark flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center p-6 border-b border-border-dark shrink-0">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2"><ScrollText className="w-5 h-5 text-purple-400" /> Logs de Actividad</h2>
                <p className="text-xs text-text-muted mt-0.5">Últimas 2 semanas</p>
              </div>
              <button onClick={() => setShowLogsModal(false)} className="w-8 h-8 rounded-full bg-background-dark flex items-center justify-center text-text-secondary hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {logsLoading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-400" /></div>
              ) : logs.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-10">No hay actividad registrada.</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-3 p-3 bg-background-dark/60 border border-border-dark rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0 text-xs font-black text-purple-400">
                      {log.user_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium leading-snug">{log.action}</p>
                      <p className="text-text-muted text-xs mt-0.5">
                        <span className="text-primary font-bold">{log.user_name}</span>
                        {' · '}
                        {new Date(log.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cash Close Modal Dialog */}
      {cashCloseMode && (
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
              {/* Sales */}
              <div className="flex justify-between items-center p-4 bg-green-500/10 border border-green-500/20 rounded-2xl">
                <div>
                  <span className="block text-green-400 font-bold text-xs uppercase tracking-wider mb-0.5">
                    Venta Bruta
                  </span>
                  <span className="text-green-500/60 text-[10px] font-medium">
                    Pedidos completados
                  </span>
                </div>
                <span className="text-green-400 font-black text-xl">
                  ${cashSummary.totalSales.toFixed(2)}
                </span>
              </div>

              {/* Losses */}
              <div className="flex justify-between items-center p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                <div>
                  <span className="block text-red-400 font-bold text-xs uppercase tracking-wider mb-0.5">
                    Pérdidas
                  </span>
                  <span className="text-red-500/60 text-[10px] font-medium">
                    Pedidos cancelados
                  </span>
                </div>
                <span className="text-red-400 font-black text-xl">
                  -${cashSummary.totalLosses.toFixed(2)}
                </span>
              </div>

              {/* Net */}
              <div className="pt-4 mt-2 border-t border-dashed border-border-dark flex justify-between items-end px-1">
                <span className="text-text-secondary font-bold text-sm uppercase tracking-wide">
                  Balance Neto
                </span>
                <span className="text-white font-black text-3xl tracking-tighter">
                  ${(cashSummary.totalSales - cashSummary.totalLosses).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleResetDay}
                className="w-full py-3.5 bg-primary text-white font-bold rounded-2xl hover:bg-orange-600 shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Cerrar Turno y Descargar PDF
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setCashCloseMode(false)}
                  className="flex-1 py-3 bg-background-dark border border-border-dark text-text-muted font-bold hover:text-white rounded-2xl transition-all text-sm"
                >
                  Volver
                </button>
                <button
                  onClick={handleDownload7DayPDF}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-1.5 text-sm"
                >
                  <Download className="w-3.5 h-3.5" /> Últimos 7 días
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
