import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  ClipboardList,
  ChefHat,
  CheckCircle2,
  RotateCcw,
  Package,
  Clock,
  Plus,
  MapPin,
  Undo2,
  Bike,
  X
} from 'lucide-react'

type OrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'shipping'
  | 'delivered'
  | 'cancelled'
  | 'failed'

interface OrderItem {
  id: string
  product_id: string | null
  quantity: number
  subtotal: number | null
  products?: { name: string } | null
}

interface Order {
  id: string
  customer_name: string
  address_text: string | null
  status: OrderStatus
  total_amount: number | null
  created_at: string
  delivery_id: string | null
  notes: string | null
  order_items?: OrderItem[]
}

interface DeliveryProfile {
  id: string
  full_name: string
  role: string
}

const fetchOrders = async (): Promise<Order[]> => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, products(name))')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}

const fetchDeliveryProfiles = async (): Promise<DeliveryProfile[]> => {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'delivery')
  if (error) throw new Error(error.message)
  return data || []
}

const TabButton = ({
  id,
  label,
  icon: Icon,
  count,
  highlight,
  activeTab,
  setActiveTab
}: {
  id: 'pending' | 'ready' | 'history'
  label: string
  icon: LucideIcon
  count?: number
  highlight?: boolean
  activeTab: 'pending' | 'ready' | 'history'
  setActiveTab: (tab: 'pending' | 'ready' | 'history') => void
}) => (
  <button
    onClick={() => setActiveTab(id)}
    className="relative flex flex-col items-center justify-center pb-3 flex-1 group"
  >
    <div
      className={`flex items-center gap-1.5 ${activeTab === id ? 'text-primary' : 'text-text-secondary group-hover:text-white transition-colors'}`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm font-bold leading-normal tracking-wide">{label}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`text-[10px] font-black px-1.5 py-0.5 rounded-full leading-none transition-all ${
            highlight && count > 0
              ? 'bg-green-500 text-white animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]'
              : activeTab === id
                ? 'bg-primary text-white'
                : 'bg-white/10 text-text-secondary group-hover:bg-white/20'
          }`}
        >
          {count}
        </span>
      )}
    </div>
    {activeTab === id && (
      <div className="absolute bottom-0 w-full h-[3px] bg-primary rounded-t-full shadow-[0_0_10px_rgba(238,124,43,0.5)]"></div>
    )}
  </button>
)

const HISTORY_RESET_KEY = 'cf_last_closed_at'

export default function DigitalComanda() {
  const [activeTab, setActiveTab] = useState<'pending' | 'ready' | 'history'>('pending')
  const [assigningOrder, setAssigningOrder] = useState<Order | null>(null)
  const [lastClosedAt] = useState<string | null>(() => localStorage.getItem(HISTORY_RESET_KEY))
  const queryClient = useQueryClient()

  const {
    data: orders = [],
    isLoading,
    isError
  } = useQuery({
    queryKey: ['orders'],
    queryFn: fetchOrders
  })

  const { data: deliveryProfiles = [] } = useQuery({
    queryKey: ['deliveryProfiles'],
    queryFn: fetchDeliveryProfiles
  })

  useEffect(() => {
    const channel = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['orders'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      newStatus,
      delivery_id
    }: {
      id: string
      newStatus: OrderStatus
      delivery_id?: string
    }) => {
      const update: Record<string, unknown> = { status: newStatus }
      if (delivery_id !== undefined) update.delivery_id = delivery_id
      const { error } = await supabase.from('orders').update(update).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      setAssigningOrder(null)
    }
  })

  const handleUpdateStatus = (id: string, newStatus: OrderStatus) => {
    updateStatusMutation.mutate({ id, newStatus })
  }

  const handleAssignDelivery = (deliveryId: string) => {
    if (!assigningOrder) return
    updateStatusMutation.mutate({
      id: assigningOrder.id,
      newStatus: 'shipping',
      delivery_id: deliveryId
    })
  }

  const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'preparing')
  const readyOrders = orders.filter((o) => o.status === 'ready')
  const historyOrders = orders.filter((o) => {
    if (!['shipping', 'delivered', 'cancelled', 'failed'].includes(o.status)) return false
    if (lastClosedAt) return new Date(o.created_at) > new Date(lastClosedAt)
    return true
  })

  const filteredOrders =
    activeTab === 'pending' ? pendingOrders : activeTab === 'ready' ? readyOrders : historyOrders

  return (
    <div className="flex flex-col w-full pb-8">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background-dark px-4 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight leading-none">Comandas</h1>
            <p className="text-xs text-text-muted mt-1">Gestión en tiempo real</p>
          </div>
        </div>
        <Link
          to="/comanda/crear"
          className="bg-primary hover:bg-orange-600 text-white w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 transition-all shrink-0 border border-primary/50"
        >
          <Plus className="w-6 h-6" />
        </Link>
      </div>

      {/* Sticky Tabs */}
      <div className="sticky top-[72px] z-10 bg-background-dark flex border-b border-border-dark w-full mb-4 px-4">
        <TabButton
          id="pending"
          label="Pendientes"
          icon={Clock}
          count={pendingOrders.length}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <TabButton
          id="ready"
          label="Listos"
          icon={CheckCircle2}
          count={readyOrders.length}
          highlight={readyOrders.length > 0}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <TabButton
          id="history"
          label="Historial"
          icon={RotateCcw}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      </div>

      {/* Cards — natural flow, parent main scrolls */}
      <div className="flex flex-col gap-4 px-4 pb-8">
        {isLoading && (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        )}

        {isError && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-2xl text-red-500 text-sm font-medium text-center">
            Error al cargar las órdenes. Inténtalo de nuevo.
          </div>
        )}

        {!isLoading && !isError && filteredOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center text-text-muted py-16 px-4 bg-surface-dark/50 rounded-3xl border border-dashed border-border-dark">
            <Package className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium text-center">No hay pedidos en esta pestaña</p>
          </div>
        )}

        {filteredOrders.map((order) => (
          <div
            key={order.id}
            className="bg-surface-dark rounded-2xl overflow-hidden border border-border-dark flex flex-col"
          >
            {/* Status Color Band */}
            <div
              className={`h-1.5 w-full ${
                order.status === 'pending'
                  ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                  : order.status === 'preparing'
                    ? 'bg-orange-400'
                    : order.status === 'ready'
                      ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                      : 'bg-slate-600'
              }`}
            ></div>

            <div className="p-4 flex-1 flex flex-col gap-3">
              {/* Top: Name + Status + Amount */}
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-black text-white leading-tight tracking-tight">
                    {order.customer_name}
                  </h3>
                  <p className="text-xs text-text-muted font-mono bg-background-dark/50 px-2 py-0.5 rounded-md inline-block mt-1">
                    {new Date(order.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider">
                    {order.status}
                  </span>
                  {order.total_amount != null && (
                    <span className="text-sm font-bold text-green-400">${order.total_amount}</span>
                  )}
                </div>
              </div>

              {/* ===== PRODUCTS — Main Visual for the Cook ===== */}
              {order.order_items && order.order_items.length > 0 ? (
                <div className="bg-primary/5 border border-primary/30 rounded-2xl p-4 space-y-2">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="flex items-baseline gap-3">
                      <span className="text-2xl font-black text-primary leading-none shrink-0">
                        {item.quantity}×
                      </span>
                      <span className="text-base font-bold text-white leading-tight">
                        {item.products?.name ?? 'Producto'}
                      </span>
                      {item.subtotal != null && (
                        <span className="ml-auto text-xs text-text-muted shrink-0">
                          ${item.subtotal}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-background-dark/40 border border-dashed border-border-dark/50 rounded-2xl p-3">
                  <p className="text-xs text-text-muted italic text-center">
                    Sin detalle de productos
                  </p>
                </div>
              )}

              {/* Notes */}
              {order.notes && (
                <div className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
                  <span className="text-yellow-400 text-base shrink-0 mt-0.5">📝</span>
                  <p className="text-sm text-yellow-300 font-medium leading-snug">{order.notes}</p>
                </div>
              )}

              {/* Address */}
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-text-muted" />
                <span className="text-xs text-text-muted">
                  {order.address_text || 'Retiro en Local'}
                </span>
              </div>

              {/* Actions */}
              <div className="border-t border-border-dark pt-3 flex gap-3">
                {activeTab === 'pending' && (
                  <>
                    {order.status === 'pending' ? (
                      <button
                        onClick={() => handleUpdateStatus(order.id, 'preparing')}
                        disabled={updateStatusMutation.isPending}
                        className="flex-1 h-11 rounded-xl border border-border-dark text-white font-bold text-sm hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
                      >
                        <ChefHat className="w-4 h-4 text-text-muted" /> Preparando
                      </button>
                    ) : (
                      <button
                        disabled
                        className="flex-1 h-11 rounded-xl bg-background-dark text-text-secondary font-bold text-sm cursor-not-allowed opacity-50 flex items-center justify-center gap-2 border border-border-dark"
                      >
                        <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></div>
                        En preparación
                      </button>
                    )}
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'ready')}
                      disabled={updateStatusMutation.isPending}
                      className="flex-1 h-11 rounded-xl bg-primary text-white font-bold text-sm hover:bg-orange-600 transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" /> ¡Listo!
                    </button>
                  </>
                )}

                {activeTab === 'ready' && (
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => handleUpdateStatus(order.id, 'pending')}
                      disabled={updateStatusMutation.isPending}
                      title="Regresar a Pendientes"
                      className="h-11 px-4 rounded-xl border border-border-dark text-text-secondary hover:text-white hover:bg-white/5 transition-colors flex items-center justify-center"
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setAssigningOrder(order)}
                      disabled={updateStatusMutation.isPending}
                      className="flex-1 h-11 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition-colors shadow-[0_0_20px_rgba(34,197,94,0.3)] flex items-center justify-center gap-2"
                    >
                      <Bike className="w-4 h-4" /> Asignar Delivery
                    </button>
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="flex gap-3 w-full">
                    <button
                      disabled
                      className="flex-1 h-11 rounded-xl bg-background-dark border border-border-dark text-text-muted font-bold text-sm cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      Cerrado / Finalizado
                    </button>
                    {order.status === 'shipping' && (
                      <button
                        onClick={() => setAssigningOrder(order)}
                        className="h-11 px-4 rounded-xl border border-primary/40 text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-2 text-sm font-bold"
                      >
                        <RotateCcw className="w-4 h-4" /> Reasignar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delivery Assignment Modal */}
      {assigningOrder && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
          <div className="bg-surface-dark w-full max-w-sm rounded-3xl shadow-2xl border border-border-dark animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">
                    Asignar Repartidor
                  </h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    Pedido de {assigningOrder.customer_name}
                  </p>
                </div>
                <button
                  onClick={() => setAssigningOrder(null)}
                  className="w-8 h-8 rounded-full bg-background-dark flex items-center justify-center text-text-secondary hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {deliveryProfiles.length === 0 ? (
                <div className="py-8 text-center text-text-muted text-sm">
                  <Bike className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  No hay repartidores disponibles
                </div>
              ) : (
                <div className="space-y-2">
                  {deliveryProfiles.map((dp) => (
                    <button
                      key={dp.id}
                      onClick={() => handleAssignDelivery(dp.id)}
                      disabled={updateStatusMutation.isPending}
                      className="w-full flex items-center gap-4 p-4 rounded-2xl bg-background-dark border border-border-dark hover:border-primary/50 hover:bg-primary/5 transition-all group"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <Bike className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-bold text-white text-sm group-hover:text-primary transition-colors">
                        {dp.full_name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
