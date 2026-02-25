import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ReceiptText, MonitorPlay, Download } from 'lucide-react'
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

// Custom icons
const houseIcon = new L.Icon({
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

const deliveryIcon = new L.Icon({
  iconUrl:
    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
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

const fetchAdminData = async () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [ordersRes, profilesRes] = await Promise.all([
    supabase.from('orders').select('*').gte('created_at', today.toISOString()),
    supabase.from('profiles').select('*').eq('role', 'delivery')
  ])

  if (ordersRes.error) throw new Error(ordersRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)

  return {
    orders: ordersRes.data as Order[],
    profiles: profilesRes.data as Profile[]
  }
}

export default function AdminDashboard() {
  const [cashCloseMode, setCashCloseMode] = useState(false)
  const [cashSummary, setCashSummary] = useState({ totalSales: 0, totalLosses: 0 })
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['adminData'],
    queryFn: fetchAdminData
  })

  const orders = data?.orders || []
  const profiles = data?.profiles || []

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

    return () => {
      supabase.removeChannel(ordersChannel)
      supabase.removeChannel(profilesChannel)
    }
  }, [queryClient])

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
      {/* Top Header / Stats Overview */}
      <div className="flex gap-4 items-center justify-between shrink-0 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <MonitorPlay className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight dark:text-white leading-none">
              Panel <span className="text-primary">Admin</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-text-muted mt-1 font-medium">
              Monitoreo global GPS
            </p>
          </div>
        </div>

        <button
          onClick={handleCashClose}
          className="bg-surface-dark border border-border-dark hover:bg-white/5 text-white font-bold h-10 px-4 rounded-xl shadow-lg flex items-center gap-2 transition-all"
        >
          <ReceiptText className="w-4 h-4 text-green-400" />
          <span className="hidden sm:inline">Cierre de Caja</span>
        </button>
      </div>

      {/* Main Map Container */}
      <div className="flex-1 rounded-2xl overflow-hidden border border-border-dark relative shadow-[0_0_30px_rgba(0,0,0,0.5)]">
        {isLoading && (
          <div className="absolute inset-0 z-[500] bg-background-dark/80 backdrop-blur-sm flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        )}

        <MapContainer
          center={[-34.6, -58.38]} // Default placeholder (Buenos Aires)
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
            return (
              <Marker key={`order-${o.id}`} position={[o.lat, o.lng]} icon={houseIcon}>
                <Popup className="custom-popup">
                  <strong className="text-slate-900">{o.customer_name}</strong>
                  <br />
                  <span className="text-primary font-bold text-xs uppercase">Pedido en camino</span>
                </Popup>
              </Marker>
            )
          })}

          {/* Render Delivery Driver Live Locations */}
          {profiles
            .filter((p) => p.current_lat && p.current_lng)
            .map((p) => (
              <Marker
                key={`profile-${p.id}`}
                position={[p.current_lat!, p.current_lng!]}
                icon={deliveryIcon}
              >
                <Popup>
                  <strong className="text-slate-900">Repartidor: {p.full_name}</strong>
                </Popup>
              </Marker>
            ))}
        </MapContainer>

        {/* Floating status counters on map */}
        <div className="absolute top-4 right-4 z-[400] bg-surface-dark/95 backdrop-blur shadow-2xl rounded-2xl p-4 border border-border-dark flex flex-col gap-3 min-w-[160px]">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              En camino
            </span>
            <span className="bg-primary/20 text-primary border border-primary/30 text-xs font-black px-2 py-0.5 rounded-md">
              {shippingOrders.length}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Repartidores
            </span>
            <span className="bg-green-500/20 text-green-400 border border-green-500/30 text-xs font-black px-2 py-0.5 rounded-md">
              {profiles.filter((p) => p.current_lat).length}
            </span>
          </div>
        </div>
      </div>

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
