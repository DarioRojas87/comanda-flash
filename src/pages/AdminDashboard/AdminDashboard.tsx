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
  ScrollText,
  ChevronUp,
  ChevronDown
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

import type { Product, ProductCategory, AdminOrder, AuditLog } from './types'
import { DELIVERY_COLORS, createDriverIcon, createDestIcon } from './constants'
import { fetchAdminData, insertAuditLog } from './utils'
import DeleteCategoryModal from './components/DeleteCategoryModal'
import CreateProductModal from './components/CreateProductModal'
import EditProductModal from './components/EditProductModal'
import AuditLogModal from './components/AuditLogModal'
import CashCloseModal from './components/CashCloseModal'

// Fix Leaflet's default icon path issues
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

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

  // Per-product stock input state
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

  const auditLog = (action: string, entityType: 'product' | 'category' | 'user') =>
    insertAuditLog(action, entityType, currentProfile)

  // ── Category handlers ─────────────────────────────────────────────────────

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    const { error } = await supabase
      .from('product_categories')
      .insert([{ name: newCatName.trim() }])
    if (error) alert('Error al crear categoría: ' + error.message)
    else {
      await auditLog(`Creó la categoría "${newCatName.trim()}"`, 'category')
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
      await auditLog(`Eliminó la categoría "${name}"`, 'category')
      setDeletingCat(null)
      refetch()
    }
  }

  // ── Product handlers ──────────────────────────────────────────────────────

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
      await auditLog(`Creó el producto "${newProdName.trim()}"`, 'product')
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
      await auditLog(`Editó el producto "${editProdName.trim()}"`, 'product')
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
      await auditLog(`Eliminó el producto "${name}"`, 'product')
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

  // ── Audit Logs ────────────────────────────────────────────────────────────

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

  // ── Cash Close / PDF ──────────────────────────────────────────────────────

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

    const deliveryGroups: Record<string, { name: string; orders: AdminOrder[] }> = {}
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
    handleDownloadPDF()
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
    const total = weekOrders.reduce((a: number, o: AdminOrder) => a + (o.total_amount ?? 0), 0)
    doc.text(`Total entregado: $${total.toFixed(2)}   Pedidos: ${weekOrders.length}`, 14, 31)
    autoTable(doc, {
      startY: 38,
      head: [['Fecha', 'Cliente', 'Dirección', 'Monto']],
      body: weekOrders.map((o: AdminOrder) => [
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

  const shippingOrders = orders.filter((o) => o.status === 'shipping' && o.lat && o.lng)

  return (
    <div className="relative flex flex-col h-full bg-background-light dark:bg-background-dark p-4 gap-4">
      {/* Header */}
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

        {/* Tabs */}
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
                  : [-27.0551, -65.3983]
              }
              zoom={12}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
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

          {/* Delivery Legend */}
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
                    className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`}
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
                onClick={() => {
                  setShowLogsModal(true)
                  fetchLogs()
                }}
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
            {/* Categories Panel */}
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
                    {categories.map((cat: ProductCategory) => (
                      <li
                        key={cat.id}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors"
                      >
                        <span className="text-slate-200 font-medium">{cat.name}</span>
                        {cat.name !== 'General' && cat.name !== 'Agregados' && (
                          <button
                            onClick={() => handleDeleteCategory(cat.id, cat.name)}
                            className="p-1.5 text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/25 rounded-lg transition-colors"
                            title="Eliminar categoría"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Products Panel */}
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
                {categories.map((cat: ProductCategory) => {
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
                              className="flex flex-col gap-2 p-3 bg-surface-dark border border-border-dark rounded-xl hover:bg-white/5 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="text-white font-bold leading-tight truncate">
                                    {prod.name}
                                  </span>
                                  <span className="text-primary font-mono text-sm">
                                    ${prod.price}
                                  </span>
                                  {prod.stock !== null && (
                                    <span className="text-xs font-mono bg-background-dark/50 border border-border-dark px-2 py-0.5 rounded-md text-text-muted mt-1 w-fit">
                                      Stock: {prod.stock}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => openEditProduct(prod)}
                                    className="p-1.5 text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/25 rounded-lg transition-colors"
                                    title="Editar producto"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(`¿Eliminar "${prod.name}"?`))
                                        handleDeleteProduct(prod.id, prod.name)
                                    }}
                                    className="p-1.5 text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/25 rounded-lg transition-colors"
                                    title="Eliminar producto"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {prod.stock !== null && (
                                  <button
                                    onClick={() => handleToggleStockTracking(prod.id, prod.stock)}
                                    className="w-9 h-9 flex items-center justify-center bg-background-dark/50 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors text-base border border-border-dark/60 hover:border-red-500/30"
                                    title="Desactivar control de stock"
                                  >
                                    ∞
                                  </button>
                                )}
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
                                        if (e.key === 'Enter') e.currentTarget.blur()
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

      {/* ── Modals ── */}

      {deletingCat && (
        <DeleteCategoryModal
          name={deletingCat.name}
          onConfirm={confirmDeleteCategory}
          onCancel={() => setDeletingCat(null)}
        />
      )}

      {showCreateProdModal && (
        <CreateProductModal
          name={newProdName}
          price={newProdPrice}
          stock={newProdStock}
          categoryId={newProdCategoryId}
          ingredients={newProdIngredients}
          categories={categories}
          onNameChange={setNewProdName}
          onPriceChange={setNewProdPrice}
          onStockChange={setNewProdStock}
          onCategoryChange={setNewProdCategoryId}
          onIngredientsChange={setNewProdIngredients}
          onCreate={handleAddProduct}
          onClose={() => setShowCreateProdModal(false)}
        />
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          name={editProdName}
          price={editProdPrice}
          stock={editProdStock}
          categoryId={editProdCategoryId}
          ingredients={editProdIngredients}
          active={editProdActive}
          categories={categories}
          onNameChange={setEditProdName}
          onPriceChange={setEditProdPrice}
          onStockChange={setEditProdStock}
          onCategoryChange={setEditProdCategoryId}
          onIngredientsChange={setEditProdIngredients}
          onActiveToggle={() => setEditProdActive((v) => !v)}
          onSave={handleEditProduct}
          onDelete={() => {
            if (confirm(`¿Eliminar "${editingProduct.name}" permanentemente?`))
              handleDeleteProduct(editingProduct.id, editingProduct.name)
          }}
          onClose={() => setEditingProduct(null)}
        />
      )}

      {showLogsModal && (
        <AuditLogModal
          logs={logs}
          isLoading={logsLoading}
          onClose={() => setShowLogsModal(false)}
        />
      )}

      {cashCloseMode && (
        <CashCloseModal
          summary={cashSummary}
          onClose={() => setCashCloseMode(false)}
          onConfirm={handleResetDay}
          onDownload7Days={handleDownload7DayPDF}
        />
      )}

      {/* Download 7-day button always visible */}
      <div className="shrink-0 flex justify-end mt-2">
        <button
          onClick={handleDownload7DayPDF}
          className="bg-background-dark border border-border-dark hover:border-blue-500/50 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition-all"
        >
          <Download className="w-4 h-4 text-blue-400" /> Historial 7 días (PDF)
        </button>
      </div>
    </div>
  )
}
