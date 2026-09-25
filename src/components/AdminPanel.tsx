import { useEffect, useState } from 'react'
import type { ChangeEvent, ComponentType, FormEvent, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle, Bell, BellOff, Check, ChevronLeft, Download, Layers, Smartphone, LayoutDashboard, ListOrdered, LogOut, Package,
  Pencil, Plus, RotateCcw, Search, Share2, ShoppingBag, ShoppingCart, SlidersHorizontal, Trash2, Upload, Users, Wallet, X,
} from 'lucide-react'
import {
  CATEGORIES, checkSession, deleteCustomer, deleteExpense, deleteOrder, deletePurchase, deleteProduct,
  getAdminData, login, logout, purgeCustomer, purgeOrder, purgeProduct, recordExpense,
  recordManualSale, recordPurchase, restoreCustomer, restoreOrder, restoreProduct, saveContent, saveCustomer,
  saveProduct, splitPurchase, updateOrder, updateOrderStatus,
  getPushSetup, removePushSubscription, savePushSubscription, sendTestPush,
} from '@/lib/store'
import { fromBase64Url } from '@/lib/push'
import {
  hasOwnPrice, normalizeVariants, optionFromName, optionPrice, optionStock, parseOptions, priceRange, tracksOptionStock,
} from '@/lib/variants'
import type { ProductVariant } from '@/lib/variants'

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(value / 100)
const dateFmt = (value: string) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const shortDate = (value: string) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short' }).format(new Date(value))

type Product = { id: number; name: string; category: string; description: string; options: string; price: number; originalPrice: number; stock: number; cost: number; image: string; variantImages: ProductVariant[]; optionStock: boolean; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean; createdAt: string; deletedAt: string | null }
type OrderItem = { id: number; name: string; price: number; quantity: number; cost: number; option?: string }
type Order = { id: number; orderNumber: string; customerName: string; email: string; phone: string; address: string; items: OrderItem[]; discount: number; total: number; status: string; paymentStatus: string; notes: string; createdAt: string; deletedAt: string | null }
type Customer = { id: number; name: string; email: string; phone: string; address: string; notes: string; createdAt: string; deletedAt: string | null }
type ImageTrashRow = { id: number; path: string; url: string; reason: string; deletedAt: string }
type Purchase = { id: number; productId: number; productName: string; option: string; quantity: number; unitCost: number; totalCost: number; remainingQuantity: number; notes: string; createdAt: string }
type Expense = { id: number; type: 'negocio' | 'personal'; description: string; amount: number; createdAt: string }
type AdminData = { products: Product[]; orders: Order[]; customers: Customer[]; content: Record<string, string>; purchases: Purchase[]; expenses: Expense[]; trash: { products: Product[]; orders: Order[]; customers: Customer[]; images: ImageTrashRow[] } }

/** Una opción (color/diseño/modelo) mientras se edita el producto. `key`
 * no cambia aunque se le cambie el nombre, y `originalName` es el nombre
 * que tenía guardado — así sus compras la siguen si se renombra. */
type OptionDraft = { key: string; name: string; originalName: string; image: string; description: string; price: string; stock: string }
type ProductDraft = { id?: number; name: string; category: string; description: string; price: string; originalPrice: string; stock: string; image: string; optionStock: boolean; options: OptionDraft[]; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean }
type CustomerDraft = { id?: number; name: string; email: string; phone: string; address: string; notes: string }
type PurchaseLine = { option: string; quantity: string; unitCost: string }
type PurchaseDraft = { productId: string; notes: string; lines: PurchaseLine[]; sameCost: string }
type ExpenseDraft = { type: 'negocio' | 'personal'; description: string; amount: string }
type SaleLine = { productId: string; option: string; quantity: string; price: string }
type SaleDraft = { customerName: string; phone: string; notes: string; paymentStatus: string; lines: SaleLine[] }
type SplitDraft = { purchase: Purchase; parts: Record<string, string> }
type LotStatus = 'ahora' | 'espera' | 'vendido'

type CatalogFilter = 'todos' | 'agotados' | 'bajo' | 'sincosto' | 'ocultos'
const CATALOG_FILTERS: Array<{ id: CatalogFilter; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'agotados', label: 'Agotados' },
  { id: 'bajo', label: 'Quedan pocos' },
  { id: 'sincosto', label: 'Sin costo' },
  { id: 'ocultos', label: 'Ocultos' },
]
type Tab = 'resumen' | 'finanzas' | 'catalogo' | 'pedidos' | 'clientes' | 'contenido' | 'papelera'

const ORDER_STATUSES = ['Pendiente', 'Confirmado', 'Preparando', 'Enviado', 'Entregado', 'Cancelado']
const PAYMENT_STATUSES = ['Pendiente', 'Pagado']

let keySeq = 0
const newKey = () => `op-${Date.now().toString(36)}-${(keySeq++).toString(36)}`
const cents = (value: string) => Math.round(Number(value || 0) * 100)
const toMoneyInput = (value: number) => (value ? String(value / 100) : '')

function emptyOption(): OptionDraft {
  return { key: newKey(), name: '', originalName: '', image: '', description: '', price: '', stock: '0' }
}

function emptyDraft(): ProductDraft {
  return { name: '', category: CATEGORIES[0], description: '', price: '', originalPrice: '', stock: '0', image: '', optionStock: true, options: [], featured: false, isNew: false, bestSeller: false, active: true }
}

function toDraft(product: Product): ProductDraft {
  return {
    id: product.id, name: product.name, category: product.category, description: product.description,
    price: String(product.price / 100), originalPrice: toMoneyInput(product.originalPrice), stock: String(product.stock), image: product.image,
    optionStock: Boolean(product.optionStock),
    options: normalizeVariants(product).map((entry) => ({ key: newKey(), name: entry.option, originalName: entry.option, image: entry.image, description: entry.description, price: toMoneyInput(entry.price ?? 0), stock: String(entry.stock ?? 0) })),
    featured: product.featured, isNew: product.isNew, bestSeller: product.bestSeller, active: product.active,
  }
}

function purchaseDraftFor(product?: Product): PurchaseDraft {
  const lines = product && tracksOptionStock(product)
    ? parseOptions(product.options).map((option) => ({ option, quantity: '', unitCost: '' }))
    : [{ option: '', quantity: '1', unitCost: '' }]
  return { productId: product ? String(product.id) : '', notes: '', lines, sameCost: '' }
}

function emptyExpenseDraft(): ExpenseDraft {
  return { type: 'negocio', description: '', amount: '' }
}

/** Primera opción que se puede vender (si lleva cantidad por opción, la
 * primera que tenga unidades). */
function firstSellableOption(product: Product) {
  const options = parseOptions(product.options)
  if (!tracksOptionStock(product)) return options[0] ?? ''
  return options.find((option) => optionStock(product, option) > 0) ?? options[0] ?? ''
}

function emptySaleLine(product?: Product): SaleLine {
  const option = product ? firstSellableOption(product) : ''
  return { productId: product ? String(product.id) : '', option, quantity: '1', price: product ? String(optionPrice(product, option) / 100) : '' }
}

const byFifo = (a: Purchase, b: Purchase) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id

/** En qué turno está cada lote: "ahora" = el próximo del que va a salir
 * una venta; "espera" = le toca después; "vendido" = ya no le queda nada.
 * En un producto con cantidad por opción, cada opción tiene su propia fila
 * (sus lotes + los lotes generales sin opción). */
function lotStatuses(lots: Purchase[], product: Product | undefined): Map<number, LotStatus> {
  const statuses = new Map<number, LotStatus>()
  const tracking = product ? tracksOptionStock(product) : false
  for (const lot of lots) {
    if (lot.remainingQuantity <= 0) { statuses.set(lot.id, 'vendido'); continue }
    const pool = lots
      .filter((other) => other.remainingQuantity > 0 && (!tracking || (lot.option ? other.option === lot.option || other.option === '' : other.option === '')))
      .sort(byFifo)
    statuses.set(lot.id, pool[0]?.id === lot.id ? 'ahora' : 'espera')
  }
  return statuses
}

/** Costo del próximo lote que va a salir para esa opción (o del producto). */
function nextLotFor(lots: Purchase[], product: Product, option: string): Purchase | undefined {
  const tracking = tracksOptionStock(product)
  return lots
    .filter((lot) => lot.remainingQuantity > 0 && (!tracking || !option || lot.option === option || lot.option === ''))
    .sort(byFifo)[0]
}

const STATUS_LABEL: Record<LotStatus, string> = { ahora: 'Se vende ahora', espera: 'En espera', vendido: 'Vendido completo' }

function LotRow({ lot, status, showProduct, general, busy, onDelete, onSplit }: { lot: Purchase; status: LotStatus; showProduct?: boolean; general?: boolean; busy: boolean; onDelete: () => void; onSplit?: () => void }) {
  const sold = lot.quantity - lot.remainingQuantity
  const percent = lot.quantity > 0 ? Math.round((sold / lot.quantity) * 100) : 0
  return (
    <div className={`lot-row lot-${status}`}>
      <div className="lot-row-top">
        <div className="lot-row-title">
          {showProduct && <strong>{lot.productName}</strong>}
          {lot.option ? <span className="lot-option">{lot.option}</span> : general ? <span className="lot-option lot-option-general">Sin opción</span> : null}
        </div>
        <span className={`lot-badge lot-badge-${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <p className="lot-row-numbers"><b>{lot.quantity} × {money(lot.unitCost)}</b> = {money(lot.totalCost)} · {shortDate(lot.createdAt)}</p>
      <div className="lot-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      <p className="lot-row-foot">
        {sold <= 0 ? `Nada vendido todavía · quedan ${lot.remainingQuantity}` : lot.remainingQuantity > 0 ? `Vendidas ${sold} · quedan ${lot.remainingQuantity}` : `Se vendieron las ${lot.quantity}`}
        {lot.notes ? ` · ${lot.notes}` : ''}
      </p>
      {(onSplit || lot.remainingQuantity > 0) && (
        <div className="lot-row-actions">
          {onSplit && <button type="button" disabled={busy} onClick={onSplit}><SlidersHorizontal size={14} />Repartir entre opciones</button>}
          {lot.remainingQuantity > 0 && <button type="button" className="danger" disabled={busy} onClick={onDelete} title="Eliminar compra (si se registró mal)"><Trash2 size={14} />Borrar</button>}
        </div>
      )}
    </div>
  )
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return <details className="admin-details" open={defaultOpen}><summary>{title}</summary><div className="admin-details-body">{children}</div></details>
}

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

// ───────────────────────────────────────────────────────────────────────
// APP Y NOTIFICACIONES — instalar el panel como app ("JB Admin") y
// activar el aviso de cada pedido nuevo en este teléfono o computadora.
// ───────────────────────────────────────────────────────────────────────
type PushState = 'cargando' | 'no-soportado' | 'bloqueado' | 'apagado' | 'activo'
type PushDevice = { id: number; endpoint: string; label: string; createdAt: string }
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

function deviceLabel() {
  const ua = navigator.userAgent
  const system = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Computadora'
  const browser = /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Edg\//i.test(ua) ? 'Edge' : /Firefox/i.test(ua) ? 'Firefox' : /Chrome/i.test(ua) ? 'Chrome' : 'Navegador'
  return `${system} · ${browser}`
}

// Chrome avisa "se puede instalar" con el evento beforeinstallprompt. Se
// guarda aquí (y se evita su cartelito automático) para que la única forma
// de instalar sea el botón «Instalar app» del panel, ya con la sesión abierta.
let deferredInstall: InstallPromptEvent | null = null
const installListeners = new Set<(event: InstallPromptEvent | null) => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!window.location.pathname.startsWith('/admin')) return
    event.preventDefault()
    deferredInstall = event as InstallPromptEvent
    installListeners.forEach((listener) => listener(deferredInstall))
  })
  window.addEventListener('appinstalled', () => {
    deferredInstall = null
    installListeners.forEach((listener) => listener(null))
  })
}

/** Pone (o quita) el manifest de la app "JB Admin" en la página. Solo se
 * pone con la sesión abierta. */
function setAdminManifest(enabled: boolean) {
  const existing = document.getElementById('admin-manifest')
  if (enabled && !existing) {
    const link = document.createElement('link')
    link.id = 'admin-manifest'
    link.rel = 'manifest'
    link.href = '/admin.webmanifest'
    document.head.appendChild(link)
  } else if (!enabled && existing) {
    existing.remove()
  }
}

function isInstalledApp() {
  return typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true)
}

function AppAndNotifications() {
  const [state, setState] = useState<PushState>('cargando')
  const [devices, setDevices] = useState<PushDevice[]>([])
  const [endpoint, setEndpoint] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(() => deferredInstall)
  const [installed, setInstalled] = useState(false)

  async function load() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setState('no-soportado'); return }
    const registration = await navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' })
    const setup = await getPushSetup()
    setDevices(setup.devices as unknown as PushDevice[])
    const subscription = await registration.pushManager.getSubscription()
    setEndpoint(subscription?.endpoint ?? '')
    if (Notification.permission === 'denied') setState('bloqueado')
    else if (subscription && setup.devices.some((device) => device.endpoint === subscription.endpoint)) setState('activo')
    else setState('apagado')
  }

  useEffect(() => {
    setInstalled(isInstalledApp())
    load().catch(() => setState('no-soportado'))
    setInstallEvent(deferredInstall)
    const listener = (event: InstallPromptEvent | null) => {
      setInstallEvent(event)
      if (!event) setInstalled(true)
    }
    installListeners.add(listener)
    return () => { installListeners.delete(listener) }
  }, [])

  async function run(action: () => Promise<void>) {
    setWorking(true)
    setMessage('')
    try { await action() } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Algo salió mal. Intenta de nuevo.') } finally { setWorking(false) }
  }

  const enable = () => run(async () => {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'bloqueado' : 'apagado')
      throw new Error('Para recibir los pedidos tienes que tocar «Permitir» cuando el teléfono pregunte.')
    }
    const registration = await navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin' })
    await navigator.serviceWorker.ready
    const setup = await getPushSetup()
    // Si había una suscripción vieja (ej. de otras claves), se cambia por una nueva.
    const old = await registration.pushManager.getSubscription()
    if (old) await old.unsubscribe().catch(() => false)
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(setup.publicKey) })
    const json = subscription.toJSON()
    await savePushSubscription({ data: { endpoint: subscription.endpoint, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '', label: deviceLabel() } })
    await sendTestPush({ data: subscription.endpoint })
    await load()
    setMessage('Listo. Te acaba de llegar una notificación de prueba: así te van a llegar los pedidos.')
  })

  const disable = () => run(async () => {
    const registration = await navigator.serviceWorker.getRegistration('/admin')
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      await removePushSubscription({ data: subscription.endpoint })
      await subscription.unsubscribe().catch(() => false)
    }
    await load()
    setMessage('Notificaciones apagadas en este aparato.')
  })

  const test = () => run(async () => {
    await sendTestPush({ data: endpoint })
    setMessage('Prueba enviada. Debe llegarte en unos segundos.')
  })

  const removeDevice = (device: PushDevice) => run(async () => {
    if (!window.confirm(`¿Dejar de mandar avisos a «${device.label || 'ese aparato'}»?`)) return
    await removePushSubscription({ data: device.endpoint })
    await load()
  })

  const install = () => run(async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    deferredInstall = null
    setInstallEvent(null)
  })

  return (
    <div className="app-card">
      <div className="app-card-head">
        <img src="/admin-192.png" alt="" />
        <div><strong>App y avisos de pedidos</strong><span>Instala el panel como app y te llega una notificación (con el punto en el ícono) cada vez que un cliente hace un pedido, aunque la app esté cerrada.</span></div>
      </div>

      <div className="app-step">
        <b>1</b>
        <div>
          <strong>Instalar la app</strong>
          {installed
            ? <span className="app-ok"><Check size={14} />Ya la estás usando como app.</span>
            : installEvent
            ? <button type="button" className="primary-button" disabled={working} onClick={install}><Smartphone size={16} />Instalar app</button>
            : <span>Preparando el botón de instalar… Si en unos segundos no aparece, en Chrome toca el menú <b>⋮</b> → <b>«Instalar app»</b> (en la PC, el ícono de instalar en la barra de dirección).</span>}
        </div>
      </div>

      <div className="app-step">
        <b>2</b>
        <div>
          <strong>Avisos en este aparato</strong>
          {state === 'cargando' && <span>Revisando…</span>}
          {state === 'no-soportado' && <span>Este navegador no puede recibir notificaciones. Abre el panel en Chrome (Android o PC) o en Edge.</span>}
          {state === 'bloqueado' && <span className="app-warn">Las notificaciones están bloqueadas para esta página. Toca el candado junto a la dirección (o Ajustes del teléfono → Apps → JB Admin → Notificaciones) y ponlas en «Permitir»; luego vuelve aquí.</span>}
          {state === 'apagado' && <button type="button" className="primary-button" disabled={working} onClick={enable}><Bell size={16} />{working ? 'Activando…' : 'Activar notificaciones'}</button>}
          {state === 'activo' && <div className="app-actions">
            <span className="app-ok"><Check size={14} />Activadas en este aparato.</span>
            <button type="button" className="ghost-button" disabled={working} onClick={test}><Bell size={15} />Probar</button>
            <button type="button" className="ghost-button" disabled={working} onClick={disable}><BellOff size={15} />Apagar</button>
          </div>}
        </div>
      </div>

      {message && <p className="app-message">{message}</p>}

      {devices.length > 0 && (
        <div className="app-devices">
          <span>Los pedidos avisan a {devices.length === 1 ? '1 aparato' : `${devices.length} aparatos`}:</span>
          {devices.map((device) => (
            <div key={device.id} className="app-device">
              <Smartphone size={15} />
              <span>{device.label || 'Aparato'}{device.endpoint === endpoint ? ' (este)' : ''} · desde {shortDate(device.createdAt)}</span>
              <button type="button" aria-label="Quitar" disabled={working} onClick={() => removeDevice(device)}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function daysLeft(deletedAt: string) {
  const elapsed = Date.now() - new Date(deletedAt).getTime()
  return Math.max(0, 30 - Math.floor(elapsed / 86400000))
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
  const [financeView, setFinanceView] = useState<'compras' | 'gastos'>('compras')
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('todos')
  const [catalogCategory, setCatalogCategory] = useState('')
  const [saleDraft, setSaleDraft] = useState<SaleDraft | null>(null)
  const [lotsProductId, setLotsProductId] = useState<number | null>(null)
  const [splitDraft, setSplitDraft] = useState<SplitDraft | null>(null)
  const [pendingRestock, setPendingRestock] = useState<number | null>(null)
  const [notice, setNotice] = useState('')

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

  // Solo con la sesión abierta se ofrece instalar el panel como app.
  useEffect(() => { setAdminManifest(authenticated === true) }, [authenticated])

  // La notificación de un pedido abre /admin?tab=pedidos. Y al abrir o
  // volver a la app se quitan el punto del ícono y las notificaciones ya vistas.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('tab')
    if (wanted && ['resumen', 'finanzas', 'catalogo', 'pedidos', 'clientes', 'contenido', 'papelera'].includes(wanted)) setTab(wanted as Tab)
    const clearBadge = () => {
      if (document.visibilityState !== 'visible') return
      try { (navigator as any).clearAppBadge?.()?.catch?.(() => {}) } catch { /* sin soporte */ }
      navigator.serviceWorker?.getRegistration('/admin').then((registration) => registration?.getNotifications().then((list) => list.forEach((item) => item.close()))).catch(() => {})
    }
    clearBadge()
    document.addEventListener('visibilitychange', clearBadge)
    return () => document.removeEventListener('visibilitychange', clearBadge)
  }, [])

  // Recién creado un producto, se abre de una vez «Reponer» para registrar
  // cuántas unidades se compraron y a cuánto (un producto nuevo empieza en 0).
  useEffect(() => {
    if (!pendingRestock || !data) return
    const product = data.products.find((item) => item.id === pendingRestock)
    if (product) {
      setEditingPurchase(purchaseDraftFor(product))
      setNotice(`«${product.name}» quedó guardado. Ahora registra cuántas compraste y a cuánto cada una.`)
    }
    setPendingRestock(null)
  }, [pendingRestock, data])

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

  // ─── Producto: guardar y opciones ───
  function updateOption(key: string, patch: Partial<OptionDraft>) {
    setEditing((current) => current && { ...current, options: current.options.map((option) => (option.key === key ? { ...option, ...patch } : option)) })
  }

  function removeOption(key: string) {
    setEditing((current) => current && { ...current, options: current.options.filter((option) => option.key !== key) })
  }

  async function handleSaveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing) return
    // Las opciones se guardan separadas por coma, así que una coma dentro
    // del nombre lo partiría en dos: se cambia por "/".
    const names = editing.options.map((option) => option.name.replace(/,/g, '/').trim())
    if (names.some((name) => !name)) { setError('Ponle nombre a cada opción (o bórrala con la X).'); return }
    if (new Set(names).size !== names.length) { setError('Hay dos opciones con el mismo nombre. Cámbiale el nombre a una de ellas.'); return }
    const draft = editing
    let createdId = 0
    await withBusy(async () => {
      const id = await saveProduct({ data: {
        id: draft.id,
        name: draft.name,
        category: draft.category,
        description: draft.description,
        options: names.join(', '),
        price: cents(draft.price),
        originalPrice: cents(draft.originalPrice),
        stock: Math.round(Number(draft.stock || 0)),
        image: draft.image,
        variantImages: draft.options.map((option, index) => ({ option: names[index], image: option.image, description: option.description, price: cents(option.price), stock: Math.round(Number(option.stock || 0)) })),
        optionStock: draft.optionStock && names.length > 0,
        renames: draft.options.map((option, index) => ({ from: option.originalName, to: names[index] })).filter((rename) => rename.from && rename.from !== rename.to),
        featured: draft.featured,
        isNew: draft.isNew,
        bestSeller: draft.bestSeller,
        active: draft.active,
      } })
      if (!draft.id) createdId = Number(id)
      setEditing(null)
    })
    if (createdId) setPendingRestock(createdId)
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

  async function handleVariantImageChange(key: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || !editing) return
    setUploadingVariant(key)
    setError('')
    try {
      const url = await uploadFile(file)
      updateOption(key, { image: url })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos subir la imagen.')
    } finally {
      setUploadingVariant(null)
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

  // ─── Compras (reponer) ───
  function openPurchase(product?: Product) {
    setNotice('')
    setError('')
    setEditingPurchase(purchaseDraftFor(product))
  }

  function updatePurchaseLine(index: number, patch: Partial<PurchaseLine>) {
    setEditingPurchase((current) => current && { ...current, lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) })
  }

  async function handleSavePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingPurchase) return
    const lines = editingPurchase.lines
      .map((line) => ({ ...line, unitCost: line.unitCost !== '' ? line.unitCost : editingPurchase.sameCost }))
      .filter((line) => Number(line.quantity) > 0)
    if (!lines.length) { setError('Pon cuántas unidades compraste (al menos 1).'); return }
    if (lines.some((line) => line.unitCost === '' || Number(line.unitCost) < 0)) { setError('Pon el costo por unidad de cada compra.'); return }
    const draft = editingPurchase
    await withBusy(async () => {
      const result = await recordPurchase({ data: {
        productId: Number(draft.productId),
        notes: draft.notes,
        lines: lines.map((line) => ({ option: line.option, quantity: Math.round(Number(line.quantity)), unitCost: cents(line.unitCost) })),
      } })
      setEditingPurchase(null)
      setNotice(result.lots > 1 ? `Listo: se registraron ${result.lots} compras (una por opción) por ${money(result.total)}.` : `Listo: compra registrada por ${money(result.total)}.`)
    })
  }

  function confirmDeletePurchase(purchase: Purchase) {
    const sold = purchase.quantity - purchase.remainingQuantity
    const message = sold > 0
      ? `De este lote ya se vendieron ${sold}. No se puede borrar entero sin descuadrar las Finanzas, así que se quitarán solo las ${purchase.remainingQuantity} que quedan (del inventario y del Capital usado). ¿Continuar?`
      : `¿Eliminar esta compra? Se restan ${purchase.remainingQuantity} unidades del inventario y ${money(purchase.totalCost)} vuelven al Capital disponible.`
    if (!window.confirm(message)) return
    withBusy(async () => {
      const result = await deletePurchase({ data: purchase.id })
      if (result.adjustByHand) setNotice('Compra borrada. Como era una compra sin opción, revisa en «Editar» cuántas quedan de cada opción.')
    })
  }

  async function handleSplit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!splitDraft) return
    const draft = splitDraft
    await withBusy(async () => {
      await splitPurchase({ data: { id: draft.purchase.id, parts: Object.entries(draft.parts).map(([option, quantity]) => ({ option, quantity: Math.round(Number(quantity || 0)) })) } })
      setSplitDraft(null)
      setNotice('Listo: la compra quedó repartida. Ahora cada opción sale con su propio costo.')
    })
  }

  // ─── Pedidos ───
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

  // ─── Venta por fuera ───
  function openSale(product?: Product) {
    setNotice('')
    setError('')
    setSaleDraft({ customerName: '', phone: '', notes: '', paymentStatus: 'Pagado', lines: [emptySaleLine(product)] })
  }

  function updateSaleLine(index: number, patch: Partial<SaleLine>) {
    setSaleDraft((current) => current && { ...current, lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) })
  }

  async function handleSaveSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!saleDraft) return
    await withBusy(async () => {
      const result = await recordManualSale({ data: {
        customerName: saleDraft.customerName,
        phone: saleDraft.phone,
        notes: saleDraft.notes,
        paymentStatus: saleDraft.paymentStatus,
        items: saleDraft.lines.map((line) => ({ productId: Number(line.productId), option: line.option, quantity: Math.round(Number(line.quantity || 0)), price: cents(line.price) })),
      } })
      setSaleDraft(null)
      setNotice(`Venta ${result.orderNumber} registrada por ${money(result.total)}. Ya se descontó del inventario y cuenta en Finanzas.`)
    })
  }

  async function handleSaveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingExpense) return
    await withBusy(async () => {
      await recordExpense({ data: {
        type: editingExpense.type,
        description: editingExpense.description,
        amount: cents(editingExpense.amount),
      } })
      setEditingExpense(null)
    })
  }

  async function handleSaveFinanceSettings() {
    await withBusy(() => saveContent({ data: {
      capitalInicial: String(cents(financeSettings.capitalInicial)),
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

  const productById = new Map(data.products.map((product) => [product.id, product]))
  const lotsByProduct = new Map<number, Purchase[]>()
  for (const purchase of data.purchases) lotsByProduct.set(purchase.productId, [...(lotsByProduct.get(purchase.productId) ?? []), purchase])
  const statusById = new Map<number, LotStatus>()
  for (const [productId, lots] of lotsByProduct) for (const [id, status] of lotStatuses(lots, productById.get(productId))) statusById.set(id, status)

  const filteredProducts = data.products.filter((product) => `${product.name} ${product.options}`.toLowerCase().includes(query.toLowerCase()))
  const filteredOrders = data.orders.filter((order) => `${order.orderNumber} ${order.customerName} ${order.phone}`.toLowerCase().includes(query.toLowerCase()))
  const filteredPurchases = data.purchases.filter((purchase) => `${purchase.productName} ${purchase.option} ${purchase.notes}`.toLowerCase().includes(purchaseQuery.toLowerCase()))
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
  const uncostedIds = new Set(uncostedProducts.map((product) => product.id))
  const matchesCatalogFilter = (product: Product, filter: CatalogFilter) =>
    filter === 'todos' ? true
      : filter === 'agotados' ? product.stock === 0
      : filter === 'bajo' ? product.stock > 0 && product.stock <= 3
      : filter === 'sincosto' ? uncostedIds.has(product.id)
      : !product.active
  const catalogProducts = filteredProducts.filter((product) => matchesCatalogFilter(product, catalogFilter) && (!catalogCategory || product.category === catalogCategory))
  const trashTotal = data.trash.products.length + data.trash.orders.length + data.trash.customers.length + data.trash.images.length

  // Finanzas: todo se calcula a partir de pedidos pagados + compras +
  // gastos registrados. `cost` en cada línea de un pedido es lo que costó
  // esa unidad (sale del lote de compra del que se vendió).
  // Un pedido cancelado no cuenta aunque haya quedado marcado "Pagado"
  // (por ejemplo, si se le devolvió el dinero al cliente).
  const paidOrders = data.orders.filter((order) => order.paymentStatus === 'Pagado' && order.status !== 'Cancelado')
  const ingresos = paidOrders.reduce((sum, order) => sum + order.total, 0)
  const costoVentas = paidOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + item.cost * item.quantity, 0), 0)
  const gananciaBruta = ingresos - costoVentas
  const capitalUsado = data.purchases.reduce((sum, purchase) => sum + purchase.totalCost, 0)
  const capitalRecuperado = costoVentas
  const capitalInicial = Number(data.content.capitalInicial || 0)
  // Los gastos del NEGOCIO salen del capital del negocio (el dinero con
  // que se compra mercancía), no de la ganancia: así la ganancia que se
  // reparte entre reinversión y "Para ti" queda completa. Los gastos
  // PERSONALES sí salen solo de lo que te toca a ti.
  const gastosNegocio = data.expenses.filter((expense) => expense.type === 'negocio').reduce((sum, expense) => sum + expense.amount, 0)
  const capitalDisponible = capitalInicial - capitalUsado + capitalRecuperado - gastosNegocio
  const gastosPersonales = data.expenses.filter((expense) => expense.type === 'personal').reduce((sum, expense) => sum + expense.amount, 0)
  const reinvestPercent = Number(data.content.reinvestPercent ?? 70)
  const reinversion = Math.round((gananciaBruta * reinvestPercent) / 100)
  const paraTi = gananciaBruta - reinversion
  const disponibleRetirar = paraTi - gastosPersonales
  const inventoryValue = data.purchases.reduce((sum, purchase) => sum + purchase.remainingQuantity * purchase.unitCost, 0)

  const TABS: Array<{ id: Tab; label: string; icon: ComponentType<{ size?: number }> }> = [
    { id: 'resumen', label: 'Inicio', icon: LayoutDashboard },
    { id: 'catalogo', label: 'Productos', icon: Package },
    { id: 'pedidos', label: `Pedidos${pendingOrders ? ` (${pendingOrders})` : ''}`, icon: ListOrdered },
    { id: 'finanzas', label: 'Finanzas', icon: Wallet },
    { id: 'clientes', label: 'Clientes', icon: Users },
    { id: 'contenido', label: 'Textos', icon: Pencil },
    { id: 'papelera', label: `Papelera${trashTotal ? ` (${trashTotal})` : ''}`, icon: Trash2 },
  ]

  const goTab = (id: Tab) => { setTab(id); setQuery(''); setCatalogFilter('todos'); setCatalogCategory(''); setNotice('') }

  // ─── Datos para los formularios abiertos ───
  const purchaseProduct = editingPurchase ? productById.get(Number(editingPurchase.productId)) : undefined
  const purchaseTracking = purchaseProduct ? tracksOptionStock(purchaseProduct) : false
  const purchaseTotal = editingPurchase
    ? editingPurchase.lines.reduce((sum, line) => sum + Math.round(Number(line.quantity || 0)) * cents(line.unitCost !== '' ? line.unitCost : editingPurchase.sameCost), 0)
    : 0
  const lotsProduct = lotsProductId ? productById.get(lotsProductId) : undefined
  const lotsOfProduct = lotsProduct ? [...(lotsByProduct.get(lotsProduct.id) ?? [])].sort(byFifo) : []
  const editingSum = editing ? editing.options.reduce((sum, option) => sum + Math.max(0, Math.round(Number(option.stock || 0))), 0) : 0
  const editingOriginal = editing?.id ? productById.get(editing.id) : undefined
  const modalOpen = Boolean(editing || editingCustomer || editingOrder || editingPurchase || editingExpense || saleDraft || splitDraft || lotsProduct)

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <span className="drawer-kicker">JB TECH STORE</span>
        <h1>Panel admin</h1>
        <nav>
          {TABS.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => goTab(id)}><Icon size={17} />{label}</button>)}
        </nav>
        <div className="admin-sidebar-footer">
          <Link to="/"><ChevronLeft size={15} />Ver la tienda</Link>
          <button onClick={handleLogout}><LogOut size={15} />Cerrar sesión</button>
        </div>
      </aside>

      <main className="admin-main">
        {error && !modalOpen && <p className="form-error admin-error">{error}</p>}
        {notice && <p className="admin-notice"><Check size={15} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Cerrar"><X size={14} /></button></p>}

        {tab === 'resumen' && (
          <section>
            <h2>Inicio</h2>
            <AppAndNotifications />
            <div className="quick-actions">
              <button type="button" onClick={() => openSale()}><ShoppingCart size={20} /><span>Registrar venta</span></button>
              <button type="button" onClick={() => openPurchase()}><ShoppingBag size={20} /><span>Registrar compra</span></button>
              <button type="button" onClick={() => { goTab('catalogo'); setEditing(emptyDraft()) }}><Plus size={20} /><span>Nuevo producto</span></button>
            </div>
            <div className="admin-cards">
              <div className="admin-card"><span>Pedidos pendientes</span><strong>{pendingOrders}</strong></div>
              <div className="admin-card"><span>Por cobrar ({porCobrarOrders.length})</span><strong>{money(porCobrar)}</strong></div>
              <div className="admin-card"><span>Productos agotados</span><strong>{outOfStock}</strong></div>
              <div className="admin-card"><span>Quedan pocos (≤3)</span><strong>{lowStock.length}</strong></div>
            </div>
            {lowStock.length > 0 && <>
              <h3>Quedan pocas unidades</h3>
              <div className="admin-table">
                {lowStock.slice(0, 8).map((product) => <div className="admin-row admin-row-product" key={product.id}>
                  <img src={product.image || '/logo.png'} alt="" />
                  <div><strong>{product.name}</strong><span>Quedan {product.stock}</span></div>
                  <button className="ghost-button" onClick={() => openPurchase(product)}>Reponer</button>
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
            <h2>Finanzas</h2>
            <div className="quick-actions">
              <button type="button" onClick={() => openSale()}><ShoppingCart size={20} /><span>Registrar venta</span></button>
              <button type="button" onClick={() => openPurchase()}><ShoppingBag size={20} /><span>Registrar compra</span></button>
              <button type="button" onClick={() => setEditingExpense(emptyExpenseDraft())}><Plus size={20} /><span>Registrar gasto</span></button>
            </div>

            <div className="money-hero">
              <div className="money-card"><span>Dinero del negocio</span><strong>{money(capitalDisponible)}</strong><small>Lo que hay para comprar mercancía</small></div>
              <div className="money-card"><span>Ganancia</span><strong>{money(gananciaBruta)}</strong><small>De las ventas ya pagadas</small></div>
              <div className="money-card money-card-accent"><span>Puedes retirar</span><strong>{money(disponibleRetirar)}</strong><small>Tu {100 - reinvestPercent}% de la ganancia, menos tus gastos personales</small></div>
              <div className="money-card"><span>Mercancía en existencia</span><strong>{money(inventoryValue)}</strong><small>Lo que costó lo que todavía no se ha vendido</small></div>
            </div>
            {porCobrar > 0 && <p className="admin-hint"><AlertTriangle size={14} />Te deben {money(porCobrar)} de {porCobrarOrders.length} {porCobrarOrders.length === 1 ? 'pedido' : 'pedidos'} sin pagar. Cuando los marques «Pagado» se suman aquí.</p>}
            {uncostedProducts.length > 0 && (
              <p className="form-error">
                {uncostedProducts.length === 1 ? '1 producto tiene' : `${uncostedProducts.length} productos tienen`} unidades sin una compra registrada, así que su costo cuenta como RD$0 y la ganancia sale más alta de lo real: {uncostedProducts.slice(0, 5).map((product) => product.name).join(', ')}{uncostedProducts.length > 5 ? '…' : ''}. Para corregirlo, pon esas existencias en 0 en «Editar» y regístralas con «Reponer». <button type="button" className="link-button" onClick={() => { goTab('catalogo'); setCatalogFilter('sincosto') }}>Ver cuáles son</button>
              </p>
            )}

            <Collapsible title="Ver todas las cuentas (cómo se calcula)">
              <div className="admin-cards">
                <div className="admin-card"><span>Capital inicial</span><strong>{money(capitalInicial)}</strong></div>
                <div className="admin-card"><span>Gastado en compras</span><strong>{money(capitalUsado)}</strong></div>
                <div className="admin-card"><span>Recuperado con ventas</span><strong>{money(capitalRecuperado)}</strong></div>
                <div className="admin-card"><span>Gastos del negocio</span><strong>{money(gastosNegocio)}</strong></div>
                <div className="admin-card"><span>Vendido (pagado)</span><strong>{money(ingresos)}</strong></div>
                <div className="admin-card"><span>Costo de lo vendido</span><strong>{money(costoVentas)}</strong></div>
                <div className="admin-card"><span>Reinversión ({reinvestPercent}%)</span><strong>{money(reinversion)}</strong></div>
                <div className="admin-card"><span>Para ti ({100 - reinvestPercent}%)</span><strong>{money(paraTi)}</strong></div>
                <div className="admin-card"><span>Gastos personales</span><strong>{money(gastosPersonales)}</strong></div>
              </div>
              <p className="admin-hint">Dinero del negocio = capital inicial − compras + lo recuperado al vender − gastos del negocio. Solo cuentan los pedidos «Pagado» que no estén cancelados.</p>
            </Collapsible>

            <div className="seg-tabs">
              <button type="button" className={financeView === 'compras' ? 'active' : ''} onClick={() => setFinanceView('compras')}>Compras ({data.purchases.length})</button>
              <button type="button" className={financeView === 'gastos' ? 'active' : ''} onClick={() => setFinanceView('gastos')}>Gastos ({data.expenses.length})</button>
            </div>

            {financeView === 'compras' && <>
              <p className="admin-hint"><Layers size={14} />Cada compra es un lote con su costo. Al vender, sale primero del lote más viejo («Se vende ahora»); cuando se acaba, sigue el próximo.</p>
              <label className="search-field admin-search"><Search size={16} /><input value={purchaseQuery} onChange={(event) => { setPurchaseQuery(event.target.value); setPurchaseLimit(15) }} placeholder="Buscar compra por producto, opción o nota..." /></label>
              <div className="admin-table">
                {filteredPurchases.slice(0, purchaseLimit).map((purchase) => (
                  <LotRow key={purchase.id} lot={purchase} status={statusById.get(purchase.id) ?? 'espera'} showProduct general={!purchase.option && Boolean(productById.get(purchase.productId)?.optionStock)} busy={busy} onDelete={() => confirmDeletePurchase(purchase)} />
                ))}
                {!filteredPurchases.length && <p className="admin-empty">{data.purchases.length ? 'Ninguna compra coincide.' : 'Todavía no has registrado compras.'}</p>}
                {filteredPurchases.length > purchaseLimit && <button className="ghost-button" onClick={() => setPurchaseLimit((limit) => limit + 30)}>Ver más compras ({filteredPurchases.length - purchaseLimit} más)</button>}
              </div>
            </>}

            {financeView === 'gastos' && (
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
            )}

            <Collapsible title="Configuración (capital inicial y % que se reinvierte)">
              <div className="form-row">
                <label className="content-field"><span>Capital inicial (RD$)</span><input type="number" min={0} step="0.01" value={financeSettings.capitalInicial} onChange={(event) => setFinanceSettings((current) => ({ ...current, capitalInicial: event.target.value }))} /></label>
                <label className="content-field"><span>% que se reinvierte</span><input type="number" min={0} max={100} value={financeSettings.reinvestPercent} onChange={(event) => setFinanceSettings((current) => ({ ...current, reinvestPercent: event.target.value }))} /></label>
              </div>
              <button className="primary-button" disabled={busy} onClick={handleSaveFinanceSettings}><Check size={16} />{busy ? 'Guardando…' : 'Guardar configuración'}</button>
            </Collapsible>
          </section>
        )}

        {tab === 'catalogo' && (
          <section>
            <div className="admin-section-head">
              <h2>Productos</h2>
              <button className="primary-button" onClick={() => { setError(''); setEditing(emptyDraft()) }}><Plus size={16} />Nuevo producto</button>
            </div>
            <label className="search-field admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto u opción..." /></label>
            <div className="cat-filters">
              {CATALOG_FILTERS.map((filter) => {
                const count = data.products.filter((product) => matchesCatalogFilter(product, filter.id)).length
                if (filter.id !== 'todos' && count === 0) return null
                return <button type="button" key={filter.id} className={`${catalogFilter === filter.id ? 'active' : ''} ${filter.id === 'sincosto' ? 'warn' : ''}`} onClick={() => setCatalogFilter(filter.id)}>{filter.label} <b>{count}</b></button>
              })}
              <select value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)} aria-label="Categoría">
                <option value="">Todas las categorías</option>
                {CATEGORIES.filter((category) => data.products.some((product) => product.category === category)).map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div className="admin-table">
              {catalogProducts.map((product) => {
                const options = parseOptions(product.options)
                const tracking = tracksOptionStock(product)
                const range = priceRange(product)
                const ranged = range.min !== range.max
                const margin = !ranged && product.price > 0 && product.cost > 0 ? Math.round(((product.price - product.cost) / product.price) * 100) : null
                const noCost = uncostedIds.has(product.id)
                const lotCount = lotsByProduct.get(product.id)?.length ?? 0
                return <div className={`prod-row ${!product.active ? 'is-hidden' : ''}`} key={product.id}>
                  <img src={product.image || '/logo.png'} alt="" loading="lazy" />
                  <div className="prod-row-main">
                    <div className="prod-row-top">
                      <strong>{product.name}</strong>
                      <div className="prod-row-price">
                        {ranged ? <><small>desde</small><b>{money(range.min)}</b></> : <>{product.originalPrice > product.price && <s>{money(product.originalPrice)}</s>}<b>{money(product.price)}</b></>}
                      </div>
                    </div>
                    <span className="prod-row-cat">{product.category}{options.length > 0 ? ` · ${options.length} ${options.length === 1 ? 'opción' : 'opciones'}` : ''}</span>
                    <div className="prod-row-pills">
                      <span className={`pill ${product.stock === 0 ? 'pill-bad' : product.stock <= 3 ? 'pill-warn' : 'pill-ok'}`}>{product.stock === 0 ? 'Agotado' : `${product.stock} en existencia`}</span>
                      {noCost ? <span className="pill pill-bad">Sin costo registrado</span> : !tracking && <span className="pill">Costo {money(product.cost)}</span>}
                      {margin !== null && <span className={`pill ${margin < 15 ? 'pill-warn' : ''}`}>Margen {margin}%</span>}
                      {tracking && <span className="pill pill-info">Cantidad por opción</span>}
                      {!product.active && <span className="pill">Oculto</span>}
                    </div>
                    {tracking && (
                      <p className="prod-row-options">
                        {options.map((option) => {
                          const units = optionStock(product, option)
                          return <span key={option} className={units === 0 ? 'is-out' : ''}>{option}: <b>{units}</b>{hasOwnPrice(product, option) ? ` · ${money(optionPrice(product, option))}` : ''}</span>
                        })}
                      </p>
                    )}
                  </div>
                  <div className="prod-row-actions">
                    <button type="button" onClick={() => { setError(''); setEditing(toDraft(product)) }}><Pencil size={14} />Editar</button>
                    <button type="button" onClick={() => openPurchase(product)}><ShoppingBag size={14} />Reponer</button>
                    <button type="button" disabled={product.stock <= 0} onClick={() => openSale(product)}><ShoppingCart size={14} />Vender</button>
                    <button type="button" disabled={!lotCount} onClick={() => setLotsProductId(product.id)}><Layers size={14} />Compras</button>
                    <button type="button" className="danger" aria-label="Enviar a la papelera" onClick={() => { if (window.confirm(`¿Enviar «${product.name}» a la papelera? Deja de verse en la tienda; lo puedes restaurar durante 30 días.`)) withBusy(() => deleteProduct({ data: product.id })) }}><Trash2 size={14} /></button>
                  </div>
                </div>
              })}
              {!catalogProducts.length && <p className="admin-empty">No hay productos que coincidan.</p>}
            </div>
          </section>
        )}

        {tab === 'pedidos' && (
          <section>
            <div className="admin-section-head">
              <h2>Pedidos</h2>
              <button className="primary-button" onClick={() => openSale()}><ShoppingCart size={16} />Registrar venta por fuera</button>
            </div>
            <p className="admin-hint">¿Vendiste algo en persona o por WhatsApp? Regístralo con «Registrar venta por fuera»: se descuenta del inventario y se suma a Finanzas.</p>
            <label className="search-field admin-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número, cliente o teléfono..." /></label>
            <div className="admin-table">
              {filteredOrders.map((order) => <div className="admin-order" key={order.id}>
                <div className="admin-order-head">
                  <div><strong>{order.orderNumber}</strong><span>{dateFmt(order.createdAt)}</span></div>
                  <div className="admin-order-actions">
                    <button className="icon-button" title="Editar pedido" onClick={() => { setError(''); setEditingOrder({ id: order.id, customerName: order.customerName, email: order.email, phone: order.phone, address: order.address, notes: order.notes, items: order.items.map((item) => ({ ...item, option: item.option ?? optionFromName(item.name) })), discount: order.discount }) }}><Pencil size={15} /></button>
                    <button className="icon-button" title="Descargar factura (PDF)" disabled={busy} onClick={() => handleDownloadInvoice(order)}><Download size={15} /></button>
                    <button className="icon-button" title="Compartir factura" disabled={busy} onClick={() => handleShareInvoice(order)}><Share2 size={15} /></button>
                    <button className="icon-button" title="Enviar a la papelera" onClick={() => { if (window.confirm(order.status === 'Cancelado' ? '¿Enviar este pedido a la papelera?' : '¿Enviar este pedido a la papelera?\n\nOjo: esto NO devuelve las unidades al inventario. Si el pedido no se concretó, primero cámbialo a "Cancelado" (eso sí las devuelve).')) withBusy(() => deleteOrder({ data: order.id })) }}><Trash2 size={15} /></button>
                  </div>
                </div>
                <p className="admin-order-customer">{order.customerName} · {order.phone}{order.address ? ` · ${order.address}` : ''}</p>
                <ul className="admin-order-items">{order.items.map((item, index) => <li key={`${item.id}-${index}`}>
                  <div>{item.quantity}× {item.name}<small>Costó {money(item.cost)} c/u · ganancia {money((item.price - item.cost) * item.quantity)}</small></div>
                  <span>{money(item.price * item.quantity)}</span>
                </li>)}</ul>
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
              <h2>Textos de la tienda</h2>
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
          <fieldset className="form-section">
            <legend>1 · Foto y nombre</legend>
            <div className="image-upload">
              {editing.image && <img src={editing.image} alt="" />}
              <label className="upload-button">{uploading ? 'Subiendo…' : <><Upload size={15} />{editing.image ? 'Cambiar foto principal' : 'Subir foto principal'}</>}<input type="file" accept="image/*" hidden onChange={handleImageChange} disabled={uploading} /></label>
            </div>
            <label>Nombre<input required value={editing.name} onChange={(event) => setEditing((current) => current && { ...current, name: event.target.value })} placeholder="Ej. Cover para iPhone 12" /></label>
            <label>Categoría
              <select value={editing.category} onChange={(event) => setEditing((current) => current && { ...current, category: event.target.value })}>
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>Descripción<textarea rows={3} value={editing.description} onChange={(event) => setEditing((current) => current && { ...current, description: event.target.value })} /></label>
          </fieldset>

          <fieldset className="form-section">
            <legend>2 · Precio</legend>
            <div className="form-row">
              <label>Precio de venta (RD$)<input required type="number" inputMode="decimal" min={0} step="0.01" value={editing.price} onChange={(event) => setEditing((current) => current && { ...current, price: event.target.value })} /></label>
              <label>Precio anterior (opcional)<input type="number" inputMode="decimal" min={0} step="0.01" value={editing.originalPrice} onChange={(event) => setEditing((current) => current && { ...current, originalPrice: event.target.value })} placeholder="Para mostrar oferta" /></label>
            </div>
            <p className="content-hint">Si las opciones de abajo tienen un precio distinto, se lo pones a cada una. Las que no tengan precio propio usan este.</p>
          </fieldset>

          <fieldset className="form-section">
            <legend>3 · Opciones (colores, diseños o modelos)</legend>
            <p className="content-hint">Déjalo vacío si el producto es uno solo. Si en esta misma tarjeta hay varios (ej. 10 diseños de cover), agrégalos aquí — cada uno puede tener su foto, su precio y su cantidad.</p>
            {editing.options.length > 0 && (
              <label className="switch-row">
                <input type="checkbox" checked={editing.optionStock} onChange={(event) => setEditing((current) => current && { ...current, optionStock: event.target.checked })} />
                <span><b>Cada opción tiene su propia cantidad</b><small>Recomendado. Así sabes cuántas quedan de cada una, y cada compra y venta se cuenta por opción con su propio costo.</small></span>
              </label>
            )}
            {editing.options.map((option, index) => (
              <div className="option-card" key={option.key}>
                <div className="option-card-head">
                  <label className="option-thumb" title="Foto de esta opción">
                    {uploadingVariant === option.key ? <span>…</span> : option.image ? <img src={option.image} alt="" /> : <Upload size={16} />}
                    <input type="file" accept="image/*" hidden onChange={(event) => handleVariantImageChange(option.key, event)} disabled={uploadingVariant === option.key} />
                  </label>
                  <input className="option-name" value={option.name} onChange={(event) => updateOption(option.key, { name: event.target.value })} placeholder={`Opción ${index + 1} (ej. negro/amarillo)`} aria-label="Nombre de la opción" />
                  <button type="button" className="icon-button option-remove" aria-label="Quitar opción" onClick={() => { if (!option.originalName || window.confirm(`¿Quitar la opción «${option.originalName}»?`)) removeOption(option.key) }}><X size={16} /></button>
                </div>
                <div className="option-card-grid">
                  <label>Precio<input type="number" inputMode="decimal" min={0} step="0.01" value={option.price} onChange={(event) => updateOption(option.key, { price: event.target.value })} placeholder={editing.price ? `Igual: ${money(cents(editing.price))}` : 'Igual al general'} /></label>
                  {editing.optionStock && (
                    <label>Cantidad<input type="number" inputMode="numeric" min={0} value={editing.id ? option.stock : '0'} disabled={!editing.id} onChange={(event) => updateOption(option.key, { stock: event.target.value })} /></label>
                  )}
                </div>
                <input value={option.description} onChange={(event) => updateOption(option.key, { description: event.target.value })} placeholder="Descripción de esta opción (opcional)" aria-label="Descripción de la opción" />
                {option.image && <button type="button" className="variant-remove-button" onClick={() => updateOption(option.key, { image: '' })}>Quitar foto</button>}
              </div>
            ))}
            <button type="button" className="ghost-button add-option" onClick={() => setEditing((current) => current && { ...current, options: [...current.options, emptyOption()] })}><Plus size={15} />Agregar opción</button>
          </fieldset>

          <fieldset className="form-section">
            <legend>4 · Cantidad en existencia</legend>
            {!editing.id ? (
              <p className="admin-hint"><AlertTriangle size={14} />Un producto nuevo empieza en 0. Al guardar se abre «Reponer» para que pongas cuántas compraste y a cuánto — así el costo queda registrado.</p>
            ) : editing.optionStock && editing.options.length > 0 ? (
              <p className="option-total">Total: <b>{editingSum}</b> unidades (la suma de las opciones){editingOriginal && !editingOriginal.optionStock && editingOriginal.stock !== editingSum ? <span> · antes había {editingOriginal.stock} en total: reparte esa cantidad entre las opciones</span> : null}</p>
            ) : (
              <>
                <label>Existencias<input required type="number" inputMode="numeric" min={0} value={editing.stock} onChange={(event) => setEditing((current) => current && { ...current, stock: event.target.value })} /></label>
              </>
            )}
            {editing.id && <p className="content-hint">Estos números solo corrigen el conteo (no suman dinero ni costo). Para mercancía nueva usa «Reponer».</p>}
          </fieldset>

          <fieldset className="form-section">
            <legend>5 · En la tienda</legend>
            <div className="form-checks">
              <label><input type="checkbox" checked={editing.active} onChange={(event) => setEditing((current) => current && { ...current, active: event.target.checked })} />Visible en la tienda</label>
              <label><input type="checkbox" checked={editing.featured} onChange={(event) => setEditing((current) => current && { ...current, featured: event.target.checked })} />Destacado</label>
              <label><input type="checkbox" checked={editing.isNew} onChange={(event) => setEditing((current) => current && { ...current, isNew: event.target.checked })} />Nuevo</label>
              <label><input type="checkbox" checked={editing.bestSeller} onChange={(event) => setEditing((current) => current && { ...current, bestSeller: event.target.checked })} />Más vendido</label>
            </div>
          </fieldset>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy || uploading || Boolean(uploadingVariant)}>{busy ? 'Guardando…' : 'Guardar producto'}</button>
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
          <label>Productos del pedido <small className="order-edit-legend">nombre · cantidad · precio c/u</small></label>
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
        <h2>Reponer (registrar compra)</h2>
        <p>Pon cuántas compraste y a cuánto te salió cada una. Se suma a la existencia y se saca del dinero del negocio. Cada compra queda como un lote con su propio costo.</p>
        <form className="product-form" onSubmit={handleSavePurchase}>
          <label>Producto
            <select required value={editingPurchase.productId} onChange={(event) => setEditingPurchase((current) => current && { ...purchaseDraftFor(productById.get(Number(event.target.value))), notes: current.notes })}>
              <option value="" disabled>Selecciona un producto</option>
              {[...data.products].sort((a, b) => a.name.localeCompare(b.name)).map((product) => <option key={product.id} value={product.id}>{product.name} (hay {product.stock})</option>)}
            </select>
          </label>
          {purchaseProduct && purchaseTracking ? (
            <>
              <label>Costo igual para todas (opcional)<input type="number" inputMode="decimal" min={0} step="0.01" value={editingPurchase.sameCost} onChange={(event) => setEditingPurchase((current) => current && { ...current, sameCost: event.target.value })} placeholder="Ej. 26 (se usa donde no pongas costo)" /></label>
              <div className="restock-table">
                <div className="restock-head"><span>Opción</span><span>Cant.</span><span>Costo c/u</span></div>
                {editingPurchase.lines.map((line, index) => {
                  const variant = purchaseProduct.variantImages?.find((entry) => entry.option === line.option)
                  return <div className="restock-row" key={line.option}>
                    <div className="restock-option">{variant?.image ? <img src={variant.image} alt="" /> : null}<span>{line.option}<small>hay {optionStock(purchaseProduct, line.option)}</small></span></div>
                    <input type="number" inputMode="numeric" min={0} value={line.quantity} onChange={(event) => updatePurchaseLine(index, { quantity: event.target.value })} placeholder="0" aria-label={`Cantidad de ${line.option}`} />
                    <input type="number" inputMode="decimal" min={0} step="0.01" value={line.unitCost} onChange={(event) => updatePurchaseLine(index, { unitCost: event.target.value })} placeholder={editingPurchase.sameCost || 'RD$'} aria-label={`Costo de ${line.option}`} />
                  </div>
                })}
              </div>
              <p className="content-hint">Deja en blanco las opciones que no compraste. Cada opción con cantidad queda como su propio lote.</p>
            </>
          ) : (
            <>
              <div className="form-row">
                <label>Cantidad comprada<input required type="number" inputMode="numeric" min={1} value={editingPurchase.lines[0]?.quantity ?? ''} onChange={(event) => updatePurchaseLine(0, { quantity: event.target.value })} /></label>
                <label>Costo por unidad (RD$)<input required type="number" inputMode="decimal" min={0} step="0.01" value={editingPurchase.lines[0]?.unitCost ?? ''} onChange={(event) => updatePurchaseLine(0, { unitCost: event.target.value })} /></label>
              </div>
              {purchaseProduct && parseOptions(purchaseProduct.options).length > 1 && <p className="admin-hint"><AlertTriangle size={14} />Este producto tiene opciones pero comparten una sola cantidad. Si cada una tiene su propia cantidad o costo, actívalo en «Editar» → «Cada opción tiene su propia cantidad».</p>}
            </>
          )}
          <label>Notas (opcional)<input value={editingPurchase.notes} onChange={(event) => setEditingPurchase((current) => current && { ...current, notes: event.target.value })} placeholder="Ej. proveedor, factura..." /></label>
          {purchaseTotal > 0 && <p className="order-edit-total">Total de la compra: <strong>{money(purchaseTotal)}</strong> · Dinero del negocio después: <strong>{money(capitalDisponible - purchaseTotal)}</strong></p>}
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy || !editingPurchase.productId}>{busy ? 'Guardando…' : 'Registrar compra'}</button>
        </form>
      </div></div>}

      {lotsProduct && <div className="modal-wrap"><div className="modal-card">
        <button className="modal-close icon-button" onClick={() => setLotsProductId(null)}><X /></button>
        <h2>Compras de {lotsProduct.name}</h2>
        <p>Así sabes de cuál compra sale cada venta: siempre sale primero de la compra más vieja que todavía tenga unidades (la que dice «Se vende ahora»). Cuando esa se acaba, sigue la próxima.</p>
        {(() => {
          const statuses = lotStatuses(lotsOfProduct, lotsProduct)
          const tracking = tracksOptionStock(lotsProduct)
          const general = lotsOfProduct.filter((lot) => !lot.option)
          if (!tracking) {
            const next = nextLotFor(lotsOfProduct, lotsProduct, '')
            return <>
              {next && <p className="next-lot">La próxima venta sale a costo <b>{money(next.unitCost)}</b> (compra del {shortDate(next.createdAt)}).</p>}
              <div className="admin-table">{lotsOfProduct.map((lot) => <LotRow key={lot.id} lot={lot} status={statuses.get(lot.id) ?? 'espera'} busy={busy} onDelete={() => confirmDeletePurchase(lot)} />)}</div>
            </>
          }
          return <>
            {general.some((lot) => lot.remainingQuantity > 0) && (
              <div className="lots-group lots-group-warn">
                <h3>Compras sin opción asignada</h3>
                <p className="content-hint">Son de antes de separar por opción: cualquier opción puede salir de aquí con este costo. Tócale «Repartir» y di cuántas son de cada opción, así cada una sale con su costo real.</p>
                <div className="admin-table">{general.filter((lot) => lot.remainingQuantity > 0).map((lot) => <LotRow key={lot.id} lot={lot} status={statuses.get(lot.id) ?? 'espera'} general busy={busy} onDelete={() => confirmDeletePurchase(lot)} onSplit={() => { setError(''); setSplitDraft({ purchase: lot, parts: {} }) }} />)}</div>
              </div>
            )}
            {parseOptions(lotsProduct.options).map((option) => {
              const lots = lotsOfProduct.filter((lot) => lot.option === option)
              const next = nextLotFor(lotsOfProduct, lotsProduct, option)
              return <div className="lots-group" key={option}>
                <h3>{option} <small>hay {optionStock(lotsProduct, option)} · precio {money(optionPrice(lotsProduct, option))}</small></h3>
                {next ? <p className="next-lot">Próxima venta sale a costo <b>{money(next.unitCost)}</b>{next.option ? '' : ' (de una compra sin opción)'}.</p> : <p className="content-hint">Sin compras con unidades.</p>}
                {lots.length > 0 && <div className="admin-table">{lots.map((lot) => <LotRow key={lot.id} lot={lot} status={statuses.get(lot.id) ?? 'espera'} busy={busy} onDelete={() => confirmDeletePurchase(lot)} />)}</div>}
              </div>
            })}
          </>
        })()}
        {error && !splitDraft && <p className="form-error">{error}</p>}
        <button className="primary-button full lots-restock" onClick={() => { const product = lotsProduct; setLotsProductId(null); openPurchase(product) }}><ShoppingBag size={16} />Reponer este producto</button>
      </div></div>}

      {splitDraft && (() => {
        const product = productById.get(splitDraft.purchase.productId)
        const options = product ? parseOptions(product.options) : []
        const assigned = Object.values(splitDraft.parts).reduce((sum, value) => sum + Math.max(0, Math.round(Number(value || 0))), 0)
        const target = splitDraft.purchase.remainingQuantity
        return <div className="modal-wrap modal-top"><div className="modal-card">
          <button className="modal-close icon-button" onClick={() => setSplitDraft(null)}><X /></button>
          <h2>Repartir compra</h2>
          <p>Compra del {shortDate(splitDraft.purchase.createdAt)}: quedan <b>{target}</b> a <b>{money(splitDraft.purchase.unitCost)}</b> c/u. Pon cuántas de esas son de cada opción. No cambia la cantidad ni el dinero: solo dice de cuál opción es cada una.</p>
          <form className="product-form" onSubmit={handleSplit}>
            <div className="restock-table">
              {options.map((option) => (
                <div className="restock-row restock-row-2" key={option}>
                  <div className="restock-option"><span>{option}<small>hay {product ? optionStock(product, option) : 0}</small></span></div>
                  <input type="number" inputMode="numeric" min={0} value={splitDraft.parts[option] ?? ''} placeholder="0" onChange={(event) => setSplitDraft((current) => current && { ...current, parts: { ...current.parts, [option]: event.target.value } })} aria-label={`Cantidad de ${option}`} />
                </div>
              ))}
            </div>
            <p className={`order-edit-total ${assigned === target ? 'is-ok' : ''}`}>Repartidas <strong>{assigned}</strong> de {target}</p>
            {error && <p className="form-error">{error}</p>}
            <button className="primary-button full" disabled={busy || assigned !== target}>{busy ? 'Guardando…' : 'Guardar reparto'}</button>
          </form>
        </div></div>
      })()}

      {saleDraft && <div className="modal-wrap"><div className="modal-card">
        <button className="modal-close icon-button" onClick={() => setSaleDraft(null)}><X /></button>
        <h2>Registrar venta por fuera</h2>
        <p>Para lo que vendiste en persona o por WhatsApp. Se descuenta del inventario y cuenta en Finanzas igual que un pedido de la tienda. El precio lo pones tú (puede ser un precio especial).</p>
        <form className="product-form" onSubmit={handleSaveSale}>
          {saleDraft.lines.map((line, index) => {
            const product = data.products.find((item) => String(item.id) === line.productId)
            const options = product ? parseOptions(product.options) : []
            const tracking = product ? tracksOptionStock(product) : false
            const available = product ? optionStock(product, line.option) : 0
            const lineTotal = Math.round(Number(line.quantity || 0)) * cents(line.price)
            const listPrice = product ? optionPrice(product, line.option) : 0
            return <div className="sale-line" key={index}>
              <div className="sale-line-head">
                <strong>Producto {saleDraft.lines.length > 1 ? index + 1 : ''}</strong>
                {saleDraft.lines.length > 1 && <button type="button" className="variant-remove-button" onClick={() => setSaleDraft((current) => current && { ...current, lines: current.lines.filter((_, i) => i !== index) })}>Quitar</button>}
              </div>
              <select required value={line.productId} onChange={(event) => {
                const next = data.products.find((item) => String(item.id) === event.target.value)
                const option = next ? firstSellableOption(next) : ''
                updateSaleLine(index, { productId: event.target.value, option, price: next ? String(optionPrice(next, option) / 100) : line.price })
              }}>
                <option value="" disabled>Selecciona un producto</option>
                {[...data.products].sort((a, b) => a.name.localeCompare(b.name)).map((item) => <option key={item.id} value={item.id} disabled={item.stock <= 0}>{item.name} (hay {item.stock})</option>)}
              </select>
              {options.length > 0 && product && (
                <select value={line.option} onChange={(event) => updateSaleLine(index, { option: event.target.value, price: String(optionPrice(product, event.target.value) / 100) })}>
                  {options.map((option) => {
                    const units = optionStock(product, option)
                    return <option key={option} value={option} disabled={tracking && units <= 0}>{option}{tracking ? ` (hay ${units})` : ''}{hasOwnPrice(product, option) ? ` · ${money(optionPrice(product, option))}` : ''}</option>
                  })}
                </select>
              )}
              <div className="form-row">
                <label>Cantidad<input required type="number" inputMode="numeric" min={1} max={available || undefined} value={line.quantity} onChange={(event) => updateSaleLine(index, { quantity: event.target.value })} /></label>
                <label>Precio por unidad (RD$)<input required type="number" inputMode="decimal" min={0} step="0.01" value={line.price} onChange={(event) => updateSaleLine(index, { price: event.target.value })} /></label>
              </div>
              {product && lineTotal > 0 && <p className="sale-line-total">{line.quantity} × {money(cents(line.price))} = <strong>{money(lineTotal)}</strong>{listPrice > 0 && cents(line.price) < listPrice && <span> · precio de tienda {money(listPrice)}</span>}</p>}
            </div>
          })}
          <button type="button" className="ghost-button sale-add-line" onClick={() => setSaleDraft((current) => current && { ...current, lines: [...current.lines, emptySaleLine()] })}><Plus size={14} />Agregar otro producto</button>
          <div className="form-row">
            <label>Cliente (opcional)<input value={saleDraft.customerName} onChange={(event) => setSaleDraft((current) => current && { ...current, customerName: event.target.value })} placeholder="Ej. Juan Pérez" /></label>
            <label>Teléfono (opcional)<input type="tel" value={saleDraft.phone} onChange={(event) => setSaleDraft((current) => current && { ...current, phone: event.target.value })} /></label>
          </div>
          <div className="form-row">
            <label>¿Ya te pagaron?
              <select value={saleDraft.paymentStatus} onChange={(event) => setSaleDraft((current) => current && { ...current, paymentStatus: event.target.value })}>
                <option value="Pagado">Sí, pagado</option>
                <option value="Pendiente">No, queda pendiente</option>
              </select>
            </label>
            <label>Nota (opcional)<input value={saleDraft.notes} onChange={(event) => setSaleDraft((current) => current && { ...current, notes: event.target.value })} placeholder="Ej. venta al por mayor" /></label>
          </div>
          <p className="order-edit-total">Total de la venta: <strong>{money(saleDraft.lines.reduce((sum, line) => sum + Math.round(Number(line.quantity || 0)) * cents(line.price), 0))}</strong></p>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-button full" disabled={busy}>{busy ? 'Registrando…' : 'Registrar venta'}</button>
        </form>
      </div></div>}

      {editingExpense && <div className="modal-wrap"><div className="modal-card">
        <button className="modal-close icon-button" onClick={() => setEditingExpense(null)}><X /></button>
        <h2>Registrar gasto</h2>
        <form className="product-form" onSubmit={handleSaveExpense}>
          <label>Tipo
            <select value={editingExpense.type} onChange={(event) => setEditingExpense((current) => current && { ...current, type: event.target.value as 'negocio' | 'personal' })}>
              <option value="negocio">Gasto del negocio (sale del dinero del negocio)</option>
              <option value="personal">Gasto o retiro personal (sale de lo tuyo)</option>
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
