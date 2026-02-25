import { useState, useEffect, useRef, useId } from 'react'
import { supabase } from '@/lib/supabase'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronRight, MapPin, XCircle } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix Leaflet's default icon path issues with webpack/vite
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

interface Order {
  id: string
  customer_name: string
  address_text: string | null
  lat: number | null
  lng: number | null
  status: string
  is_paid: boolean
}

// A simple component to re-center the map when order coordinates change
function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lng], 15)
  }, [lat, lng, map])
  return null
}

const fetchDeliveryOrders = async (): Promise<Order[]> => {
  // We assume any shipping order is assigned to us for this MVP demo
  const { data, error } = await supabase.from('orders').select('*').eq('status', 'shipping')
  if (error) throw new Error(error.message)
  return data || []
}

export default function DeliveryModule() {
  const [activeOrder, setActiveOrder] = useState<Order | null>(null)
  const [failReason, setFailReason] = useState('')
  const [showFailDialog, setShowFailDialog] = useState(false)
  // Prevents auto-select from re-opening the modal right after a delivery/failed mutation
  const disableAutoSelect = useRef(false)

  const queryClient = useQueryClient()
  // Unique channel name per instance prevents collision when the component
  // mounts/unmounts during the auth loading cycle on first login
  const instanceId = useId()
  const channelId = useRef(`delivery_orders_${instanceId.replace(/:/g, '')}`)

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['deliveryOrders'],
    queryFn: fetchDeliveryOrders,
    // Polling fallback: if realtime misses an event (e.g. on first login),
    // the list auto-refreshes every 8 seconds.
    refetchInterval: 8000
  })

  // Auto-select first order if none active and we have orders
  // Skip if a mutation just succeeded (disableAutoSelect flag)
  useEffect(() => {
    if (disableAutoSelect.current) {
      disableAutoSelect.current = false
      return
    }
    if (orders.length > 0 && !activeOrder) {
      setActiveOrder(orders[0])
    }
  }, [orders, activeOrder])

  // Realtime: listen for any order changes and refresh the list automatically.
  // Uses a unique channel ID per instance to avoid name collisions during
  // the auth loading → mount/unmount cycle that happens on first login.
  useEffect(() => {
    const channelName = channelId.current
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] })
      })
      .subscribe((status, err) => {
        if (err) console.error('Realtime subscription error:', err)
        if (status === 'SUBSCRIBED') {
          console.log(`Delivery realtime channel [${channelName}] subscribed`)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const mutation = useMutation({
    mutationFn: async ({
      id,
      status,
      fail_reason
    }: {
      id: string
      status: string
      fail_reason?: string
    }) => {
      const updateData: { status: string; fail_reason?: string } = { status }
      if (fail_reason) updateData.fail_reason = fail_reason

      const { error } = await supabase.from('orders').update(updateData).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      // Set flag BEFORE invalidating the query so the auto-select effect
      // doesn't immediately re-open the drawer with the next order.
      disableAutoSelect.current = true
      queryClient.invalidateQueries({ queryKey: ['deliveryOrders'] })
      setActiveOrder(null)
      setShowFailDialog(false)
      setFailReason('')
    }
  })

  const handleDeliver = () => {
    if (!activeOrder) return
    mutation.mutate({ id: activeOrder.id, status: 'delivered' })
  }

  const handleFailed = () => {
    if (!failReason) return alert('Por favor ingresa un motivo')
    if (!activeOrder) return
    mutation.mutate({ id: activeOrder.id, status: 'failed', fail_reason: failReason })
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background-dark">
      {/* Map View */}
      <div className="absolute inset-0 z-0 bg-slate-900 border-b border-border-dark shadow-inner">
        {isLoading && (
          <div className="absolute inset-0 z-[500] bg-background-dark/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
            <p className="text-primary font-bold tracking-widest uppercase text-xs">
              Ubicando pedidos...
            </p>
          </div>
        )}
        <MapContainer
          center={
            activeOrder?.lat && activeOrder?.lng
              ? [activeOrder.lat, activeOrder.lng]
              : [-34.6, -58.38]
          }
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {activeOrder?.lat && activeOrder?.lng && (
            <>
              <MapRecenter lat={activeOrder.lat} lng={activeOrder.lng} />
              <Marker position={[activeOrder.lat, activeOrder.lng]}>
                <Popup className="custom-popup">
                  <strong className="text-slate-900 font-bold">{activeOrder.customer_name}</strong>{' '}
                  <br />
                  <span className="text-xs text-slate-500">{activeOrder.address_text}</span>
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>
      </div>

      {/* Floating UI Overlays */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-col gap-2">
        {/* Top Pill Status */}
        <div className="flex justify-center mb-2 drop-shadow-2xl">
          <span className="bg-primary hover:bg-orange-600 transition-colors cursor-pointer text-white px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest shadow-[0_0_15px_rgba(238,124,43,0.5)] border border-primary/50 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5" />
            Tu Ruta Activa
          </span>
        </div>

        {/* Horizontal Scroll Selector */}
        <div className="bg-surface-dark/90 backdrop-blur-xl rounded-2xl p-2 shadow-2xl border border-white/5 flex overflow-x-auto gap-2 scrollbar-none snap-x snap-mandatory">
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => setActiveOrder(o)}
              className={`shrink-0 snap-center px-5 py-3 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2 ${activeOrder?.id === o.id ? 'bg-primary text-white shadow-[0_0_20px_rgba(238,124,43,0.4)] scale-95' : 'bg-background-dark/50 text-slate-300 border border-border-dark hover:bg-white/5'}`}
            >
              <div
                className={`w-2 h-2 rounded-full ${o.is_paid ? 'bg-green-400' : 'bg-red-400'} animate-pulse`}
              ></div>
              {o.customer_name}
            </button>
          ))}
          {!isLoading && orders.length === 0 && (
            <div className="w-full flex justify-center py-4">
              <span className="text-sm text-text-muted font-medium bg-background-dark px-4 py-2 rounded-lg border border-border-dark">
                No tienes pedidos asignados actualmente.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Active Order Card Drawer */}
      {activeOrder && (
        <div className="absolute bottom-6 left-4 right-4 z-20 pointer-events-auto">
          <div className="bg-surface-dark/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.6)] p-6 outline outline-1 outline-border-dark/50">
            <div className="w-16 h-1 bg-border-dark rounded-full mx-auto mb-6 opacity-30"></div>

            <div className="flex justify-between items-start mb-6">
              <div className="pr-4 border-r border-border-dark/50">
                <h3 className="text-white font-black text-2xl tracking-tight leading-none mb-2">
                  {activeOrder.customer_name}
                </h3>
                <p className="text-text-secondary text-sm flex items-start gap-1">
                  <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span className="line-clamp-2">
                    {activeOrder.address_text || 'Sin dirección específica'}
                  </span>
                </p>
              </div>
              <div className="flex flex-col items-end pl-4">
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-black tracking-widest border ${activeOrder.is_paid ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}
                >
                  {activeOrder.is_paid ? 'PAGADO' : 'A COBRAR'}
                </span>
                {/* Decorative element */}
                <div className="w-8 h-8 rounded-full bg-background-dark border border-border-dark flex items-center justify-center mt-3 opacity-50">
                  <ChevronRight className="w-4 h-4 text-text-secondary" />
                </div>
              </div>
            </div>

            {showFailDialog ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="bg-red-500/5 border border-red-500/10 p-3 rounded-2xl">
                  <label className="block text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2 pl-1">
                    Motivo del Fallo
                  </label>
                  <input
                    type="text"
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                    placeholder="Ej: No atiende el timbre, dirección incorrecta"
                    className="w-full bg-background-dark border border-red-500/30 text-white text-sm rounded-xl p-3.5 placeholder:text-red-500/30 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowFailDialog(false)}
                    disabled={mutation.isPending}
                    className="flex-[0.8] py-4 bg-background-dark hover:bg-white/10 text-text-secondary font-bold rounded-2xl transition-all text-sm border border-border-dark"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleFailed}
                    disabled={mutation.isPending}
                    className="flex-1 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl transition-all shadow-lg shadow-red-500/20 font-bold text-sm flex items-center justify-center gap-2 border border-red-400/50 relative overflow-hidden group"
                  >
                    {mutation.isPending ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <>
                        Confirmar Fallo
                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setShowFailDialog(true)}
                  disabled={mutation.isPending}
                  className="flex-[0.8] py-4 bg-surface-dark border border-red-500/30 hover:bg-red-500/10 text-red-400 rounded-2xl transition-all font-bold text-sm flex items-center justify-center gap-2 group"
                >
                  <XCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  No Entregado
                </button>
                <button
                  onClick={handleDeliver}
                  disabled={mutation.isPending}
                  className="flex-1 py-4 bg-primary hover:bg-orange-600 text-white rounded-2xl transition-all shadow-[0_0_25px_rgba(238,124,43,0.4)] font-bold text-sm flex items-center justify-center gap-2 border border-primary/50 relative overflow-hidden group"
                >
                  {mutation.isPending ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                      Entregado
                      <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
