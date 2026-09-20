import { useEffect, useState } from 'react'
import type { ChangeEvent, ComponentType, FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle, Check, ChevronLeft, LayoutDashboard, ListOrdered, LogOut, Package,
  Pencil, Plus, RotateCcw, Search, ShoppingBag, Trash2, Upload, Users, Wallet, X,
} from 'lucide-react'
import {
  CATEGORIES, checkSession, deleteCustomer, deleteExpense, deleteOrder, deleteProduct,
  getAdminData, login, logout, purgeCustomer, purgeOrder, purgeProduct, recordExpense,
  recordPurchase, restoreCustomer, restoreOrder, restoreProduct, saveContent, saveCustomer,
  saveProduct, updateOrderStatus,
} from '@/lib/store'

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(value / 100)
const dateFmt = (value: string) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

type Product = { id: number; name: string; category: string; description: string; options: string; price: number; originalPrice: number; stock: number; cost: number; image: string; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean; createdAt: string; deletedAt: string | null }
type OrderItem = { id: number; name: string; price: number; quantity: number; cost: number }
type Order = { id: number; orderNumber: string; customerName: string; email: string; phone: string; address: string; items: OrderItem[]; total: number; status: string; paymentStatus: string; notes: string; createdAt: string; deletedAt: string | null }
type Customer = { id: number; name: string; email: string; phone: string; address: string; notes: string; createdAt: string; deletedAt: string | null }
type ImageTrashRow = { id: number; path: string; url: string; reason: string; deletedAt: string }
type Purchase = { id: number; productId: number; productName: string; quantity: number; unitCost: number; totalCost: number; notes: string; createdAt: string }
type Expense = { id: number; type: 'negocio' | 'personal'; description: string; amount: number; createdAt: string }
type AdminData = { products: Product[]; orders: Order[]; customers: Customer[]; content: Record<string, string>; purchases: Purchase[]; expenses: Expense[]; trash: { products: Product[]; orders: Order[]; customers: Customer[]; images: ImageTrashRow[] } }
type ProductDraft = { id?: number; name: string; category: string; description: string; options: string; price: string; originalPrice: string; stock: string; image: string; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean }
type CustomerDraft = { id?: number; name: string; email: string; phone: string; address: string; notes: string }
type PurchaseDraft = { productId: string; quantity: string; unitCost: string; notes: string }
type ExpenseDraft = { type: 'negocio' | 'personal'; description: string; amount: string }
type Tab = 'resumen' | 'finanzas' | 'catalogo' | 'pedidos' | 'clientes' | 'contenido' | 'papelera'

function emptyPurchaseDraft(): PurchaseDraft {
  return { productId: '', quantity: '1', unitCost: '', notes: '' }
}

function emptyExpenseDraft(): ExpenseDraft {
  return { type: 'negocio', description: '', amount: '' }
}

const ORDER_STATUSES = ['Pendiente', 'Confirmado', 'Preparando', 'Enviado', 'Entregado', 'Cancelado']
const PAYMENT_STATUSES = ['Pendiente', 'Pagado']

const CONTENT_GROUPS: Array<{ title: string; fields: Array<{ key: string; label: string; type?: 'textarea' }> }> = [
  { title: 'Marca', fields: [
    { key: 'brandName', label: 'Nombre de la marca' },
    { key: 'brandTagline', label: 'Eslogan' },
  ] },
  { title: 'Portada', fields: [
    { key: 'eyebrow', label: 'Texto pequeño sobre el título' },
    { key: 'heroTitle', label: 'Título principal', type: 'textarea' },
    { key: 'heroDescription', label: 'Descripción', type: 'textarea' },
    { key: 'heroCta', label: 'Texto del botón principal' },
    { key: 'heroBadge', label: 'Texto debajo de los botones' },
  ] },
  { title: 'Catálogo y ofertas', fields: [
    { key: 'catalogTitle', label: 'Título del catálogo' },
    { key: 'catalogDescription', label: 'Descripción del catálogo' },
    { key: 'offersTitle', label: 'Título de ofertas' },
    { key: 'offersDescription', label: 'Descripción de ofertas' },
  ] },
  { title: 'Beneficios', fields: [
    { key: 'benefitsTitle', label: 'Título de la sección' },
    { key: 'benefit1Title', label: 'Beneficio 1 — título' },
    { key: 'benefit1Text', label: 'Beneficio 1 — texto' },
    { key: 'benefit2Title', label: 'Beneficio 2 — título' },
    { key: 'benefit2Text', label: 'Beneficio 2 — texto' },
    { key: 'benefit3Title', label: 'Beneficio 3 — título' },
    { key: 'benefit3Text', label: 'Beneficio 3 — texto' },
  ] },
  { title: 'Contacto y redes', fields: [
    { key: 'whatsapp', label: 'WhatsApp (solo números, con código de país, ej. 18095551234)' },
    { key: 'location', label: 'Ubicación' },
    { key: 'instagram', label: 'Usuario de Instagram' },
    { key: 'facebook', label: 'Página de Facebook' },
    { key: 'schedule', label: 'Horario' },
    { key: 'notificationEmail', label: 'Correo para avisos de pedidos (opcional)' },
  ] },
  { title: 'Navegación y otros textos', fields: [
    { key: 'navShop', label: 'Menú: Tienda' },
    { key: 'navOffers', label: 'Menú: Ofertas' },
    { key: 'navContact', label: 'Menú: Contacto' },
    { key: 'footerText', label: 'Texto del pie de página' },
    { key: 'cartTitle', label: 'Título del carrito' },
    { key: 'checkoutTitle', label: 'Título del checkout' },
  ] },
]

async function uploadFile(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch('/api/upload', { method: 'POST', body: form })
  const result = (await response.json()) as { url?: string; error?: string }
  if (!response.ok || !result.url) throw new Error(result.error || 'No pudimos subir la imagen.')
  return result.url
}

function daysLeft(deletedAt: string) {
  const elapsed = Date.now() - new Date(deletedAt).getTime()
  return Math.max(0, 30 - Math.floor(elapsed / 86400000))
}

function emptyDraft(): ProductDraft {
  return { name: '', category: CATEGORIES[0], description: '', options: '', price: '', originalPrice: '', stock: '0', image: '', featured: false, isNew: false, bestSeller: false, active: true }
}

function toDraft(product: Product): ProductDraft {
  return { id: product.id, name: product.name, category: product.category, description: product.description, options: product.options, price: String(product.price / 100), originalPrice: product.originalPrice ? String(product.originalPrice / 100) : '', stock: String(product.stock), image: product.image, featured: product.featured, isNew: product.isNew, bestSeller: product.bestSeller, active: product.active }
}

export function AdminPanel() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [data, setData] = useState<AdminData | null>(null)
  const [tab, setTab] = useState<Tab>('resumen')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<ProductDraft | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<CustomerDraft | null>(null)
  const [contentDraft, setContentDraft] = useState<Record<string, string>>({})
  const [editingPurchase, setEditingPurchase] = useState<PurchaseDraft | null>(null)
  const [editingExpense, setEditingExpense] = useState<ExpenseDraft | null>(null)
  const [financeSettings, setFinanceSettings] = useState({ capitalInicial: '0', reinvestPercent: '70' })

  async function refresh() {
    const adminData = await getAdminData()
    setData(adminData as unknown as AdminData)
    setContentDraft(adminData.content)
    setFinanceSettings({
      capitalInicial: String(Number(adminData.content.capitalInicial || 0) / 100),
      reinvestPercent: String(Number(adminData.content.reinvestPercent ?? 70)),
    })
  }

  useEffect(() => {
    checkSession().then(async (ok) => {
      setAuthenticated(ok)
      if (ok) await refresh().catch((caught) => setError(caught instanceof Error ? caught.message : 'No pudimos cargar los datos.'))
    })
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login({ data: { password } })
      setAuthenticated(true)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos iniciar sesión.')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    await logout()
    setAuthenticated(false)
    setData(null)
  }

  async function withBusy(action: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await action()
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ocurrió un error inesperado.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    await withBusy(async () => {
      await saveProduct({ data: {
        id: editing.id,
        name: editing.name,
        category: editing.category,
        description: editing.description,
        options: editing.options,
        price: Math.round(Number(editing.price || 0) * 100),
        originalPrice: Math.round(Number(editing.originalPrice || 0) * 100),
        stock: Math.round(Number(editing.stock || 0)),
        image: editing.image,
        featured: editing.featured,
        isNew: editing.isNew,
        bestSeller: editing.bestSeller,
        active: editing.active,
      } })
      setEditing(null)
    })
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !editing) return
    setUploading(true)
    setError('')
    try {
      const url = await uploadFile(file)
      setEditing((current) => (current ? { ...current, image: url } : current))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos subir la imagen.')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function handleSaveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingCustomer) return
    await withBusy(async () => {
      await saveCustomer({ data: editingCustomer })
      setEditingCustomer(null)
    })
  }

  async function handleSaveContent() {
    await withBusy(() => saveContent({ data: contentDraft }))
  }

  async function handleSavePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingPurchase) return
    await withBusy(async () => {
      await recordPurchase({ data: {
        productId: Number(editingPurchase.productId),
        quantity: Math.round(Number(editingPurchase.quantity || 0)),
        unitCost: Math.round(Number(editingPurchase.unitCost || 0) * 100),
        notes: editingPurchase.notes,
      } })
      setEditingPurchase(null)
    })
  }

  async function handleSaveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingExpense) return
    await withBusy(async () => {
      await recordExpense({ data: {
        type: editingExpense.type,
        description: editingExpense.description,
        amount: Math.round(Number(editingExpense.amount || 0) * 100),
      } })
      setEditingExpense(null)
    })
  }

  async function handleSaveFinanceSettings() {
    await withBusy(() => saveContent({ data: {
      capitalInicial: String(Math.round(Number(financeSettings.capitalInicial || 0) * 100)),
      reinvestPercent: String(Math.min(100, Math.max(0, Math.round(Number(financeSettings.reinvestPercent || 0))))),
    } }))
  }

  if (authenticated === null) return <div className="admin-loading">Cargando…</div>

  if (!authenticated) {
    return (
      <div className="admin-login-screen">
        <form className="admin-login-card" onSubmit={handleLogin}>
          <span className="drawer-kicker">JB TECH STORE · ADMIN</span>
          <h1>Panel administrativo</h1>
          <p>Ingresa la contraseña para gestionar el catálogo, los pedidos y los textos de la tienda.</p>
          <input type="password" required placeholder="Contraseña" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy}>{busy ? 'Verificando…' : 'Entrar'}</button>
          <Link to="/" className="admin-back-link"><ChevronLeft size={15} />Volver a la tienda</Link>
        </form>
      </div>
    )
  }

  if (!data) return <div className="admin-loading">Cargando panel…</div>

  const filteredProducts = data.products.filter((product) => product.name.toLowerCase().includes(query.toLowerCase()))
  const filteredOrders = data.orders.filter((order) => `${order.orderNumber} ${order.customerName} ${order.phone}`.toLowerCase().includes(query.toLowerCase()))
  const filteredCustomers = data.customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(query.toLowerCase()))
  const pendingOrders = data.orders.filter((order) => order.status === 'Pendiente').length
  const outOfStock = data.products.filter((product) => product.stock === 0).length
  const trashTotal = data.trash.products.length + data.trash.orders.length + data.trash.customers.length + data.trash.images.length

  // Finanzas: todo se calcula a partir de pedidos pagados + compras +
  // gastos registrados, igual espíritu que el "Resumen" del Excel de
  // Yeilin pero automático. `cost` en cada item del pedido es una copia
  // del costo promedio del producto al momento de la venta.
  const paidOrders = data.orders.filter((order) => order.paymentStatus === 'Pagado')
  const ingresos = paidOrders.reduce((sum, order) => sum + order.total, 0)
  const costoVentas = paidOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + item.cost * item.quantity, 0), 0)
  const gananciaBruta = ingresos - costoVentas
  const capitalUsado = data.purchases.reduce((sum, purchase) => sum + purchase.totalCost, 0)
  const capitalRecuperado = costoVentas
  const capitalInicial = Number(data.content.capitalInicial || 0)
  const capitalDisponible = capitalInicial - capitalUsado + capitalRecuperado
  const gastosNegocio = data.expenses.filter((expense) => expense.type === 'negocio').reduce((sum, expense) => sum + expense.amount, 0)
  const gastosPersonales = data.expenses.filter((expense) => expense.type === 'personal').reduce((sum, expense) => sum + expense.amount, 0)
  const gananciaNeta = gananciaBruta - gastosNegocio
  const reinvestPercent = Number(data.content.reinvestPercent ?? 70)
  const reinversion = Math.round((gananciaNeta * reinvestPercent) / 100)
  const paraTi = gananciaNeta - reinversion
  const disponibleRetirar = paraTi - gastosPersonales

  const TABS: Array<{ id: Tab; label: string; icon: ComponentType<{ size?: number }> }> = [
    { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
    { id: 'finanzas', label: 'Finanzas', icon: Wallet },
    { id: 'catalogo', label: 'Catálogo', icon: Package },
    { id: 'pedidos', label: 'Pedidos', icon: ListOrdered },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'contenido', label: 'Contenido', icon: Pencil },
    { id: 'papelera', label: `Papelera${trashTotal ? ` (${trashTotal})` : ''}`, icon: Trash2 },
  ]

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <span className="drawer-kicker">JB TECH STORE</span>
        <h1>Panel admin</h1>
        <nav>
          {TABS.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); setQuery('') }}><Icon size={17} />{label}</button>)}
        </nav>
        <div className="admin-sidebar-footer">
          <Link to="/"><ChevronLeft size={15} />Ver la tienda</Link>
          <button onClick={handleLogout}><LogOut size={15} />Cerrar sesión</button>
        </div>
      </aside>

      <main className="admin-main">
        {error && <p className="form-error admin-error">{error}</p>}

        {tab === 'resumen' && (
          <section>
            <h2>Resumen</h2>
            <div className="admin-cards">
              <div className="admin-card"><span>Productos activos</span><strong>{data.products.filter((product) => product.active).length}</strong></div>
              <div className="admin-card"><span>Agotados</span><strong>{outOfStock}</strong></div>
              <div className="admin-card"><span>Pedidos pendientes</span><strong>{pendingOrders}</strong></div>
              <div className="admin-card"><span>Clientes</span><strong>{data.customers.length}</strong></div>
            </div>
            <h3>Últimos pedidos</h3>
            <div className="admin-table">
              {data.orders.slice(0, 6).map((order) => <div className="admin-row" key={order.id}>
                <div><strong>{order.orderNumber}</strong><span>{order.customerName}</span></div>
                <span className={`status-pill status-${order.status.toLowerCase()}`}>{order.status}</span>
                <strong>{money(order.total)}</strong>
              </div>)}
              {!data.orders.length && <p className="admin-empty">Todavía no hay pedidos.</p>}
            </div>
          </section>
        )}

        {tab === 'finanzas' && (
          <section>
            <div className="admin-section-head">
              <h2>Finanzas</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="primary-button" onClick={() => setEditingExpense(emptyExpenseDraft())}><Plus size={16} />Registrar gasto</button>
                <button className="primary-button" onClick={() => setEditingPurchase(emptyPurchaseDraft())}><ShoppingBag size={16} />Registrar compra</button>
              </div>
            </div>

            <div className="content-group">
              <h3>Configuración</h3>
              <div className="form-row">
                <label className="content-field"><span>Capital inicial (RD$)</span><input type="number" min={0} step="0.01" value={financeSettings.capitalInicial} onChange={(event) => setFinanceSettings((current) => ({ ...current, capitalInicial: event.target.value }))} /></label>
                <label className="content-field"><span>% que se reinvierte</span><input type="number" min={0} max={100} value={financeSettings.reinvestPercent} onChange={(event) => setFinanceSettings((current) => ({ ...current, reinvestPercent: event.target.value }))} /></label>
              </div>
              <button className="primary-button" disabled={busy} onClick={handleSaveFinanceSettings}><Check size={16} />{busy ? 'Guardando…' : 'Guardar configuración'}</button>
            </div>

            <h3>Capital</h3>
            <div className="admin-cards">
              <div className="admin-card"><span>Capital inicial</span><strong>{money(capitalInicial)}</strong></div>
              <div className="admin-card"><span>Capital usado (compras)</span><strong>{money(capitalUsado)}</strong></div>
              <div className="admin-card"><span>Capital recuperado (ventas)</span><strong>{money(capitalRecuperado)}</strong></div>
              <div className="admin-card"><span>Capital disponible</span><strong>{money(capitalDisponible)}</strong></div>
            </div>

            <h3>Ventas y ganancia</h3>
            <div className="admin-cards">
              <div className="admin-card"><span>Ingresos (pedidos pagados)</span><strong>{money(ingresos)}</strong></div>
              <div className="admin-card"><span>Costo de ventas</span><strong>{money(costoVentas)}</strong></div>
              <div className="admin-card"><span>Ganancia bruta</span><strong>{money(gananciaBruta)}</strong></div>
              <div className="admin-card"><span>Gastos del negocio</span><strong>{money(gastosNegocio)}</strong></div>
              <div className="admin-card"><span>Ganancia neta</span><strong>{money(gananciaNeta)}</strong></div>
              <div className="admin-card"><span>Reinversión ({reinvestPercent}%)</span><strong>{money(reinversion)}</strong></div>
              <div className="admin-card"><span>Para ti ({100 - reinvestPercent}%)</span><strong>{money(paraTi)}</strong></div>
              <div className="admin-card"><span>Gastos personales</span><strong>{money(gastosPersonales)}</strong></div>
            </div>
            <div className="admin-cards">
              <div className="admin-card"><span>Disponible para retirar</span><strong>{money(disponibleRetirar)}</strong></div>
            </div>
            <p className="admin-hint"><AlertTriangle size={14} />Solo cuentan los pedidos marcados "Pagado" en Pedidos. Un pedido "Pendiente" todavía no mueve el capital.</p>

            <h3>Compras recientes</h3>
            <div className="admin-table">
              {data.purchases.slice(0, 15).map((purchase) => <div className="admin-row" key={purchase.id}>
                <div><strong>{purchase.productName}</strong><span>{purchase.quantity} × {money(purchase.unitCost)} · {dateFmt(purchase.createdAt)}{purchase.notes ? ` · ${purchase.notes}` : ''}</span></div>
                <strong>{money(purchase.totalCost)}</strong>
              </div>)}
              {!data.purchases.length && <p className="admin-empty">Todavía no has registrado compras.</p>}
            </div>

            <h3>Gastos recientes</h3>
            <div className="admin-table">
              {data.expenses.slice(0, 15).map((expense) => <div className="admin-row" key={expense.id}>
                <div><strong>{expense.description}</strong><span>{dateFmt(expense.createdAt)}</span></div>
                <span className={`status-pill status-${expense.type}`}>{expense.type === 'negocio' ? 'Negocio' : 'Personal'}</span>
                <strong>{money(expense.amount)}</strong>
                <div className="admin-row-actions">
                  <button onClick={() => { if (window.confirm('¿Borrar este gasto?')) withBusy(() => deleteExpense({ data: expense.id })) }}><Trash2 size={15} /></button>
                </div>
              </div>)}
              {!data.expenses.length && <p className="admin-empty">Todavía no has registrado gastos.</p>}
            </div>
          </section>
        )}

        {tab === 'catalogo' && (
          <section>
            <div className="admin-section-head">
              <h2>Catálogo</h2>
              <button className="primary-button" onClick={() => setEditing(emptyDraft())}><Plus size={16} />Nuevo producto</button>
            </div>
            <label className="search-field admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto..." /></label>
            <div className="admin-table">
              {filteredProducts.map((product) => <div className="admin-row admin-row-product" key={product.id}>
                <img src={product.image || '/logo.png'} alt="" />
                <div><strong>{product.name}</strong><span>{product.category} · {product.stock} en stock · Costo prom. {money(product.cost)}{!product.active && ' · Oculto'}{product.options && ` · Opciones: ${product.options}`}</span></div>
                <div className="admin-row-price">{product.originalPrice > product.price && <s>{money(product.originalPrice)}</s>}<strong>{money(product.price)}</strong></div>
                <div className="admin-row-actions">
                  <button onClick={() => setEditing(toDraft(product))}><Pencil size={15} /></button>
                  <button onClick={() => withBusy(() => deleteProduct({ data: product.id }))}><Trash2 size={15} /></button>
                </div>
              </div>)}
              {!filteredProducts.length && <p className="admin-empty">No hay productos que coincidan.</p>}
            </div>
          </section>
        )}

        {tab === 'pedidos' && (
          <section>
            <h2>Pedidos</h2>
            <label className="search-field admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número, cliente o teléfono..." /></label>
            <div className="admin-table">
              {filteredOrders.map((order) => <div className="admin-order" key={order.id}>
                <div className="admin-order-head">
                  <div><strong>{order.orderNumber}</strong><span>{dateFmt(order.createdAt)}</span></div>
                  <button className="icon-button" onClick={() => { if (window.confirm('¿Enviar este pedido a la papelera?')) withBusy(() => deleteOrder({ data: order.id })) }}><Trash2 size={15} /></button>
                </div>
                <p className="admin-order-customer">{order.customerName} · {order.phone}{order.address ? ` · ${order.address}` : ''}</p>
                <ul className="admin-order-items">{order.items.map((item) => <li key={item.id}>{item.quantity}× {item.name} <span>{money(item.price * item.quantity)}</span></li>)}</ul>
                <div className="admin-order-foot">
                  <select value={order.status} onChange={(event) => withBusy(() => updateOrderStatus({ data: { id: order.id, status: event.target.value, paymentStatus: order.paymentStatus } }))}>
                    {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select value={order.paymentStatus} onChange={(event) => withBusy(() => updateOrderStatus({ data: { id: order.id, status: order.status, paymentStatus: event.target.value } }))}>
                    {PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <strong>{money(order.total)}</strong>
                </div>
              </div>)}
              {!filteredOrders.length && <p className="admin-empty">No hay pedidos que coincidan.</p>}
            </div>
          </section>
        )}

        {tab === 'clientes' && (
          <section>
            <div className="admin-section-head">
              <h2>Clientes</h2>
              <button className="primary-button" onClick={() => setEditingCustomer({ name: '', email: '', phone: '', address: '', notes: '' })}><Plus size={16} />Nuevo cliente</button>
            </div>
            <label className="search-field admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente..." /></label>
            <div className="admin-table">
              {filteredCustomers.map((customer) => <div className="admin-row" key={customer.id}>
                <div><strong>{customer.name}</strong><span>{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</span></div>
                <div className="admin-row-actions">
                  <button onClick={() => setEditingCustomer(customer)}><Pencil size={15} /></button>
                  <button onClick={() => withBusy(() => deleteCustomer({ data: customer.id }))}><Trash2 size={15} /></button>
                </div>
              </div>)}
              {!filteredCustomers.length && <p className="admin-empty">No hay clientes que coincidan.</p>}
            </div>
          </section>
        )}

        {tab === 'contenido' && (
          <section>
            <div className="admin-section-head">
              <h2>Contenido del sitio</h2>
              <button className="primary-button" disabled={busy} onClick={handleSaveContent}><Check size={16} />{busy ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
            {CONTENT_GROUPS.map((group) => <div className="content-group" key={group.title}>
              <h3>{group.title}</h3>
              {group.fields.map((field) => <label className="content-field" key={field.key}>
                <span>{field.label}</span>
                {field.type === 'textarea'
                  ? <textarea rows={3} value={contentDraft[field.key] ?? ''} onChange={(event) => setContentDraft((current) => ({ ...current, [field.key]: event.target.value }))} />
                  : <input value={contentDraft[field.key] ?? ''} onChange={(event) => setContentDraft((current) => ({ ...current, [field.key]: event.target.value }))} />}
              </label>)}
            </div>)}
          </section>
        )}

        {tab === 'papelera' && (
          <section>
            <h2>Papelera</h2>
            <p className="admin-hint"><AlertTriangle size={14} />Lo que envíes aquí se elimina definitivamente (junto a su imagen) 30 días después.</p>
            <h3>Productos</h3>
            <div className="admin-table">
              {data.trash.products.map((product) => <div className="admin-row" key={product.id}>
                <div><strong>{product.name}</strong><span>Quedan {product.deletedAt ? daysLeft(product.deletedAt) : 30} días</span></div>
                <div className="admin-row-actions">
                  <button onClick={() => withBusy(() => restoreProduct({ data: product.id }))}><RotateCcw size={15} /></button>
                  <button onClick={() => { if (window.confirm('¿Eliminar definitivamente? No se puede deshacer.')) withBusy(() => purgeProduct({ data: product.id })) }}><Trash2 size={15} /></button>
                </div>
              </div>)}
              {!data.trash.products.length && <p className="admin-empty">Vacío.</p>}
            </div>
            <h3>Pedidos</h3>
            <div className="admin-table">
              {data.trash.orders.map((order) => <div className="admin-row" key={order.id}>
                <div><strong>{order.orderNumber}</strong><span>Quedan {order.deletedAt ? daysLeft(order.deletedAt) : 30} días</span></div>
                <div className="admin-row-actions">
                  <button onClick={() => withBusy(() => restoreOrder({ data: order.id }))}><RotateCcw size={15} /></button>
                  <button onClick={() => { if (window.confirm('¿Eliminar definitivamente? No se puede deshacer.')) withBusy(() => purgeOrder({ data: order.id })) }}><Trash2 size={15} /></button>
                </div>
              </div>)}
              {!data.trash.orders.length && <p className="admin-empty">Vacío.</p>}
            </div>
            <h3>Clientes</h3>
            <div className="admin-table">
              {data.trash.customers.map((customer) => <div className="admin-row" key={customer.id}>
                <div><strong>{customer.name}</strong><span>Quedan {customer.deletedAt ? daysLeft(customer.deletedAt) : 30} días</span></div>
                <div className="admin-row-actions">
                  <button onClick={() => withBusy(() => restoreCustomer({ data: customer.id }))}><RotateCcw size={15} /></button>
                  <button onClick={() => { if (window.confirm('¿Eliminar definitivamente? No se puede deshacer.')) withBusy(() => purgeCustomer({ data: customer.id })) }}><Trash2 size={15} /></button>
                </div>
              </div>)}
              {!data.trash.customers.length && <p className="admin-empty">Vacío.</p>}
            </div>
            {data.trash.images.length > 0 && <>
              <h3>Imágenes en espera de borrado</h3>
              <p className="admin-hint">Se borran solas de GitHub cuando corresponda; esta lista es solo informativa.</p>
              <div className="admin-table">
                {data.trash.images.map((image) => <div className="admin-row" key={image.id}><div><strong>{image.path.split('/').pop()}</strong><span>{image.reason} · Quedan {daysLeft(image.deletedAt)} días</span></div></div>)}
              </div>
            </>}
          </section>
        )}
      </main>

      {editing && <div className="modal-wrap"><div className="modal-card">
        <button className="modal-close icon-button" onClick={() => setEditing(null)}><X /></button>
        <h2>{editing.id ? 'Editar producto' : 'Nuevo producto'}</h2>
        <form className="product-form" onSubmit={handleSaveProduct}>
          <label>Foto del producto
            <div className="image-upload">
              {editing.image && <img src={editing.image} alt="" />}
              <label className="upload-button">{uploading ? 'Subiendo…' : <><Upload size={15} />Subir imagen</>}<input type="file" accept="image/*" hidden onChange={handleImageChange} disabled={uploading} /></label>
            </div>
          </label>
          <label>Nombre<input required value={editing.name} onChange={(event) => setEditing((current) => current && { ...current, name: event.target.value })} /></label>
          <label>Categoría
            <select value={editing.category} onChange={(event) => setEditing((current) => current && { ...current, category: event.target.value })}>
              {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label>Descripción<textarea rows={3} value={editing.description} onChange={(event) => setEditing((current) => current && { ...current, description: event.target.value })} /></label>
          <label>Opciones (colores/diseños, separadas por coma — déjalo vacío si no aplica)<input value={editing.options} onChange={(event) => setEditing((current) => current && { ...current, options: event.target.value })} placeholder="Ej. Negro, Azul, Transparente" /></label>
          <div className="form-row">
            <label>Precio de venta (RD$)<input required type="number" min={0} step="0.01" value={editing.price} onChange={(event) => setEditing((current) => current && { ...current, price: event.target.value })} /></label>
            <label>Precio anterior (RD$, opcional)<input type="number" min={0} step="0.01" value={editing.originalPrice} onChange={(event) => setEditing((current) => current && { ...current, originalPrice: event.target.value })} /></label>
          </div>
          <label>Existencias<input required type="number" min={0} value={editing.stock} onChange={(event) => setEditing((current) => current && { ...current, stock: event.target.value })} /></label>
          <div className="form-checks">
            <label><input type="checkbox" checked={editing.featured} onChange={(event) => setEditing((current) => current && { ...current, featured: event.target.checked })} />Destacado</label>
            <label><input type="checkbox" checked={editing.isNew} onChange={(event) => setEditing((current) => current && { ...current, isNew: event.target.checked })} />Nuevo</label>
            <label><input type="checkbox" checked={editing.bestSeller} onChange={(event) => setEditing((current) => current && { ...current, bestSeller: event.target.checked })} />Más vendido</label>
            <label><input type="checkbox" checked={editing.active} onChange={(event) => setEditing((current) => current && { ...current, active: event.target.checked })} />Visible en la tienda</label>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy || uploading}>{busy ? 'Guardando…' : 'Guardar producto'}</button>
        </form>
      </div></div>}

      {editingCustomer && <div className="modal-wrap"><div className="modal-card">
        <button className="modal-close icon-button" onClick={() => setEditingCustomer(null)}><X /></button>
        <h2>{editingCustomer.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
        <form className="product-form" onSubmit={handleSaveCustomer}>
          <label>Nombre<input required value={editingCustomer.name} onChange={(event) => setEditingCustomer((current) => current && { ...current, name: event.target.value })} /></label>
          <label>Teléfono<input value={editingCustomer.phone} onChange={(event) => setEditingCustomer((current) => current && { ...current, phone: event.target.value })} /></label>
          <label>Correo<input type="email" value={editingCustomer.email} onChange={(event) => setEditingCustomer((current) => current && { ...current, email: event.target.value })} /></label>
          <label>Dirección<input value={editingCustomer.address} onChange={(event) => setEditingCustomer((current) => current && { ...current, address: event.target.value })} /></label>
          <label>Notas<textarea rows={3} value={editingCustomer.notes} onChange={(event) => setEditingCustomer((current) => current && { ...current, notes: event.target.value })} /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cliente'}</button>
        </form>
      </div></div>}

      {editingPurchase && <div className="modal-wrap"><div className="modal-card">
        <button className="modal-close icon-button" onClick={() => setEditingPurchase(null)}><X /></button>
        <h2>Registrar compra</h2>
        <p>Suma al stock del producto y recalcula su costo promedio. No se puede editar ni borrar después — si te equivocas, registra otra compra que lo corrija.</p>
        <form className="product-form" onSubmit={handleSavePurchase}>
          <label>Producto
            <select required value={editingPurchase.productId} onChange={(event) => setEditingPurchase((current) => current && { ...current, productId: event.target.value })}>
              <option value="" disabled>Selecciona un producto</option>
              {data.products.map((product) => <option key={product.id} value={product.id}>{product.name} (stock actual: {product.stock})</option>)}
            </select>
          </label>
          <div className="form-row">
            <label>Cantidad comprada<input required type="number" min={1} value={editingPurchase.quantity} onChange={(event) => setEditingPurchase((current) => current && { ...current, quantity: event.target.value })} /></label>
            <label>Costo por unidad (RD$)<input required type="number" min={0} step="0.01" value={editingPurchase.unitCost} onChange={(event) => setEditingPurchase((current) => current && { ...current, unitCost: event.target.value })} /></label>
          </div>
          <label>Notas (opcional)<input value={editingPurchase.notes} onChange={(event) => setEditingPurchase((current) => current && { ...current, notes: event.target.value })} placeholder="Ej. proveedor, factura..." /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy}>{busy ? 'Guardando…' : 'Registrar compra'}</button>
        </form>
      </div></div>}

      {editingExpense && <div className="modal-wrap"><div className="modal-card">
        <button className="modal-close icon-button" onClick={() => setEditingExpense(null)}><X /></button>
        <h2>Registrar gasto</h2>
        <form className="product-form" onSubmit={handleSaveExpense}>
          <label>Tipo
            <select value={editingExpense.type} onChange={(event) => setEditingExpense((current) => current && { ...current, type: event.target.value as 'negocio' | 'personal' })}>
              <option value="negocio">Gasto del negocio (resta de la ganancia)</option>
              <option value="personal">Gasto o retiro personal (resta de lo tuyo)</option>
            </select>
          </label>
          <label>Descripción<input required value={editingExpense.description} onChange={(event) => setEditingExpense((current) => current && { ...current, description: event.target.value })} placeholder="Ej. transporte, comida, retiro..." /></label>
          <label>Monto (RD$)<input required type="number" min={0} step="0.01" value={editingExpense.amount} onChange={(event) => setEditingExpense((current) => current && { ...current, amount: event.target.value })} /></label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy}>{busy ? 'Guardando…' : 'Registrar gasto'}</button>
        </form>
      </div></div>}
    </div>
  )
}
