import { useEffect, useState } from 'react'
import type { ChangeEvent, ComponentType, FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle, Check, ChevronLeft, Download, LayoutDashboard, ListOrdered, LogOut, Package,
  Pencil, Plus, RotateCcw, Search, Share2, ShoppingBag, Trash2, Upload, Users, Wallet, X,
} from 'lucide-react'
import {
  CATEGORIES, checkSession, deleteCustomer, deleteExpense, deleteOrder, deletePurchase, deleteProduct,
  getAdminData, login, logout, purgeCustomer, purgeOrder, purgeProduct, recordExpense,
  recordPurchase, restoreCustomer, restoreOrder, restoreProduct, saveContent, saveCustomer,
  saveProduct, updateOrder, updateOrderStatus,
} from '@/lib/store'

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(value / 100)
const dateFmt = (value: string) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

type Product = { id: number; name: string; category: string; description: string; options: string; price: number; originalPrice: number; stock: number; cost: number; image: string; variantImages: Array<{ option: string; image: string; description: string }>; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean; createdAt: string; deletedAt: string | null }
type OrderItem = { id: number; name: string; price: number; quantity: number; cost: number }
type Order = { id: number; orderNumber: string; customerName: string; email: string; phone: string; address: string; items: OrderItem[]; discount: number; total: number; status: string; paymentStatus: string; notes: string; createdAt: string; deletedAt: string | null }
type Customer = { id: number; name: string; email: string; phone: string; address: string; notes: string; createdAt: string; deletedAt: string | null }
type ImageTrashRow = { id: number; path: string; url: string; reason: string; deletedAt: string }

/** Carga jsPDF desde CDN la primera vez que hace falta (al ver/descargar
 * una factura), igual que el recibo del cliente carga html2canvas — así
 * no toca instalarlo como dependencia local. */
let jsPdfPromise: Promise<any> | null = null
function loadJsPdf(): Promise<any> {
  const existing = (window as any).jspdf
  if (existing) return Promise.resolve(existing.jsPDF)
  if (!jsPdfPromise) {
    jsPdfPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
      script.onload = () => resolve((window as any).jspdf.jsPDF)
      script.onerror = () => reject(new Error('No se pudo cargar el generador de PDF.'))
      document.head.appendChild(script)
    })
  }
  return jsPdfPromise
}

function buildInvoiceDoc(JsPDF: any, order: Order) {
  const doc = new JsPDF({ unit: 'pt', format: 'a4' })
  const today = dateFmt(order.createdAt)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(15, 23, 42)
  doc.text('JB TECH STORE', 40, 50)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100)
  doc.text('Factura de pedido', 40, 68)
  doc.setDrawColor(220); doc.line(40, 82, 555, 82)

  doc.setFontSize(11); doc.setTextColor(30)
  doc.text(`Pedido: ${order.orderNumber}`, 40, 104)
  doc.text(`Fecha: ${today}`, 40, 120)
  doc.text(`Cliente: ${order.customerName}`, 40, 142)
  doc.text(`Teléfono: ${order.phone || '-'}`, 40, 158)
  if (order.address) doc.text(`Dirección: ${order.address}`, 40, 174, { maxWidth: 400 })

  let y = 205
  doc.setFont('helvetica', 'bold')
  doc.text('Producto', 40, y); doc.text('Cant.', 400, y); doc.text('Precio', 555, y, { align: 'right' })
  y += 6; doc.setDrawColor(220); doc.line(40, y, 555, y); y += 18
  doc.setFont('helvetica', 'normal')
  for (const item of order.items) {
    doc.text(item.name, 40, y, { maxWidth: 330 })
    doc.text(String(item.quantity), 400, y)
    doc.text(money(item.price * item.quantity), 555, y, { align: 'right' })
    y += 22
  }
  y += 8; doc.setDrawColor(220); doc.line(40, y, 555, y); y += 24
  if (order.discount > 0) {
    const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(30)
    doc.text('Subtotal', 40, y); doc.text(money(subtotal), 555, y, { align: 'right' }); y += 18
    doc.text('Descuento', 40, y); doc.text(`-${money(order.discount)}`, 555, y, { align: 'right' }); y += 22
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13)
  doc.text('Total', 40, y); doc.text(money(order.total), 555, y, { align: 'right' })

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(140)
  doc.text('Gracias por comprar en JB Tech Store.', 40, y + 40)
  return doc
}
type Purchase = { id: number; productId: number; productName: string; quantity: number; unitCost: number; totalCost: number; remainingQuantity: number; notes: string; createdAt: string }
type Expense = { id: number; type: 'negocio' | 'personal'; description: string; amount: number; createdAt: string }
type AdminData = { products: Product[]; orders: Order[]; customers: Customer[]; content: Record<string, string>; purchases: Purchase[]; expenses: Expense[]; trash: { products: Product[]; orders: Order[]; customers: Customer[]; images: ImageTrashRow[] } }
type ProductDraft = { id?: number; name: string; category: string; description: string; options: string; price: string; originalPrice: string; stock: string; image: string; variantImages: Array<{ option: string; image: string; description: string }>; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean }
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

const CONTENT_GROUPS: Array<{ title: string; fields: Array<{ key: string; label: string; type?: 'textarea' | 'select'; options?: Array<{ value: string; label: string }>; showIf?: (draft: Record<string, string>) => boolean }> }> = [
  { title: 'Marca', fields: [
    { key: 'brandName', label: 'Nombre de la marca' },
    { key: 'brandTagline', label: 'Eslogan' },
    { key: 'welcomeVoiceMode', label: 'Bienvenida al entrar a la tienda', type: 'select', options: [{ value: 'audio', label: 'Voz por audio' }, { value: 'texto', label: 'Voz por texto' }, { value: 'desactivado', label: 'Desactivado' }] },
    // Solo si arriba está en "Voz por audio": se reproduce un archivo mp3 real.
    { key: 'welcomeVoiceGender', label: 'Voz de audio — Mujer / Hombre', type: 'select', options: [{ value: 'mujer', label: 'Mujer' }, { value: 'hombre', label: 'Hombre' }], showIf: (d) => (d.welcomeVoiceMode || 'audio') === 'audio' },
    { key: 'welcomeAudioUrl', label: 'Archivo de audio — voz de MUJER', showIf: (d) => (d.welcomeVoiceMode || 'audio') === 'audio' },
    { key: 'welcomeAudioUrlHombre', label: 'Archivo de audio — voz de HOMBRE', showIf: (d) => (d.welcomeVoiceMode || 'audio') === 'audio' },
    // Solo si arriba está en "Voz por texto": lo lee el navegador (sin mp3).
    { key: 'welcomeVoiceGenderTexto', label: 'Voz por texto — Mujer / Hombre', type: 'select', options: [{ value: 'mujer', label: 'Mujer' }, { value: 'hombre', label: 'Hombre' }], showIf: (d) => d.welcomeVoiceMode === 'texto' },
    { key: 'welcomeVoiceText', label: 'Mensaje de bienvenida por voz (usa "..." donde quieras una pausa)', showIf: (d) => d.welcomeVoiceMode === 'texto' },
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

/** Achica la foto en el teléfono ANTES de subirla: máximo 1600 px de lado
 * y formato WebP (~85% calidad). Una foto de cámara de 4–6 MB queda en
 * ~200–400 KB: sube mucho más rápido y la tienda carga más rápido para
 * los clientes. Si el navegador no puede procesarla, se sube la original. */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  try {
    const bitmap = await createImageBitmap(file)
    const MAX = 1600
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size < 400_000) { bitmap.close(); return file }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' })
  } catch {
    return file
  }
}

async function uploadFile(original: File): Promise<string> {
  const file = await compressImage(original)
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

function parseOptions(options: string) {
  return options.split(',').map((item) => item.trim()).filter(Boolean)
}

function emptyDraft(): ProductDraft {
  return { name: '', category: CATEGORIES[0], description: '', options: '', price: '', originalPrice: '', stock: '0', image: '', variantImages: [], featured: false, isNew: false, bestSeller: false, active: true }
}

function toDraft(product: Product): ProductDraft {
  return { id: product.id, name: product.name, category: product.category, description: product.description, options: product.options, price: String(product.price / 100), originalPrice: product.originalPrice ? String(product.originalPrice / 100) : '', stock: String(product.stock), image: product.image, variantImages: product.variantImages || [], featured: product.featured, isNew: product.isNew, bestSeller: product.bestSeller, active: product.active }
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
  const [uploadingVariant, setUploadingVariant] = useState<string | null>(null)
  const [editing, setEditing] = useState<ProductDraft | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<CustomerDraft | null>(null)
  const [contentDraft, setContentDraft] = useState<Record<string, string>>({})
  const [editingPurchase, setEditingPurchase] = useState<PurchaseDraft | null>(null)
  const [editingExpense, setEditingExpense] = useState<ExpenseDraft | null>(null)
  const [editingOrder, setEditingOrder] = useState<{ id: number; customerName: string; email: string; phone: string; address: string; notes: string; items: OrderItem[]; discount: number } | null>(null)
  const [financeSettings, setFinanceSettings] = useState({ capitalInicial: '0', reinvestPercent: '70' })
  const [browserVoices, setBrowserVoices] = useState<string[] | null>(null)
  const [purchaseQuery, setPurchaseQuery] = useState('')
  const [purchaseLimit, setPurchaseLimit] = useState(15)
  const [expenseLimit, setExpenseLimit] = useState(15)

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

  // Muestra qué voces en español expone de verdad el navegador donde se
  // abre este panel (no las del visitante). Sirve para entender por qué
  // "Mujer/Hombre" a veces suena igual: muchos Android/Chrome solo traen
  // UNA voz en español instalada, así que no hay entre qué elegir todavía.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const readVoices = () => {
      const names = window.speechSynthesis.getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith('es'))
        .map((voice) => `${voice.name} (${voice.lang})`)
      setBrowserVoices(names)
    }
    readVoices()
    window.speechSynthesis.addEventListener('voiceschanged', readVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', readVoices)
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
        variantImages: editing.variantImages,
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

  function upsertVariant(option: string, patch: Partial<{ image: string; description: string }>) {
    setEditing((current) => {
      if (!current) return current
      const idx = current.variantImages.findIndex((entry) => entry.option === option)
      const variantImages = idx === -1
        ? [...current.variantImages, { option, image: '', description: '', ...patch }]
        : current.variantImages.map((entry, i) => (i === idx ? { ...entry, ...patch } : entry))
      return { ...current, variantImages }
    })
  }

  async function handleVariantImageChange(option: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !editing) return
    setUploadingVariant(option)
    setError('')
    try {
      const url = await uploadFile(file)
      upsertVariant(option, { image: url })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos subir la imagen.')
    } finally {
      setUploadingVariant(null)
      event.target.value = ''
    }
  }

  function handleRemoveVariantImage(option: string) {
    setEditing((current) => current && { ...current, variantImages: current.variantImages.filter((entry) => entry.option !== option) })
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

  async function handleSaveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingOrder) return
    await withBusy(async () => {
      await updateOrder({ data: {
        id: editingOrder.id,
        customerName: editingOrder.customerName,
        email: editingOrder.email,
        phone: editingOrder.phone,
        address: editingOrder.address,
        notes: editingOrder.notes,
        items: editingOrder.items,
        discount: editingOrder.discount,
      } })
      setEditingOrder(null)
    })
  }

  async function handleDownloadInvoice(order: Order) {
    await withBusy(async () => {
      const JsPDF = await loadJsPdf()
      buildInvoiceDoc(JsPDF, order).save(`Factura-${order.orderNumber}.pdf`)
    })
  }

  async function handleShareInvoice(order: Order) {
    await withBusy(async () => {
      const JsPDF = await loadJsPdf()
      const doc = buildInvoiceDoc(JsPDF, order)
      const file = new File([doc.output('blob')], `Factura-${order.orderNumber}.pdf`, { type: 'application/pdf' })
      const nav = navigator as any
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try { await nav.share({ files: [file], title: `Factura ${order.orderNumber}` }) }
        catch (err) { if ((err as Error)?.name !== 'AbortError') doc.save(file.name) }
      } else {
        doc.save(file.name)
      }
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
  const filteredPurchases = data.purchases.filter((purchase) => `${purchase.productName} ${purchase.notes}`.toLowerCase().includes(purchaseQuery.toLowerCase()))
  const filteredCustomers = data.customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase().includes(query.toLowerCase()))
  const pendingOrders = data.orders.filter((order) => order.status === 'Pendiente').length
  const outOfStock = data.products.filter((product) => product.stock === 0).length
  const lowStock = data.products.filter((product) => product.active && product.stock > 0 && product.stock <= 3)
  const porCobrarOrders = data.orders.filter((order) => order.paymentStatus !== 'Pagado' && order.status !== 'Cancelado')
  const porCobrar = porCobrarOrders.reduce((sum, order) => sum + order.total, 0)
  // Unidades en stock que no tienen una compra registrada detrás: al
  // venderse, su costo cuenta como 0 y la ganancia sale inflada.
  const remainingByProduct = new Map<number, number>()
  for (const purchase of data.purchases) remainingByProduct.set(purchase.productId, (remainingByProduct.get(purchase.productId) ?? 0) + (purchase.remainingQuantity ?? 0))
  const uncostedProducts = data.products.filter((product) => product.stock > (remainingByProduct.get(product.id) ?? 0) && product.cost === 0)
  const trashTotal = data.trash.products.length + data.trash.orders.length + data.trash.customers.length + data.trash.images.length

  // Finanzas: todo se calcula a partir de pedidos pagados + compras +
  // gastos registrados, igual espíritu que el "Resumen" del Excel de
  // Yeilin pero automático. `cost` en cada item del pedido es una copia
  // del costo promedio del producto al momento de la venta.
  // Un pedido cancelado no cuenta aunque haya quedado marcado "Pagado"
  // (por ejemplo, si se le devolvió el dinero al cliente).
  const paidOrders = data.orders.filter((order) => order.paymentStatus === 'Pagado' && order.status !== 'Cancelado')
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
              <div className="admin-card"><span>Por cobrar ({porCobrarOrders.length})</span><strong>{money(porCobrar)}</strong></div>
              <div className="admin-card"><span>Stock bajo (≤3)</span><strong>{lowStock.length}</strong></div>
            </div>
            {lowStock.length > 0 && <>
              <h3>Quedan pocas unidades</h3>
              <div className="admin-table">
                {lowStock.slice(0, 8).map((product) => <div className="admin-row admin-row-product" key={product.id}>
                  <img src={product.image || '/logo.png'} alt="" />
                  <div><strong>{product.name}</strong><span>Quedan {product.stock}</span></div>
                  <button className="ghost-button" onClick={() => { setTab('finanzas'); setEditingPurchase({ ...emptyPurchaseDraft(), productId: String(product.id) }) }}>Reponer</button>
                </div>)}
              </div>
            </>}
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
              <div className="admin-card"><span>Por cobrar ({porCobrarOrders.length} pedidos)</span><strong>{money(porCobrar)}</strong></div>
            </div>
            <p className="admin-hint"><AlertTriangle size={14} />Solo cuentan los pedidos marcados "Pagado" (y que no estén cancelados). Un pedido sin pagar todavía no mueve el capital: aparece en "Por cobrar".</p>
            {uncostedProducts.length > 0 && (
              <p className="form-error">
                {uncostedProducts.length === 1 ? '1 producto tiene' : `${uncostedProducts.length} productos tienen`} unidades en stock sin una compra registrada, así que su costo cuenta como RD$0 y la ganancia sale más alta de lo real: {uncostedProducts.slice(0, 5).map((product) => product.name).join(', ')}{uncostedProducts.length > 5 ? '…' : ''}. Para corregirlo, pon esas existencias en 0 en Catálogo y regístralas con «Registrar compra».
              </p>
            )}

            <h3>Compras registradas ({data.purchases.length})</h3>
            <label className="search-field admin-search"><Search size={16} /><input value={purchaseQuery} onChange={(event) => { setPurchaseQuery(event.target.value); setPurchaseLimit(15) }} placeholder="Buscar compra por producto o nota..." /></label>
            <div className="admin-table">
              {filteredPurchases.slice(0, purchaseLimit).map((purchase) => {
                const sold = purchase.quantity - (purchase.remainingQuantity ?? 0)
                return <div className="admin-row" key={purchase.id}>
                  <div><strong>{purchase.productName}</strong><span>{purchase.quantity} × {money(purchase.unitCost)} · {dateFmt(purchase.createdAt)} · {sold <= 0 ? 'nada vendido aún' : purchase.remainingQuantity > 0 ? `vendidas ${sold}, quedan ${purchase.remainingQuantity}` : 'lote vendido completo'}{purchase.notes ? ` · ${purchase.notes}` : ''}</span></div>
                  <strong>{money(purchase.totalCost)}</strong>
                  <button className="icon-button" title="Eliminar compra (ej. si se registró mal)" disabled={busy || purchase.remainingQuantity <= 0} onClick={() => {
                    const message = sold > 0
                      ? `De este lote ya se vendieron ${sold}. No se puede borrar entero sin descuadrar las Finanzas, así que se quitarán solo las ${purchase.remainingQuantity} que quedan (del stock y del Capital usado). ¿Continuar?`
                      : `¿Eliminar esta compra? Se restan ${purchase.remainingQuantity} unidades del stock y ${money(purchase.totalCost)} vuelven al Capital disponible.`
                    if (window.confirm(message)) withBusy(() => deletePurchase({ data: purchase.id }))
                  }}><Trash2 size={15} /></button>
                </div>
              })}
              {!filteredPurchases.length && <p className="admin-empty">{data.purchases.length ? 'Ninguna compra coincide.' : 'Todavía no has registrado compras.'}</p>}
              {filteredPurchases.length > purchaseLimit && <button className="ghost-button" onClick={() => setPurchaseLimit((limit) => limit + 30)}>Ver más compras ({filteredPurchases.length - purchaseLimit} más)</button>}
            </div>

            <h3>Gastos registrados ({data.expenses.length})</h3>
            <div className="admin-table">
              {data.expenses.slice(0, expenseLimit).map((expense) => <div className="admin-row" key={expense.id}>
                <div><strong>{expense.description}</strong><span>{dateFmt(expense.createdAt)}</span></div>
                <span className={`status-pill status-${expense.type}`}>{expense.type === 'negocio' ? 'Negocio' : 'Personal'}</span>
                <strong>{money(expense.amount)}</strong>
                <div className="admin-row-actions">
                  <button onClick={() => { if (window.confirm('¿Borrar este gasto?')) withBusy(() => deleteExpense({ data: expense.id })) }}><Trash2 size={15} /></button>
                </div>
              </div>)}
              {!data.expenses.length && <p className="admin-empty">Todavía no has registrado gastos.</p>}
              {data.expenses.length > expenseLimit && <button className="ghost-button" onClick={() => setExpenseLimit((limit) => limit + 30)}>Ver más gastos ({data.expenses.length - expenseLimit} más)</button>}
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
                <div><strong>{product.name}</strong><span>{product.category} · {product.stock} en stock · Costo actual {money(product.cost)}{!product.active && ' · Oculto'}{product.options && ` · Opciones: ${product.options}`}{product.variantImages?.length > 0 && ` · ${product.variantImages.length} con foto propia`}</span></div>
                <div className="admin-row-price">{product.originalPrice > product.price && <s>{money(product.originalPrice)}</s>}<strong>{money(product.price)}</strong></div>
                <div className="admin-row-actions">
                  <button onClick={() => setEditing(toDraft(product))}><Pencil size={15} /></button>
                  <button onClick={() => { if (window.confirm(`¿Enviar «${product.name}» a la papelera? Deja de verse en la tienda; lo puedes restaurar durante 30 días.`)) withBusy(() => deleteProduct({ data: product.id })) }}><Trash2 size={15} /></button>
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
                  <div className="admin-order-actions">
                    <button className="icon-button" title="Editar pedido" onClick={() => setEditingOrder({ id: order.id, customerName: order.customerName, email: order.email, phone: order.phone, address: order.address, notes: order.notes, items: order.items.map((item) => ({ ...item })), discount: order.discount })}><Pencil size={15} /></button>
                    <button className="icon-button" title="Descargar factura (PDF)" disabled={busy} onClick={() => handleDownloadInvoice(order)}><Download size={15} /></button>
                    <button className="icon-button" title="Compartir factura" disabled={busy} onClick={() => handleShareInvoice(order)}><Share2 size={15} /></button>
                    <button className="icon-button" title="Enviar a la papelera" onClick={() => { if (window.confirm(order.status === 'Cancelado' ? '¿Enviar este pedido a la papelera?' : '¿Enviar este pedido a la papelera?\n\nOjo: esto NO devuelve las unidades al inventario. Si el pedido no se concretó, primero cámbialo a "Cancelado" (eso sí las devuelve).')) withBusy(() => deleteOrder({ data: order.id })) }}><Trash2 size={15} /></button>
                  </div>
                </div>
                <p className="admin-order-customer">{order.customerName} · {order.phone}{order.address ? ` · ${order.address}` : ''}</p>
                <ul className="admin-order-items">{order.items.map((item, index) => <li key={`${item.id}-${index}`}>{item.quantity}× {item.name} <span>{money(item.price * item.quantity)}</span></li>)}</ul>
                <div className="admin-order-foot">
                  <select value={order.status} disabled={busy} onChange={(event) => {
                    const next = event.target.value
                    const units = order.items.reduce((sum, item) => sum + item.quantity, 0)
                    if (next === 'Cancelado' && !window.confirm(`¿Cancelar el pedido ${order.orderNumber}? Sus ${units} unidades vuelven al inventario.`)) return
                    if (order.status === 'Cancelado' && next !== 'Cancelado' && !window.confirm(`¿Reactivar el pedido ${order.orderNumber}? Se vuelven a sacar ${units} unidades del inventario.`)) return
                    withBusy(() => updateOrderStatus({ data: { id: order.id, status: next, paymentStatus: order.paymentStatus } }))
                  }}>
                    {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select value={order.paymentStatus} disabled={busy} onChange={(event) => withBusy(() => updateOrderStatus({ data: { id: order.id, status: order.status, paymentStatus: event.target.value } }))}>
                    {PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  {order.discount > 0 && <span className="order-discount-tag">Descuento -{money(order.discount)}</span>}
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
              {group.fields.filter((field) => !field.showIf || field.showIf(contentDraft)).map((field) => <label className="content-field" key={field.key}>
                <span>{field.label}</span>
                {field.type === 'textarea'
                  ? <textarea rows={3} value={contentDraft[field.key] ?? ''} onChange={(event) => setContentDraft((current) => ({ ...current, [field.key]: event.target.value }))} />
                  : field.type === 'select'
                  ? <select value={contentDraft[field.key] ?? field.options?.[0]?.value ?? ''} onChange={(event) => setContentDraft((current) => ({ ...current, [field.key]: event.target.value }))}>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  : <input value={contentDraft[field.key] ?? ''} onChange={(event) => setContentDraft((current) => ({ ...current, [field.key]: event.target.value }))} />}
              </label>)}
              {group.title === 'Marca' && contentDraft.welcomeVoiceMode === 'texto' && (
                <p className="content-hint">
                  {browserVoices === null
                    ? 'Buscando voces en español en este navegador…'
                    : browserVoices.length === 0
                    ? 'Este navegador (el tuyo, ahora mismo) no tiene ninguna voz en español instalada.'
                    : browserVoices.length === 1
                    ? `Este navegador solo tiene UNA voz en español instalada: ${browserVoices[0]}. Por eso "Mujer/Hombre" apenas cambia el tono, no la voz — para que suene realmente distinto hay que instalar más voces en el teléfono (Ajustes → Voz a texto) o usar "Voz por audio" con un mp3 real.`
                    : `Voces en español que este navegador tiene disponibles: ${browserVoices.join(', ')}.`}
                </p>
              )}
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
          {parseOptions(editing.options).length > 0 && (
            <div className="variant-images">
              <p className="content-hint" style={{ margin: '0 0 4px' }}>Foto y descripción por opción (opcional). Si una opción se deja sin foto, en la tienda se usa la foto general de arriba.</p>
              {parseOptions(editing.options).map((option) => {
                const entry = editing.variantImages.find((item) => item.option === option)
                return (
                  <div className="variant-image-row" key={option}>
                    <strong>{option}</strong>
                    <div className="image-upload">
                      {entry?.image && <img src={entry.image} alt={option} />}
                      <label className="upload-button">{uploadingVariant === option ? 'Subiendo…' : <><Upload size={14} />{entry?.image ? 'Cambiar foto' : 'Subir foto'}</>}<input type="file" accept="image/*" hidden onChange={(event) => handleVariantImageChange(option, event)} disabled={uploadingVariant === option} /></label>
                      {entry && <button type="button" className="variant-remove-button" onClick={() => handleRemoveVariantImage(option)}>Quitar</button>}
                    </div>
                    <input value={entry?.description ?? ''} onChange={(event) => upsertVariant(option, { description: event.target.value })} placeholder={`Descripción para "${option}" (opcional)`} />
                  </div>
                )
              })}
            </div>
          )}
          <div className="form-row">
            <label>Precio de venta (RD$)<input required type="number" min={0} step="0.01" value={editing.price} onChange={(event) => setEditing((current) => current && { ...current, price: event.target.value })} /></label>
            <label>Precio anterior (RD$, opcional)<input type="number" min={0} step="0.01" value={editing.originalPrice} onChange={(event) => setEditing((current) => current && { ...current, originalPrice: event.target.value })} /></label>
          </div>
          {editing.id ? (
            <>
              <label>Existencias<input required type="number" min={0} value={editing.stock} onChange={(event) => setEditing((current) => current && { ...current, stock: event.target.value })} /></label>
              <p className="admin-hint"><AlertTriangle size={14} />Este número reemplaza la cantidad tal cual (no suma ni resta). Úsalo solo para corregir un conteo — no mueve el capital ni el costo promedio. Para sumar inventario nuevo usa «Registrar compra» en la pestaña Finanzas.</p>
            </>
          ) : (
            <>
              <label>Existencias<input type="number" value="0" disabled /></label>
              <p className="admin-hint"><AlertTriangle size={14} />Los productos nuevos siempre inician en 0. Guarda el producto y luego usa «Registrar compra» (pestaña Finanzas) para sumarle las unidades — así el costo también queda registrado y no se duplica el inventario.</p>
            </>
          )}
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

      {editingOrder && <div className="modal-wrap"><div className="modal-card">
        <button className="modal-close icon-button" onClick={() => setEditingOrder(null)}><X /></button>
        <h2>Editar pedido</h2>
        <p>Corrige los datos del cliente o los números de este pedido. Si cambias una cantidad o quitas un producto, el inventario se ajusta solo.</p>
        <form className="product-form" onSubmit={handleSaveOrder}>
          <label>Nombre del cliente<input required value={editingOrder.customerName} onChange={(event) => setEditingOrder((current) => current && { ...current, customerName: event.target.value })} /></label>
          <div className="form-row">
            <label>Teléfono<input value={editingOrder.phone} onChange={(event) => setEditingOrder((current) => current && { ...current, phone: event.target.value })} /></label>
            <label>Correo (opcional)<input value={editingOrder.email} onChange={(event) => setEditingOrder((current) => current && { ...current, email: event.target.value })} /></label>
          </div>
          <label>Dirección<input value={editingOrder.address} onChange={(event) => setEditingOrder((current) => current && { ...current, address: event.target.value })} /></label>
          <label>Notas (opcional)<input value={editingOrder.notes} onChange={(event) => setEditingOrder((current) => current && { ...current, notes: event.target.value })} /></label>
          <label>Productos del pedido</label>
          {editingOrder.items.map((item, index) => (
            <div className="order-edit-item" key={`${item.id}-${index}`}>
              <input value={item.name} onChange={(event) => setEditingOrder((current) => current && { ...current, items: current.items.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row) })} />
              <input type="number" min={1} value={item.quantity} onChange={(event) => setEditingOrder((current) => current && { ...current, items: current.items.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: Number(event.target.value) } : row) })} />
              <input type="number" min={0} step="0.01" value={item.price / 100} onChange={(event) => setEditingOrder((current) => current && { ...current, items: current.items.map((row, rowIndex) => rowIndex === index ? { ...row, price: Math.round(Number(event.target.value) * 100) } : row) })} />
              <button type="button" className="icon-button" disabled={editingOrder.items.length <= 1} onClick={() => setEditingOrder((current) => current && { ...current, items: current.items.filter((_, rowIndex) => rowIndex !== index) })}><X size={14} /></button>
            </div>
          ))}
          {(() => {
            const subtotal = editingOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
            const discount = Math.min(subtotal, editingOrder.discount)
            return <>
              <label>Descuento (RD$, opcional)<input type="number" min={0} step="0.01" value={editingOrder.discount / 100} onChange={(event) => setEditingOrder((current) => current && { ...current, discount: Math.round(Math.max(0, Number(event.target.value)) * 100) })} /></label>
              <p className="admin-hint"><AlertTriangle size={14} />Se resta del subtotal y queda reflejado como una línea aparte en la factura — no afecta el precio guardado de cada producto.</p>
              <p className="order-edit-total">Subtotal: {money(subtotal)}{discount > 0 && <> · Descuento: -{money(discount)}</>} · Nuevo total: <strong>{money(subtotal - discount)}</strong></p>
            </>
          })()}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
        </form>
      </div></div>}

      {editingPurchase && <div className="modal-wrap"><div className="modal-card">
        <button className="modal-close icon-button" onClick={() => setEditingPurchase(null)}><X /></button>
        <h2>Registrar compra</h2>
        <p>Suma las unidades al stock del producto y saca el dinero del Capital disponible. Si te equivocas, puedes borrarla desde «Compras registradas».</p>
        <form className="product-form" onSubmit={handleSavePurchase}>
          <label>Producto
            <select required value={editingPurchase.productId} onChange={(event) => setEditingPurchase((current) => current && { ...current, productId: event.target.value })}>
              <option value="" disabled>Selecciona un producto</option>
              {[...data.products].sort((a, b) => a.name.localeCompare(b.name)).map((product) => <option key={product.id} value={product.id}>{product.name} (stock actual: {product.stock})</option>)}
            </select>
          </label>
          <div className="form-row">
            <label>Cantidad comprada<input required type="number" min={1} value={editingPurchase.quantity} onChange={(event) => setEditingPurchase((current) => current && { ...current, quantity: event.target.value })} /></label>
            <label>Costo por unidad (RD$)<input required type="number" min={0} step="0.01" value={editingPurchase.unitCost} onChange={(event) => setEditingPurchase((current) => current && { ...current, unitCost: event.target.value })} /></label>
          </div>
          <label>Notas (opcional)<input value={editingPurchase.notes} onChange={(event) => setEditingPurchase((current) => current && { ...current, notes: event.target.value })} placeholder="Ej. proveedor, factura..." /></label>
          {Number(editingPurchase.quantity) > 0 && Number(editingPurchase.unitCost) >= 0 && editingPurchase.unitCost !== '' && (
            <p className="order-edit-total">Total de la compra: <strong>{money(Math.round(Number(editingPurchase.quantity) * Number(editingPurchase.unitCost) * 100))}</strong> · Capital disponible después: <strong>{money(capitalDisponible - Math.round(Number(editingPurchase.quantity) * Number(editingPurchase.unitCost) * 100))}</strong></p>
          )}
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
