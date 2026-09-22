import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight, BatteryCharging, Check, ChevronDown, ChevronRight, Eye, Facebook, Flame, Gamepad2,
  Headphones, Home, Instagram, Laptop, LayoutGrid, Menu, Minus, Package, Phone, Plus,
  Search, Send, ShieldCheck, ShoppingCart, SlidersHorizontal, Smartphone, Sparkles, Store, Trash2, Watch, X,
} from 'lucide-react'
import { createOrder, type CartLine } from '@/lib/store'
import { ShareButton } from './ShareButton'

type Product = {
  id: number
  name: string
  category: string
  description: string
  options: string
  price: number
  originalPrice: number
  stock: number
  image: string
  featured: boolean
  isNew: boolean
  bestSeller: boolean
}
type Props = { data: { products: Product[]; content: Record<string, string> } }

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(value / 100)

const CATEGORY_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  'Teléfonos': Smartphone,
  'Laptops': Laptop,
  'Accesorios': Package,
  'Cargadores y Cables': BatteryCharging,
  'Covers y Protectores': ShieldCheck,
  'Audífonos y Bocinas': Headphones,
  'Relojes Inteligentes': Watch,
  'Gaming': Gamepad2,
}
function categoryIcon(name: string) {
  return CATEGORY_ICONS[name] || LayoutGrid
}

/** Glifo oficial de WhatsApp (mismo trazo que usa ShareButton), para que
 * el botón de WhatsApp de la tienda se reconozca al instante. */
const WhatsAppIcon = ({ size = 18 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.85.5 3.58 1.4 5.07L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.06a8.1 8.1 0 0 1-4.14-1.13l-.3-.18-3.12.82.83-3.04-.2-.31a8.1 8.1 0 0 1-1.25-4.31c0-4.5 3.66-8.16 8.18-8.16 4.5 0 8.16 3.66 8.16 8.16 0 4.51-3.66 8.15-8.16 8.15Zm4.48-6.13c-.24-.12-1.45-.72-1.68-.8-.22-.08-.39-.12-.56.12-.16.24-.63.8-.78.96-.14.16-.29.18-.53.06-.24-.12-1.03-.38-1.96-1.21-.72-.65-1.21-1.45-1.36-1.69-.14-.24-.02-.37.11-.49.11-.11.24-.29.36-.43.12-.14.16-.24.24-.4.08-.16.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.42h-.48c-.16 0-.42.06-.65.31-.22.24-.85.83-.85 2.03s.87 2.36 1 2.52c.12.16 1.71 2.62 4.15 3.67.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.45-.59 1.65-1.16.2-.57.2-1.05.14-1.15-.06-.1-.22-.16-.46-.29Z" />
  </svg>
)

/** Revela cada sección con una animación de scroll que se repite en
 * ambos sentidos (aparece al entrar en pantalla, se oculta al salir).
 * Se vuelve a ejecutar cuando cambia el contenido dinámico (filtros del
 * catálogo) para observar los elementos nuevos que se agregan al DOM. */
function useScrollReveal(deps: unknown[]) {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => { for (const entry of entries) entry.target.classList.toggle('in-view', entry.isIntersecting) },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    document.querySelectorAll('.reveal').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`brand-mark ${className}`}>
      <img src="/logo.png" alt="JB Tech Store" className="brand-logo" />
      <span className="brand-mark-text"><b>JB</b> TECH STORE</span>
    </span>
  )
}

function DiscountBadge({ price, originalPrice }: { price: number; originalPrice: number }) {
  if (!originalPrice || originalPrice <= price) return null
  const percent = Math.round((1 - price / originalPrice) * 100)
  return <span className="discount-badge">-{percent}%</span>
}

function ProductCard({ product, onAdd, onView }: { product: Product; onAdd: (product: Product, option?: string) => void; onView: (product: Product) => void }) {
  const Icon = categoryIcon(product.category)
  const options = product.options.split(',').map((item) => item.trim()).filter(Boolean)
  const [selected, setSelected] = useState(options[0] ?? '')
  return (
    <article className="product-card reveal">
      <div className="product-card-media" onClick={() => onView(product)}>
        <DiscountBadge price={product.price} originalPrice={product.originalPrice} />
        {product.stock === 0 && <span className="stock-badge">Agotado</span>}
        <img src={product.image} alt={product.name} loading="lazy" />
        <button type="button" className="product-card-view-button" onClick={(event) => { event.stopPropagation(); onView(product) }} aria-label={`Ver detalles de ${product.name}`}><Eye size={15} /></button>
      </div>
      <div className="product-card-body">
        <p className="product-card-category"><Icon size={13} />{product.category}</p>
        <h3>{product.name}</h3>
        {product.description && <p className="product-card-description">{product.description}</p>}
        {options.length > 0 && (
          <div className="product-card-options">
            <label>Elige una opción</label>
            <select value={selected} onChange={(event) => setSelected(event.target.value)}>
              {options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        )}
        <div className="product-card-price">
          {product.originalPrice > product.price && <s>{money(product.originalPrice)}</s>}
          <strong>{money(product.price)}</strong>
        </div>
        <button className="product-card-add" disabled={product.stock === 0} onClick={() => onAdd(product, selected || undefined)}>
          {product.stock === 0 ? 'Agotado' : <>Agregar <Plus size={15} /></>}
        </button>
      </div>
    </article>
  )
}

/** Vista ampliada de un producto (se abre al tocar la foto o el ícono de
 * ojo en la tarjeta): foto grande, categoría, nombre completo, la
 * descripción SIN recortar (en la tarjeta se corta a 2 líneas) y el
 * mismo selector de opciones + botón de agregar. */
function ProductQuickView({ product, onAdd, onClose }: { product: Product; onAdd: (product: Product, option?: string) => void; onClose: () => void }) {
  const Icon = categoryIcon(product.category)
  const options = product.options.split(',').map((item) => item.trim()).filter(Boolean)
  const [selected, setSelected] = useState(options[0] ?? '')
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal-card product-quickview" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close icon-button" onClick={onClose}><X /></button>
        <div className="product-quickview-media">
          <DiscountBadge price={product.price} originalPrice={product.originalPrice} />
          {product.stock === 0 && <span className="stock-badge">Agotado</span>}
          <img src={product.image} alt={product.name} />
        </div>
        <div className="product-quickview-body">
          <p className="product-card-category"><Icon size={13} />{product.category}</p>
          <h2>{product.name}</h2>
          {product.description && <p className="product-quickview-description">{product.description}</p>}
          {options.length > 0 && (
            <div className="product-card-options">
              <label>Elige una opción</label>
              <select value={selected} onChange={(event) => setSelected(event.target.value)}>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          )}
          <div className="product-card-price">
            {product.originalPrice > product.price && <s>{money(product.originalPrice)}</s>}
            <strong>{money(product.price)}</strong>
          </div>
          <button className="primary-button full" disabled={product.stock === 0} onClick={() => { onAdd(product, selected || undefined); onClose() }}>
            {product.stock === 0 ? 'Agotado' : <>Agregar al carrito <Plus size={15} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}

function buildWhatsAppText(orderNumber: string, items: CartLine[], total: number) {
  const lines = items.map((item) => `• ${item.quantity}x ${item.name} — ${money(item.price * item.quantity)}`).join('\n')
  return `Hola JB Tech Store! Acabo de hacer el pedido ${orderNumber}:\n\n${lines}\n\nTotal: ${money(total)}`
}

/** Carga html2canvas desde CDN la primera vez que hace falta (al
 * compartir un pedido), en vez de instalarlo como dependencia local —
 * así se evita el problema ya conocido de `pnpm add` con workerd en
 * Termux. Si ya está cargado (segunda vez que se comparte), no vuelve
 * a pedirlo. */
let html2canvasPromise: Promise<any> | null = null
function loadHtml2Canvas(): Promise<any> {
  const existing = (window as any).html2canvas
  if (existing) return Promise.resolve(existing)
  if (!html2canvasPromise) {
    html2canvasPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
      script.onload = () => resolve((window as any).html2canvas)
      script.onerror = () => reject(new Error('No se pudo cargar el generador de imagen.'))
      document.head.appendChild(script)
    })
  }
  return html2canvasPromise
}

/** Recibo visual del pedido, pensado solo para capturarse como imagen
 * (por eso vive fuera de pantalla, no para verse en la página). Estilos
 * en colores fijos, no en variables CSS, para que la captura salga
 * igual sin depender de que html2canvas resuelva custom properties. */
function OrderReceipt({ orderNumber, items, total, whatsapp }: { orderNumber: string; items: CartLine[]; total: number; whatsapp: string }) {
  const today = new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div className="receipt">
      <div className="receipt-head">
        <img src="/logo.png" alt="" />
        <span>JB TECH STORE</span>
      </div>
      <p className="receipt-thanks">¡Gracias por tu pedido! 🎉</p>
      <p className="receipt-ref">Ref. {orderNumber} · {today}</p>
      <div className="receipt-items">
        {items.map((item) => <div key={item.productId}><span>{item.quantity}x {item.name}</span><b>{money(item.price * item.quantity)}</b></div>)}
      </div>
      <div className="receipt-divider" />
      <div className="receipt-total"><span>Total</span><b>{money(total)}</b></div>
      <p className="receipt-footer">Te contactamos enseguida para coordinar el pago y la entrega.<br />WhatsApp: +{whatsapp}</p>
    </div>
  )
}

type VoiceSegment = { text: string; pauseAfter: number }

/** Divide el texto en fragmentos que se leen uno tras otro con pequeñas
 * pausas entre sí. Usa "..." en el texto para marcar dónde quieres una
 * pausa (el primer "..." deja una pausa un poco más larga, tipo respiro
 * inicial; los siguientes son más cortos). Los puntos y comas normales
 * también generan una pausa breve de forma natural. */
function splitIntoVoiceSegments(text: string): VoiceSegment[] {
  const parts = text.split(/(\.\.\.|[.!?]+|,)/).filter((part) => part.trim() !== '')
  const segments: VoiceSegment[] = []
  let buffer = ''
  let ellipsisCount = 0
  for (const part of parts) {
    if (part === '...') {
      ellipsisCount++
      if (buffer.trim()) segments.push({ text: buffer.trim(), pauseAfter: ellipsisCount === 1 ? 520 : 320 })
      buffer = ''
    } else if (/^[.!?]+$/.test(part)) {
      buffer += part
      segments.push({ text: buffer.trim(), pauseAfter: 400 })
      buffer = ''
    } else if (part === ',') {
      buffer += part
      segments.push({ text: buffer.trim(), pauseAfter: 220 })
      buffer = ''
    } else {
      buffer += part
    }
  }
  if (buffer.trim()) segments.push({ text: buffer.trim(), pauseAfter: 0 })
  return segments
}

const FEMALE_VOICE_HINTS = ['female', 'mujer', 'maria', 'lucía', 'lucia', 'sofía', 'sofia', 'valentina', 'camila', 'mónica', 'monica', 'elena', 'laura', 'inés', 'ines', 'isabela', 'paulina']
const MALE_VOICE_HINTS = ['male', 'hombre', 'jorge', 'diego', 'carlos', 'pablo', 'miguel', 'enrique', 'juan', 'fernando', 'andrés', 'andres', 'raúl', 'raul', 'alonso', 'antonio']

/** Dice en voz alta un mensaje de bienvenida apenas se carga la tienda,
 * usando la voz nativa del navegador del visitante (no requiere subir
 * ningún archivo de audio). Busca una voz del género elegido en el panel
 * admin (si el dispositivo tiene alguna con ese nombre); si no encuentra
 * ninguna, usa la voz en español que haya disponible y ajusta el tono
 * para acercarse al género pedido. Habla más despacio y respeta las
 * pausas marcadas con "..." en el texto para sonar más natural. Los
 * navegadores bloquean a veces el audio automático sin interacción
 * previa del usuario: si eso pasa, el mensaje queda "armado" y se
 * dispara con el primer toque/clic/tecla en la página. */
function useWelcomeVoice(text: string, gender: 'hombre' | 'mujer') {
  useEffect(() => {
    if (!text.trim()) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    let started = false
    let cancelled = false

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      const spanish = voices.filter((voice) => voice.lang.toLowerCase().startsWith('es'))
      const hints = gender === 'mujer' ? FEMALE_VOICE_HINTS : MALE_VOICE_HINTS
      const matched = spanish.find((voice) => hints.some((hint) => voice.name.toLowerCase().includes(hint)))
      return matched || spanish[0] || voices[0]
    }

    const speakSegments = (segments: VoiceSegment[]) => {
      const voice = pickVoice()
      let i = 0
      const speakNext = () => {
        if (cancelled || i >= segments.length) return
        const segment = segments[i]
        const utterance = new SpeechSynthesisUtterance(segment.text)
        utterance.lang = 'es-DO'
        if (voice) utterance.voice = voice
        utterance.rate = 0.85 // un poco más lento, ritmo más natural
        utterance.pitch = gender === 'mujer' ? 1.08 : 0.8 // acerca el tono al género elegido
        utterance.onend = () => {
          i++
          if (segment.pauseAfter > 0) setTimeout(speakNext, segment.pauseAfter)
          else speakNext()
        }
        window.speechSynthesis.speak(utterance)
      }
      speakNext()
    }

    const start = () => {
      if (started) return
      started = true
      window.speechSynthesis.cancel()
      speakSegments(splitIntoVoiceSegments(text))
    }

    const tryAutoStart = () => {
      if (window.speechSynthesis.getVoices().length > 0) start()
      else window.speechSynthesis.addEventListener('voiceschanged', start, { once: true })
    }
    tryAutoStart()

    window.addEventListener('pointerdown', start, { once: true })
    window.addEventListener('keydown', start, { once: true })

    return () => {
      cancelled = true
      window.speechSynthesis.removeEventListener('voiceschanged', start)
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
    }
  }, [text, gender])
}

export function Storefront({ data }: Props) {
  const { products, content: copy } = data
  const whatsappDigits = copy.whatsapp.replace(/\D/g, '')

  useWelcomeVoice(copy.welcomeVoiceText || '', copy.welcomeVoiceGender === 'mujer' ? 'mujer' : 'hombre')

  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [cart, setCart] = useState<CartLine[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [maxPrice, setMaxPrice] = useState<number | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [offersTab, setOffersTab] = useState<'featured' | 'new' | 'bestSeller'>('featured')
  const [confirmation, setConfirmation] = useState<{ orderNumber: string; total: number; items: CartLine[] } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sharingImage, setSharingImage] = useState(false)
  const [error, setError] = useState('')
  const [quickView, setQuickView] = useState<Product | null>(null)

  const realCategories = useMemo(() => Array.from(new Set(products.map((product) => product.category))), [products])
  const categories = useMemo(() => ['Todos', ...realCategories], [realCategories])
  const maxPossiblePrice = useMemo(() => products.reduce((max, product) => Math.max(max, product.price), 0) || 1000000, [products])
  const activeFilterCount = (category !== 'Todos' ? 1 : 0) + (maxPrice !== null ? 1 : 0)

  const visibleProducts = useMemo(() => products.filter((product) =>
    (category === 'Todos' || product.category === category) &&
    (maxPrice === null || product.price <= maxPrice) &&
    `${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase()),
  ), [products, category, query, maxPrice])

  const offersProducts = useMemo(() => {
    const filtered = products.filter((product) => (offersTab === 'featured' ? product.featured : offersTab === 'new' ? product.isNew : product.bestSeller))
    return (filtered.length ? filtered : products).slice(0, 8)
  }, [products, offersTab])

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

  const addToCart = (product: Product, option?: string) => {
    const name = option ? `${product.name} — ${option}` : product.name
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id && line.name === name)
      if (existing) return current.map((line) => line === existing ? { ...line, quantity: Math.min(line.quantity + 1, product.stock) } : line)
      return [...current, { productId: product.id, name, price: product.price, quantity: 1, image: product.image }]
    })
    setCartOpen(true)
  }

  const changeQuantity = (id: number, delta: number) => setCart((current) => current.flatMap((line) => {
    if (line.productId !== id) return [line]
    const product = products.find((item) => item.id === id)
    const quantity = Math.min(line.quantity + delta, product?.stock ?? line.quantity)
    return quantity > 0 ? [{ ...line, quantity }] : []
  }))

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await createOrder({ data: { name: String(form.get('name')), phone: String(form.get('phone')), email: String(form.get('email')), address: String(form.get('address')), items: cart } })
      setConfirmation({ orderNumber: result.orderNumber, total: result.total, items: [...cart] })
      setCart([])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos enviar el pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  const receiptRef = useRef<HTMLDivElement>(null)

  // Esta es la acción principal: abre WhatsApp directo en el chat de la
  // tienda (tu número), con el pedido ya escrito. No depende de que el
  // cliente tenga tu número guardado ni de que sepa a quién compartirle
  // algo — el link wa.me ya lleva el número adentro.
  function sendOrderText() {
    if (!confirmation) return
    window.open(`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(buildWhatsAppText(confirmation.orderNumber, confirmation.items, confirmation.total))}`, '_blank', 'noreferrer')
  }

  // Esta es la opción secundaria (opcional): comparte la imagen bonita
  // del recibo por el selector nativo del teléfono. A diferencia del
  // botón principal, aquí SÍ depende de que la persona escoja a quién
  // mandársela — por eso ya no es la acción por defecto.
  async function shareOrderImage() {
    if (!confirmation || sharingImage) return
    setSharingImage(true)
    try {
      const html2canvas = await loadHtml2Canvas()
      const node = receiptRef.current
      if (!node) throw new Error('no-node')
      const canvas = await html2canvas(node, { backgroundColor: '#0b1220', scale: 2, useCORS: true })
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('no-blob')
      const file = new File([blob], `pedido-${confirmation.orderNumber}.png`, { type: 'image/png' })
      const caption = `Pedido ${confirmation.orderNumber} — JB Tech Store`

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: caption })
        return
      }
      // Respaldo (navegador de escritorio u otro sin share de archivos):
      // simplemente descarga la imagen para que la persona la adjunte a mano.
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `pedido-${confirmation.orderNumber}.png`
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return // el usuario cerró el menú de compartir
    } finally {
      setSharingImage(false)
    }
  }

  useScrollReveal([visibleProducts.length, offersProducts.length, category, query])

  return <div className="site-shell">
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button>
      </div>
      <a className="wordmark" href="#inicio"><BrandMark /></a>
      <nav className="desktop-nav">
        <a href="#tienda"><Store size={16} />{copy.navShop}</a>
        <a href="#ofertas"><Flame size={16} />{copy.navOffers}</a>
        <a href="#contacto"><Phone size={16} />{copy.navContact}</a>
      </nav>
      <div className="topbar-actions">
        <ShareButton title={copy.brandName} />
        <button className="cart-button" onClick={() => setCartOpen(true)} aria-label="Ver carrito"><ShoppingCart size={19} /><b>{cartCount}</b></button>
      </div>
    </header>

    <div className={`overlay ${menuOpen ? 'visible' : ''}`} onClick={() => setMenuOpen(false)} />
    <aside className={`side-menu ${menuOpen ? 'open' : ''}`}>
      <div className="drawer-head"><BrandMark className="mini-mark" /><button className="icon-button" onClick={() => setMenuOpen(false)}><X /></button></div>
      <p className="drawer-kicker">Categorías</p>
      <div className="drawer-categories">
        {realCategories.map((item) => {
          const Icon = categoryIcon(item)
          return <button key={item} onClick={() => { setCategory(item); setMenuOpen(false); document.getElementById('tienda')?.scrollIntoView({ behavior: 'smooth' }) }}><Icon size={17} />{item}</button>
        })}
      </div>
      <p className="drawer-kicker">Explora</p>
      <a href="#tienda" onClick={() => setMenuOpen(false)}>Toda la tienda <ChevronRight size={15} /></a>
      <a href="#ofertas" onClick={() => setMenuOpen(false)}>Ofertas <ChevronRight size={15} /></a>
      <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto <ChevronRight size={15} /></a>
      <Link to="/politicas" onClick={() => setMenuOpen(false)}>Políticas <ChevronRight size={15} /></Link>
      <Link to="/terminos" onClick={() => setMenuOpen(false)}>Términos y condiciones <ChevronRight size={15} /></Link>
      <div className="drawer-admin"><span>Área privada</span><Link to="/admin">Entrar al panel administrativo</Link></div>
    </aside>

    <main>
      <section className="hero" id="inicio">
        <p className="eyebrow reveal"><Sparkles size={14} />{copy.eyebrow}</p>
        <h1 className="reveal delay-1">{copy.heroTitle}</h1>
        <p className="hero-lede reveal delay-1">{copy.heroDescription}</p>
        <div className="hero-actions reveal delay-1">
          <a className="primary-button" href="#tienda">{copy.heroCta}<ArrowRight size={16} /></a>
          <a className="whatsapp-button" href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={17} />WhatsApp</a>
        </div>
        <p className="hero-badge reveal delay-1"><Send size={13} />{copy.heroBadge}</p>
      </section>

      <section className="category-grid-section" id="categorias">
        <div className="section-heading reveal"><span>Explora</span><h2>Compra por categoría</h2></div>
        <div className="category-grid">
          {realCategories.map((item) => {
            const Icon = categoryIcon(item)
            return (
              <a key={item} href="#tienda" className="category-tile reveal" onClick={() => setCategory(item)}>
                <span className="category-tile-icon"><Icon size={24} /></span>
                <span>{item}</span>
              </a>
            )
          })}
        </div>
      </section>

      <section className="offers-section" id="ofertas">
        <div className="section-heading reveal"><span><Flame size={13} />Ofertas</span><h2>{copy.offersTitle}</h2><p>{copy.offersDescription}</p></div>
        <div className="offers-tabs reveal">
          <button className={offersTab === 'featured' ? 'active' : ''} onClick={() => setOffersTab('featured')}>Destacados</button>
          <button className={offersTab === 'new' ? 'active' : ''} onClick={() => setOffersTab('new')}>Nuevos</button>
          <button className={offersTab === 'bestSeller' ? 'active' : ''} onClick={() => setOffersTab('bestSeller')}>Más vendidos</button>
        </div>
        <div className="product-grid">
          {offersProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} onView={setQuickView} />)}
        </div>
      </section>

      <section className="catalog" id="tienda">
        <div className="section-heading reveal"><span>Catálogo completo</span><h2>{copy.catalogTitle}</h2><p>{copy.catalogDescription}</p></div>
        <div className="catalog-layout">
          <aside className="filters reveal">
            <label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto..." /></label>
            <button type="button" className="filters-toggle" onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen}>
              <SlidersHorizontal size={15} />Filtros{activeFilterCount > 0 && <span>{activeFilterCount}</span>}
              <ChevronDown size={16} className={filtersOpen ? 'flip' : ''} />
            </button>
            <div className={`filters-body ${filtersOpen ? 'open' : ''}`}>
              <div className="filter-block">
                <p className="filter-label">Categoría</p>
                <div className="category-list">
                  {categories.map((item) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{item === 'Todos' ? products.length : products.filter((product) => product.category === item).length}</span></button>)}
                </div>
              </div>
              <div className="filter-block">
                <p className="filter-label">Precio máximo: {money(maxPrice ?? maxPossiblePrice)}</p>
                <input type="range" min={0} max={maxPossiblePrice} step={5000} value={maxPrice ?? maxPossiblePrice} onChange={(event) => setMaxPrice(Number(event.target.value))} />
                {maxPrice !== null && <button className="filter-reset" onClick={() => setMaxPrice(null)}>Quitar filtro de precio</button>}
              </div>
            </div>
          </aside>
          <div className="product-grid">
            {visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} onView={setQuickView} />)}
            {visibleProducts.length === 0 && <div className="empty-state"><Search /><h3>No encontramos ese producto</h3><p>Prueba otra palabra o categoría.</p></div>}
          </div>
        </div>
      </section>

      <section className="benefits" id="beneficios">
        <div className="section-heading reveal"><span>Ventajas</span><h2>{copy.benefitsTitle}</h2></div>
        <div className="benefits-grid">
          {[1, 2, 3].map((number) => <article className={`reveal delay-${number}`} key={number}><span className="benefit-number">0{number}</span><h3>{copy[`benefit${number}Title`]}</h3><p>{copy[`benefit${number}Text`]}</p></article>)}
        </div>
      </section>
    </main>

    <footer id="contacto">
      <div className="footer-grid">
        <div className="footer-brand reveal">
          <BrandMark className="footer-mark" />
          <p>{copy.footerText}</p>
          <div className="footer-social">
            <a href={`https://instagram.com/${(copy.instagram || '').replace('@', '')}`} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={17} /></a>
            <a href={`https://facebook.com/${copy.facebook || ''}`} target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook size={17} /></a>
            <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer" aria-label="WhatsApp"><WhatsAppIcon size={17} /></a>
          </div>
        </div>
        <div className="reveal delay-1">
          <span>Contáctanos</span>
          <a className="footer-whatsapp" href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={16} />Pedidos por WhatsApp</a>
          <p className="footer-location">{copy.location}</p>
        </div>
        <div className="reveal delay-2"><span>Horario</span><p>{copy.schedule}</p></div>
        <div className="reveal delay-3">
          <span>Métodos de pago</span>
          <div className="payment-tags"><span>Efectivo</span><span>Transferencia</span><span>Tarjeta</span></div>
        </div>
      </div>
      <div className="footer-bottom reveal">
        <a className="gadr-credit" href="https://gadrnet.com" target="_blank" rel="noopener noreferrer">
          <span className="gadr-credit-text">Diseño y desarrollo de la tienda: GADR Net | gadrnet.com</span>
          <span className="gadr-mark" aria-hidden="true">
            <span className="gadr-mark-icon">&lt;/&gt;<i /></span>
            <span className="gadr-mark-word">GADR<small>Net</small></span>
          </span>
        </a>
        <p>© {new Date().getFullYear()} {copy.brandName} · <Link to="/politicas">Políticas</Link> · <Link to="/terminos">Términos y condiciones</Link></p>
      </div>
    </footer>

    <nav className="mobile-tabbar">
      <a href="#inicio"><Home size={20} /><span>Inicio</span></a>
      <a href="#tienda"><Store size={20} /><span>Tienda</span></a>
      <button onClick={() => setCartOpen(true)}><ShoppingCart size={20} />{cartCount > 0 && <b>{cartCount}</b>}<span>Carrito</span></button>
      <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={20} /><span>WhatsApp</span></a>
    </nav>

    <div className={`overlay ${cartOpen ? 'visible' : ''}`} onClick={() => setCartOpen(false)} />
    <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`}>
      <div className="drawer-head"><div><span className="drawer-kicker">CARRITO · {cartCount} {cartCount === 1 ? 'ARTÍCULO' : 'ARTÍCULOS'}</span><h2>{copy.cartTitle}</h2></div><button className="icon-button" onClick={() => setCartOpen(false)}><X /></button></div>
      <div className="cart-lines">
        {cart.map((line) => <div className="cart-line" key={line.productId}>
          <img src={line.image} alt="" />
          <div><h4>{line.name}</h4><p>{money(line.price)}</p><div className="quantity"><button onClick={() => changeQuantity(line.productId, -1)}><Minus size={14} /></button><span>{line.quantity}</span><button onClick={() => changeQuantity(line.productId, 1)}><Plus size={14} /></button></div></div>
          <button className="remove" onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))}><Trash2 size={16} /></button>
        </div>)}
        {!cart.length && <div className="empty-cart"><ShoppingCart /><h3>Tu carrito está vacío</h3><p>Explora el catálogo y agrega tus productos favoritos.</p></div>}
      </div>
      <div className="cart-summary">
        <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
        <p>La entrega se coordina después de confirmar el pedido.</p>
        <button className="primary-button full" disabled={!cart.length} onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}>Continuar al checkout <ArrowRight size={16} /></button>
      </div>
    </aside>

    {checkoutOpen && <div className="modal-wrap"><div className="modal-card"><button className="modal-close icon-button" onClick={() => { setCheckoutOpen(false); setConfirmation(null) }}><X /></button>
      {confirmation ? <div className="confirmation">
        <div className="success-icon"><Check /></div>
        <span>PEDIDO RECIBIDO</span>
        <h2>Gracias por comprar en JB Tech Store.</h2>
        <p>Tu número de pedido es</p>
        <strong>{confirmation.orderNumber}</strong>
        <p>Total: {money(confirmation.total)}. Te contactaremos para coordinar pago y entrega, o envíanos tu pedido ahora mismo por WhatsApp:</p>
        <button className="primary-button" onClick={sendOrderText}><WhatsAppIcon size={16} />Enviar pedido por WhatsApp</button>
        <button className="ghost-button" disabled={sharingImage} onClick={shareOrderImage}>{sharingImage ? 'Generando imagen…' : 'O comparte la imagen del pedido'}</button>
        <button className="ghost-button" onClick={() => { setCheckoutOpen(false); setConfirmation(null) }}>Volver a la tienda</button>
      </div> : <div className="checkout-grid">
        <div>
          <span className="drawer-kicker">ÚLTIMO PASO</span>
          <h2>{copy.checkoutTitle}</h2>
          <p>Déjanos tus datos para coordinar pago y entrega.</p>
          <form id="checkout-form" onSubmit={submitOrder}>
            <input required name="name" placeholder="Nombre completo" />
            <input required name="phone" placeholder="Teléfono / WhatsApp" />
            <input name="email" type="email" placeholder="Correo electrónico (opcional)" />
            <textarea required name="address" placeholder="Dirección de entrega" rows={3} />
            {error && <p className="form-error">{error}</p>}
          </form>
        </div>
        <div className="order-review">
          <h3>Resumen</h3>
          {cart.map((line) => <div key={line.productId}><span>{line.quantity} × {line.name}</span><strong>{money(line.quantity * line.price)}</strong></div>)}
          <div className="checkout-total"><span>Total</span><strong>{money(subtotal)}</strong></div>
          <button form="checkout-form" disabled={submitting} className="primary-button full">{submitting ? 'Enviando...' : 'Enviar pedido'}<ArrowRight size={16} /></button>
        </div>
      </div>}
    </div></div>}

    {quickView && <ProductQuickView product={quickView} onAdd={addToCart} onClose={() => setQuickView(null)} />}

    <div className="receipt-capture" ref={receiptRef}>
      {confirmation && <OrderReceipt orderNumber={confirmation.orderNumber} items={confirmation.items} total={confirmation.total} whatsapp={whatsappDigits} />}
    </div>
  </div>
}
