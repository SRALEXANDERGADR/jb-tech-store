import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, FormEvent, MouseEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft, ArrowRight, BatteryCharging, Check, ChevronDown, ChevronLeft, ChevronRight, Facebook, Flame, Gamepad2,
  Headphones, Home, Instagram, Laptop, LayoutGrid, Menu, MessageCircle, Minus, Package, Phone, Plus,
  Search, ShieldCheck, ShoppingCart, SlidersHorizontal, Smartphone, Store, Trash2, Truck, Watch, X,
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
  variantImages: Array<{ option: string; image: string; description: string }>
  featured: boolean
  isNew: boolean
  bestSeller: boolean
}
type Props = { data: { products: Product[]; content: Record<string, string> } }

const money = (value: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(value / 100)

/** Busca la foto/descripción propia de una opción elegida (color, diseño,
 * modelo de iPhone, etc.). Si esa opción no tiene una foto propia subida
 * desde el admin, devuelve undefined y quien llama cae de vuelta a la
 * foto/descripción general del producto. */
function variantFor(product: Product, option: string) {
  return option ? (product.variantImages || []).find((entry) => entry.option === option) : undefined
}

function parseOptions(product: Product) {
  return product.options.split(',').map((item) => item.trim()).filter(Boolean)
}

type GalleryItem = { image: string; option: string | null }

/** Fotos que se pueden deslizar (como en Temu): primero la foto general
 * del producto y después la foto propia de cada opción, en el mismo orden
 * de las opciones y sin repetir la misma foto dos veces. */
function buildGallery(product: Product, options: string[]): GalleryItem[] {
  const items: GalleryItem[] = []
  const seen = new Set<string>()
  if (product.image) { items.push({ image: product.image, option: null }); seen.add(product.image) }
  for (const option of options) {
    const image = variantFor(product, option)?.image
    if (image && !seen.has(image)) { items.push({ image, option }); seen.add(image) }
  }
  if (!items.length) items.push({ image: product.image, option: null })
  return items
}

function galleryIndexFor(gallery: GalleryItem[], option: string) {
  return gallery.findIndex((item) => item.option === option)
}

function discountPercent(product: Product) {
  return product.originalPrice > product.price ? Math.round((1 - product.price / product.originalPrice) * 100) : 0
}

/** Carrusel de fotos con deslizamiento nativo (scroll-snap). El número
 * "1/5" se actualiza mientras se desliza; el índice "oficial" (el que
 * cambia la opción elegida) se confirma cuando el dedo se detiene, para
 * no pelear con el desplazamiento suave cuando se toca una miniatura. */
function Gallery({ items, index, onIndexChange, alt, className = '', arrows = false, eager = false }: {
  items: GalleryItem[]; index: number; onIndexChange: (index: number) => void; alt: string; className?: string; arrows?: boolean; eager?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [live, setLive] = useState(index)

  useEffect(() => {
    const track = trackRef.current
    if (!track || !track.clientWidth) return
    const target = index * track.clientWidth
    if (Math.abs(track.scrollLeft - target) > 2) track.scrollTo({ left: target, behavior: 'smooth' })
    setLive(index)
  }, [index])

  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

  const handleScroll = () => {
    const track = trackRef.current
    if (!track || !track.clientWidth) return
    const current = Math.round(track.scrollLeft / track.clientWidth)
    setLive(current)
    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => { if (current !== index) onIndexChange(current) }, 140)
  }

  const go = (delta: number) => (event: MouseEvent) => {
    event.stopPropagation()
    onIndexChange(Math.min(items.length - 1, Math.max(0, index + delta)))
  }

  return (
    <div className={`gallery ${className}`}>
      <div className="gallery-track" ref={trackRef} onScroll={handleScroll}>
        {items.map((item, i) => (
          <div className="gallery-slide" key={`${item.image}-${i}`}>
            <img src={item.image} alt={item.option ? `${alt} — ${item.option}` : alt} loading={eager && i === 0 ? 'eager' : 'lazy'} decoding="async" draggable={false} />
          </div>
        ))}
      </div>
      {items.length > 1 && <span className="gallery-counter">{live + 1}/{items.length}</span>}
      {arrows && items.length > 1 && <>
        <button type="button" className="gallery-arrow prev" onClick={go(-1)} disabled={index === 0} aria-label="Foto anterior"><ChevronLeft size={20} /></button>
        <button type="button" className="gallery-arrow next" onClick={go(1)} disabled={index === items.length - 1} aria-label="Foto siguiente"><ChevronRight size={20} /></button>
      </>}
    </div>
  )
}


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

/** Arma el enlace de una red social a partir de lo que se escribió en el
 * panel: si ya es un enlace completo se usa tal cual; si es un usuario
 * (@jb_tech.store) se arma la URL; si tiene espacios (ej. "JB TECH STORE",
 * que no es un usuario válido) se abre la búsqueda para no dar un enlace roto. */
function socialUrl(network: 'instagram' | 'facebook', raw: string) {
  const value = (raw || '').trim()
  if (/^https?:\/\//i.test(value)) return value
  const handle = value.replace(/^@/, '')
  if (!handle) return network === 'instagram' ? 'https://instagram.com' : 'https://facebook.com'
  if (/\s/.test(handle)) return network === 'instagram' ? `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(handle)}` : `https://www.facebook.com/search/top?q=${encodeURIComponent(handle)}`
  return network === 'instagram' ? `https://instagram.com/${encodeURIComponent(handle)}` : `https://facebook.com/${encodeURIComponent(handle)}`
}

/** El saludo de bienvenida (voz o audio) se reproduce solo una vez al día
 * por visitante, no en cada visita: a un cliente que entra varias veces a
 * ver productos le molestaría escucharlo siempre. */
const WELCOME_KEY = 'jb-welcome-played'
function welcomeAlreadyPlayedToday() {
  try { return localStorage.getItem(WELCOME_KEY) === new Date().toDateString() } catch { return false }
}
function markWelcomePlayed() {
  try { localStorage.setItem(WELCOME_KEY, new Date().toDateString()) } catch { /* sin almacenamiento: no pasa nada */ }
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


/** Número de cantidad que se puede ESCRIBIR (además de los botones − y +):
 * para pedidos grandes, como 256 protectores, en vez de tocar + 256 veces.
 * Mientras se escribe se permite dejarlo vacío; al salir del campo vuelve
 * al último número válido. Nunca pasa del stock disponible. */
function QtyInput({ value, max, onChange, className = '' }: { value: number; max: number; onChange: (next: number) => void; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className={className}
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      min={1}
      max={Math.max(1, max)}
      aria-label="Cantidad"
      value={draft ?? String(value)}
      onFocus={(event) => event.target.select()}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const limit = Math.max(1, max)
        const next = Math.floor(Number(event.target.value))
        // Si escriben más de lo que hay en stock, se queda en el máximo y se ve
        // de una vez (no deja creer que se pidieron 250 si solo hay 200).
        setDraft(Number.isFinite(next) && next > limit ? String(limit) : event.target.value)
        if (Number.isFinite(next) && next >= 1) onChange(Math.min(next, limit))
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

type AddHandler = (product: Product, option: string | undefined, quantity: number) => boolean

function ProductCard({ product, onAdd, onOpen }: { product: Product; onAdd: AddHandler; onOpen: (product: Product, option: string, index: number) => void }) {
  const options = useMemo(() => parseOptions(product), [product])
  const gallery = useMemo(() => buildGallery(product, options), [product, options])
  const [selected, setSelected] = useState(options[0] ?? '')
  const [index, setIndex] = useState(0)
  const [added, setAdded] = useState(false)
  const percent = discountPercent(product)
  const soldOut = product.stock <= 0
  const swatchOptions = options.filter((option) => variantFor(product, option)?.image)
  const hasSwatches = swatchOptions.length > 0
  const textOnlyOptions = options.length > 0 && !hasSwatches

  const handleIndex = (next: number) => {
    setIndex(next)
    const option = gallery[next]?.option
    if (option) setSelected(option)
  }
  const pickOption = (option: string) => {
    setSelected(option)
    const galleryIndex = galleryIndexFor(gallery, option)
    if (galleryIndex >= 0) setIndex(galleryIndex)
  }
  const handleAdd = (event: MouseEvent) => {
    event.stopPropagation()
    // Si las opciones son solo texto (ej. modelos de iPhone) no hay forma
    // de elegir desde la tarjeta: se abre la ficha para escoger primero.
    if (textOnlyOptions) { onOpen(product, selected, index); return }
    if (onAdd(product, selected || undefined, 1)) {
      setAdded(true)
      setTimeout(() => setAdded(false), 1100)
    }
  }

  return (
    <article className={`product-card reveal ${soldOut ? 'is-soldout' : ''}`} onClick={() => onOpen(product, selected, index)}>
      <div className="product-card-media">
        <Gallery items={gallery} index={index} onIndexChange={handleIndex} alt={product.name} className="card-gallery" />
        {percent > 0 && <span className="discount-badge">-{percent}%</span>}
        {soldOut && <span className="stock-badge">Agotado</span>}
      </div>
      <div className="product-card-body">
        <h3>{product.name}</h3>
        {hasSwatches && (
          <div className="card-swatches" onClick={(event) => event.stopPropagation()}>
            {swatchOptions.slice(0, 4).map((option) => (
              <button type="button" key={option} className={option === selected ? 'active' : ''} title={option} aria-label={option} onClick={() => pickOption(option)}>
                <img src={variantFor(product, option)?.image} alt="" loading="lazy" />
              </button>
            ))}
            {swatchOptions.length > 4 && <span className="card-swatches-more">+{swatchOptions.length - 4}</span>}
          </div>
        )}
        {textOnlyOptions && <p className="card-options-hint">{options.length} opciones disponibles</p>}
        {(product.bestSeller || product.isNew || (product.stock > 0 && product.stock <= 5)) && (
          <p className="card-tags">
            {product.bestSeller && <span className="tag-hot"><Flame size={11} />Más vendido</span>}
            {!product.bestSeller && product.isNew && <span className="tag-new">Nuevo</span>}
            {product.stock > 0 && product.stock <= 5 && <span className="tag-low">Quedan {product.stock}</span>}
          </p>
        )}
        <div className="product-card-foot">
          <div className="product-card-price">
            <strong>{money(product.price)}</strong>
            {percent > 0 && <s>{money(product.originalPrice)}</s>}
          </div>
          <button type="button" className={`card-add ${added ? 'done' : ''}`} disabled={soldOut} onClick={handleAdd} aria-label={textOnlyOptions ? 'Elegir opción' : 'Agregar al carrito'}>
            {added ? <Check size={17} /> : <ShoppingCart size={17} />}
            {!added && <Plus size={10} strokeWidth={3.2} className="card-add-plus" />}
          </button>
        </div>
      </div>
    </article>
  )
}

const SHEET_ANIMATION_MS = 280

/** Ficha completa del producto (como la página de producto de Temu):
 * en el teléfono ocupa toda la pantalla y entra deslizándose desde abajo;
 * en computadora es un diálogo de dos columnas. Tiene galería con número
 * de foto, opciones con miniaturas, cantidad, descripción completa, un
 * carrito flotante arriba y el botón de agregar fijo abajo. Agregar NO
 * abre el carrito: solo muestra un aviso y sube el contador. */
function ProductSheet({ product, initialOption, initialIndex, copy, cartCount, onAdd, onOpenCart, onClose }: {
  product: Product; initialOption: string; initialIndex: number; copy: Record<string, string>; cartCount: number
  onAdd: AddHandler; onOpenCart: () => void; onClose: () => void
}) {
  const options = useMemo(() => parseOptions(product), [product])
  const gallery = useMemo(() => buildGallery(product, options), [product, options])
  const [selected, setSelected] = useState(initialOption || options[0] || '')
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), gallery.length - 1))
  const [quantity, setQuantity] = useState(1)
  const [visible, setVisible] = useState(false)
  const [added, setAdded] = useState(false)

  const variant = variantFor(product, selected)
  const description = variant?.description || product.description
  const percent = discountPercent(product)
  const soldOut = product.stock <= 0
  const hasImageOptions = options.some((option) => variantFor(product, option)?.image)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const close = () => {
    setVisible(false)
    setTimeout(onClose, SHEET_ANIMATION_MS)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleIndex = (next: number) => {
    setIndex(next)
    const option = gallery[next]?.option
    if (option) setSelected(option)
  }
  const pickOption = (option: string) => {
    setSelected(option)
    const galleryIndex = galleryIndexFor(gallery, option)
    if (galleryIndex >= 0) setIndex(galleryIndex)
  }
  const handleAdd = () => {
    if (!onAdd(product, selected || undefined, quantity)) return
    setAdded(true)
    setTimeout(() => setAdded(false), 1400)
  }

  const trust = [
    { icon: Truck, title: copy.benefit3Title || 'Entrega rápida', text: copy.benefit3Text || copy.heroBadge || 'Envíos a todo el país' },
    { icon: MessageCircle, title: copy.benefit2Title || 'Pedidos por WhatsApp', text: copy.benefit2Text || 'Coordina pago y entrega directo con nosotros.' },
    { icon: ShieldCheck, title: copy.benefit1Title || 'Productos originales', text: copy.benefit1Text || 'Equipos y accesorios verificados.' },
  ]

  return (
    <div className={`pd-root ${visible ? 'open' : ''}`}>
      <div className="pd-backdrop" onClick={close} />
      <section className="pd-sheet" role="dialog" aria-modal="true" aria-label={product.name}>
        <div className="pd-floating">
          <button type="button" className="pd-round" onClick={close} aria-label="Cerrar"><ArrowLeft size={20} className="pd-back-icon" /><X size={20} className="pd-close-icon" /></button>
          <button type="button" className="pd-round pd-cart" onClick={onOpenCart} aria-label="Ver carrito">
            <ShoppingCart size={19} />
            {cartCount > 0 && <b key={cartCount}>{cartCount}</b>}
          </button>
        </div>

        <div className="pd-scroll">
          <div className="pd-layout">
            <div className="pd-media">
              <Gallery items={gallery} index={index} onIndexChange={handleIndex} alt={product.name} className="pd-gallery" arrows eager />
              {percent > 0 && <span className="discount-badge">-{percent}%</span>}
              {gallery.length > 1 && (
                <div className="pd-thumbs">
                  {gallery.map((item, i) => (
                    <button type="button" key={`${item.image}-${i}`} className={i === index ? 'active' : ''} onClick={() => handleIndex(i)} aria-label={`Foto ${i + 1}`}>
                      <img src={item.image} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pd-info">
              <div className="pd-price">
                <strong>{money(product.price)}</strong>
                {percent > 0 && <>
                  <s>{money(product.originalPrice)}</s>
                  <span className="pd-off">-{percent}%</span>
                </>}
              </div>
              {percent > 0 && <p className="pd-save">Ahorras {money(product.originalPrice - product.price)}</p>}

              <h2 className="pd-title">{product.name}</h2>

              <div className="pd-tags">
                <span className="pd-tag-cat">{product.category}</span>
                {product.bestSeller && <span className="tag-hot"><Flame size={11} />Más vendido</span>}
                {product.isNew && <span className="tag-new">Nuevo</span>}
                {soldOut ? <span className="tag-out">Agotado</span> : product.stock <= 5 ? <span className="tag-low">¡Solo quedan {product.stock}!</span> : <span className="tag-ok"><Check size={11} />Disponible</span>}
              </div>

              {options.length > 0 && (
                <div className="pd-block">
                  <div className="pd-block-head">
                    <span>Opción: <strong>{selected}</strong></span>
                    <em>{options.length} {options.length === 1 ? 'disponible' : 'disponibles'}</em>
                  </div>
                  {hasImageOptions ? (
                    <div className="pd-variants">
                      {options.map((option) => (
                        <button type="button" key={option} className={option === selected ? 'active' : ''} onClick={() => pickOption(option)}>
                          <span className="pd-variant-img"><img src={variantFor(product, option)?.image || product.image} alt="" loading="lazy" /></span>
                          <span className="pd-variant-name">{option}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="pd-chips">
                      {options.map((option) => (
                        <button type="button" key={option} className={option === selected ? 'active' : ''} onClick={() => pickOption(option)}>{option}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pd-block pd-qty">
                <span>Cantidad</span>
                <div className="pd-stepper">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="Menos"><Minus size={15} /></button>
                  <QtyInput value={quantity} max={product.stock} onChange={setQuantity} />
                  <button type="button" onClick={() => setQuantity((q) => Math.min(Math.max(1, product.stock), q + 1))} disabled={soldOut || quantity >= product.stock} aria-label="Más"><Plus size={15} /></button>
                </div>
              </div>

              <ul className="pd-trust">
                {trust.map(({ icon: TrustIcon, title, text }) => (
                  <li key={title}><TrustIcon size={17} /><div><strong>{title}</strong><span>{text}</span></div></li>
                ))}
              </ul>

              {description && (
                <div className="pd-block pd-desc">
                  <h3>Descripción</h3>
                  <p>{description}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="pd-actionbar">
          <div className="pd-actionbar-total">
            <span>Total</span>
            <strong>{money(product.price * quantity)}</strong>
          </div>
          <button type="button" className={`pd-add ${added ? 'done' : ''}`} disabled={soldOut} onClick={handleAdd}>
            {soldOut ? 'Agotado' : added ? <><Check size={18} />Agregado</> : <><ShoppingCart size={18} />Agregar al carrito</>}
          </button>
        </div>
      </section>
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
        {items.map((item) => <div key={`${item.productId}::${item.name}`}><span>{item.quantity}x {item.name}</span><b>{money(item.price * item.quantity)}</b></div>)}
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

const MALE_VOICE_HINTS = ['male', 'hombre', 'jorge', 'diego', 'carlos', 'pablo', 'miguel', 'enrique', 'juan', 'fernando', 'andrés', 'andres', 'raúl', 'raul', 'alonso', 'antonio']
const FEMALE_VOICE_HINTS = ['female', 'mujer', 'mónica', 'monica', 'paulina', 'lucía', 'lucia', 'esperanza', 'sabina', 'elvira', 'conchita', 'lupe', 'maría', 'maria', 'isabela', 'camila', 'valentina']

/** Dice en voz alta un mensaje de bienvenida apenas se carga la tienda,
 * usando la voz nativa del navegador del visitante (no requiere subir
 * ningún archivo de audio). Busca una voz de hombre o de mujer según
 * `gender`, habla más despacio, y respeta las pausas marcadas con "..."
 * en el texto para sonar más natural. Los navegadores bloquean a veces
 * el audio automático sin interacción previa del usuario: si eso pasa,
 * se reintenta con cada toque/clic/tecla siguiente hasta que uno
 * funcione (no se queda pegado tras el primer intento fallido). */
function useWelcomeVoice(text: string, gender: 'hombre' | 'mujer') {
  useEffect(() => {
    if (!text.trim()) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    if (welcomeAlreadyPlayedToday()) return

    let unlocked = false
    let cancelled = false

    const pickSpanishVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      const spanish = voices.filter((voice) => voice.lang.toLowerCase().startsWith('es'))
      const hints = gender === 'mujer' ? FEMALE_VOICE_HINTS : MALE_VOICE_HINTS
      const match = spanish.find((voice) => hints.some((hint) => voice.name.toLowerCase().includes(hint)))
      return match || spanish[0] || voices[0]
    }

    const speakSegments = (segments: VoiceSegment[]) => {
      const voice = pickSpanishVoice()
      let i = 0
      const speakNext = () => {
        if (cancelled || i >= segments.length) return
        const segment = segments[i]
        const utterance = new SpeechSynthesisUtterance(segment.text)
        utterance.lang = 'es-DO'
        if (voice) utterance.voice = voice
        utterance.rate = 0.85 // un poco más lento, ritmo más natural
        utterance.pitch = gender === 'mujer' ? 1.05 : 0.85 // un poco más agudo o más grave según la voz
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
      if (unlocked) return
      unlocked = true
      markWelcomePlayed()
      window.speechSynthesis.cancel()
      speakSegments(splitIntoVoiceSegments(text))
    }

    const tryAutoStart = () => {
      if (window.speechSynthesis.getVoices().length > 0) start()
      else window.speechSynthesis.addEventListener('voiceschanged', start, { once: true })
    }
    tryAutoStart()

    const cleanup = () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      window.removeEventListener('touchend', start)
    }

    window.addEventListener('pointerdown', start)
    window.addEventListener('keydown', start)
    window.addEventListener('touchend', start)

    return () => {
      cancelled = true
      window.speechSynthesis.removeEventListener('voiceschanged', start)
      cleanup()
    }
  }, [text, gender])
}

/** Reproduce un archivo de audio de bienvenida real apenas se carga la
 * tienda (alternativa a la voz sintetizada de arriba — solo una de las
 * dos está activa a la vez, según lo que se elija en el panel admin).
 * Si el navegador bloquea el autoplay por no haber interacción previa,
 * el audio se dispara con el primer toque/clic/tecla en la página. */
function useWelcomeAudio(url: string) {
  useEffect(() => {
    if (!url) return
    if (typeof window === 'undefined') return
    if (welcomeAlreadyPlayedToday()) return

    const audio = new Audio(url)
    audio.preload = 'auto'
    let unlocked = false

    const cleanup = () => {
      window.removeEventListener('pointerdown', tryPlay)
      window.removeEventListener('keydown', tryPlay)
      window.removeEventListener('touchend', tryPlay)
    }

    // Reintenta en CADA interacción (no solo la primera) hasta que el
    // navegador realmente deje reproducir el audio. Antes, el listener se
    // quitaba tras el primer toque aunque play() fallara, así que un
    // segundo o tercer toque ya no volvía a intentarlo.
    const tryPlay = () => {
      if (unlocked) return
      audio.play().then(() => {
        unlocked = true
        markWelcomePlayed()
        cleanup()
      }).catch(() => {
        // el navegador lo bloqueó; se reintenta con la próxima interacción
      })
    }
    tryPlay()

    window.addEventListener('pointerdown', tryPlay)
    window.addEventListener('keydown', tryPlay)
    window.addEventListener('touchend', tryPlay)

    return () => {
      cleanup()
      audio.pause()
    }
  }, [url])
}

export function Storefront({ data }: Props) {
  const { products, content: copy } = data
  const whatsappDigits = copy.whatsapp.replace(/\D/g, '')

  const welcomeMode = copy.welcomeVoiceMode || 'desactivado'
  const welcomeAudioUrl = copy.welcomeVoiceGender === 'hombre' ? (copy.welcomeAudioUrlHombre || '') : (copy.welcomeAudioUrl || '')
  const welcomeVoiceGenderTexto = copy.welcomeVoiceGenderTexto === 'mujer' ? 'mujer' : 'hombre'
  useWelcomeVoice(welcomeMode === 'texto' ? (copy.welcomeVoiceText || '') : '', welcomeVoiceGenderTexto)
  useWelcomeAudio(welcomeMode === 'audio' ? welcomeAudioUrl : '')

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
  const [quickView, setQuickView] = useState<{ product: Product; option: string; index: number } | null>(null)
  const [toast, setToast] = useState<{ title: string; name: string; image: string } | null>(null)
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mientras está abierta la ficha del producto, el carrito o el menú, la
  // página de atrás no se desplaza (evita el "doble scroll" en el teléfono).
  useEffect(() => {
    const locked = Boolean(quickView || cartOpen || menuOpen || checkoutOpen)
    document.documentElement.classList.toggle('scroll-locked', locked)
    return () => document.documentElement.classList.remove('scroll-locked')
  }, [quickView, cartOpen, menuOpen, checkoutOpen])

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

  const showToast = (next: { title: string; name: string; image: string }) => {
    setToast(next)
    setToastVisible(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2600)
  }

  /** Agrega sin abrir el carrito: solo sube el contador y muestra un
   * aviso con la foto y un botón "Ver carrito". Cada opción (color,
   * modelo…) es su propia línea en el carrito, y el total de unidades de
   * un mismo producto nunca pasa del stock disponible. Devuelve false si
   * no se pudo agregar nada (ya estaba al máximo). */
  const addToCart = (product: Product, option: string | undefined, quantity: number): boolean => {
    const variant = option ? variantFor(product, option) : undefined
    const name = option ? `${product.name} — ${option}` : product.name
    const image = variant?.image || product.image
    const inCart = cart.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0)
    const addable = Math.min(quantity, Math.max(0, product.stock - inCart))
    if (addable <= 0) {
      showToast({ title: `Ya tienes todas las unidades disponibles (${product.stock})`, name, image })
      return false
    }
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id && line.name === name)
      if (existing) return current.map((line) => line === existing ? { ...line, quantity: line.quantity + addable } : line)
      return [...current, { productId: product.id, name, price: product.price, quantity: addable, image }]
    })
    showToast({ title: addable < quantity ? `Solo se agregaron ${addable} (stock disponible)` : `Agregado al carrito${addable > 1 ? ` · ${addable} uds.` : ''}`, name, image })
    return true
  }

  const lineKey = (line: CartLine) => `${line.productId}::${line.name}`

  // El carrito se guarda en el teléfono del cliente: si recarga la página
  // o vuelve más tarde, sus productos siguen ahí. Al cargarlo se corrige
  // contra el catálogo actual (precio al día, productos que ya no existen
  // se quitan, cantidades que pasan el stock se ajustan).
  const cartLoaded = useRef(false)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('jb-cart') || '[]') as CartLine[]
      if (Array.isArray(saved) && saved.length) {
        const used = new Map<number, number>()
        const fixed: CartLine[] = []
        for (const line of saved) {
          const product = products.find((item) => item.id === line.productId)
          if (!product || product.stock <= 0 || typeof line.name !== 'string') continue
          const room = product.stock - (used.get(product.id) ?? 0)
          const quantity = Math.min(Math.max(1, Math.round(Number(line.quantity) || 1)), room)
          if (quantity <= 0) continue
          used.set(product.id, (used.get(product.id) ?? 0) + quantity)
          fixed.push({ productId: product.id, name: line.name.startsWith(product.name) ? line.name : product.name, price: product.price, quantity, image: line.image || product.image })
        }
        setCart(fixed)
      }
    } catch { /* carrito guardado dañado o sin almacenamiento: se empieza vacío */ }
    cartLoaded.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!cartLoaded.current) return
    try { localStorage.setItem('jb-cart', JSON.stringify(cart)) } catch { /* sin almacenamiento */ }
  }, [cart])

  const changeQuantity = (key: string, delta: number) => setCart((current) => {
    const target = current.find((line) => lineKey(line) === key)
    if (!target) return current
    const product = products.find((item) => item.id === target.productId)
    const others = current.filter((line) => line.productId === target.productId && line !== target).reduce((sum, line) => sum + line.quantity, 0)
    const max = Math.max(0, (product?.stock ?? target.quantity) - others)
    const quantity = Math.min(target.quantity + delta, max)
    return quantity > 0 ? current.map((line) => (line === target ? { ...line, quantity } : line)) : current.filter((line) => line !== target)
  })

  const openCartFromSheet = () => {
    setToastVisible(false)
    setCartOpen(true)
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const phoneDigits = String(form.get('phone') || '').replace(/\D/g, '')
      if (phoneDigits.length < 10) throw new Error('Escribe un teléfono válido de 10 dígitos (ej. 809 555 1234).')
      const result = await createOrder({ data: { name: String(form.get('name')), phone: String(form.get('phone')), email: String(form.get('email')), address: String(form.get('address')), website: String(form.get('website') || ''), items: cart } })
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
        <button className="cart-button" onClick={() => setCartOpen(true)} aria-label="Ver carrito"><ShoppingCart size={19} />{cartCount > 0 && <b key={cartCount}>{cartCount}</b>}</button>
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
      {/* Arriba del todo: una sola fila de categorías que se desliza de
          lado (como en Temu). Tocar una filtra el catálogo y baja hasta él. */}
      <section className="cat-strip" id="inicio" aria-label="Categorías">
        <h1 className="visually-hidden">{copy.brandName} — {copy.heroTitle}</h1>
        <div className="cat-strip-track">
          {['Todos', ...realCategories].map((item) => {
            const Icon = item === 'Todos' ? LayoutGrid : categoryIcon(item)
            return (
              <button type="button" key={item} className={`cat-chip ${category === item ? 'active' : ''}`} onClick={() => { setCategory(item); document.getElementById('tienda')?.scrollIntoView({ behavior: 'smooth' }) }}>
                <span className="cat-chip-icon"><Icon size={22} /></span>
                <span className="cat-chip-label">{item}</span>
              </button>
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
          {offersProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} onOpen={(item, option, index) => setQuickView({ product: item, option, index })} />)}
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
            {visibleProducts.map((product) => <ProductCard key={product.id} product={product} onAdd={addToCart} onOpen={(item, option, index) => setQuickView({ product: item, option, index })} />)}
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
            <a href={socialUrl('instagram', copy.instagram)} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={17} /></a>
            <a href={socialUrl('facebook', copy.facebook)} target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook size={17} /></a>
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
      <button onClick={() => setCartOpen(true)}><ShoppingCart size={20} />{cartCount > 0 && <b key={cartCount}>{cartCount}</b>}<span>Carrito</span></button>
      <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer"><WhatsAppIcon size={20} /><span>WhatsApp</span></a>
    </nav>

    <div className={`toast ${toastVisible ? 'visible' : ''}`} role="status" aria-live="polite">
      {toast && <>
        <img src={toast.image} alt="" />
        <div className="toast-text"><strong>{toast.title}</strong><span>{toast.name}</span></div>
        <button type="button" onClick={openCartFromSheet}>Ver carrito</button>
      </>}
    </div>

    <div className={`overlay cart-overlay ${cartOpen ? 'visible' : ''}`} onClick={() => setCartOpen(false)} />
    <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`}>
      <div className="drawer-head"><div><span className="drawer-kicker">CARRITO · {cartCount} {cartCount === 1 ? 'ARTÍCULO' : 'ARTÍCULOS'}</span><h2>{copy.cartTitle}</h2></div><button className="icon-button" onClick={() => setCartOpen(false)}><X /></button></div>
      <div className="cart-lines">
        {cart.map((line) => <div className="cart-line" key={lineKey(line)}>
          <img src={line.image} alt="" />
          <div><h4>{line.name}</h4><p>{money(line.price)}</p><div className="quantity"><button onClick={() => changeQuantity(lineKey(line), -1)} aria-label="Menos"><Minus size={14} /></button><QtyInput className="cart-qty-input" value={line.quantity} max={(products.find((item) => item.id === line.productId)?.stock ?? line.quantity) - cart.filter((other) => other.productId === line.productId && other !== line).reduce((sum, other) => sum + other.quantity, 0)} onChange={(next) => changeQuantity(lineKey(line), next - line.quantity)} /><button onClick={() => changeQuantity(lineKey(line), 1)} aria-label="Más"><Plus size={14} /></button></div></div>
          <button className="remove" aria-label="Quitar" onClick={() => setCart((current) => current.filter((item) => lineKey(item) !== lineKey(line)))}><Trash2 size={16} /></button>
        </div>)}
        {!cart.length && <div className="empty-cart"><ShoppingCart /><h3>Tu carrito está vacío</h3><p>Explora el catálogo y agrega tus productos favoritos.</p></div>}
      </div>
      <div className="cart-summary">
        <div><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
        <p>La entrega se coordina después de confirmar el pedido.</p>
        <button className="primary-button full" disabled={!cart.length} onClick={() => { setCartOpen(false); setQuickView(null); setCheckoutOpen(true) }}>Continuar al checkout <ArrowRight size={16} /></button>
        <button className="ghost-button full cart-continue" onClick={() => setCartOpen(false)}>Seguir comprando</button>
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
            <input required name="name" autoComplete="name" maxLength={80} placeholder="Nombre completo" />
            <input required name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="Teléfono / WhatsApp (ej. 809 555 1234)" />
            {/* Campo trampa invisible: las personas no lo ven ni lo llenan; los
                robots que llenan todos los campos sí, y ese pedido se ignora. */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp-field" />
            <input name="email" type="email" placeholder="Correo electrónico (opcional)" />
            <textarea required name="address" autoComplete="street-address" maxLength={300} placeholder="Dirección de entrega (sector, calle, referencia)" rows={3} />
            {error && <p className="form-error">{error}</p>}
          </form>
        </div>
        <div className="order-review">
          <h3>Resumen</h3>
          {cart.map((line) => <div key={lineKey(line)}><span>{line.quantity} × {line.name}</span><strong>{money(line.quantity * line.price)}</strong></div>)}
          <div className="checkout-total"><span>Total</span><strong>{money(subtotal)}</strong></div>
          <button form="checkout-form" disabled={submitting} className="primary-button full">{submitting ? 'Enviando...' : 'Enviar pedido'}<ArrowRight size={16} /></button>
        </div>
      </div>}
    </div></div>}

    {quickView && <ProductSheet key={quickView.product.id} product={quickView.product} initialOption={quickView.option} initialIndex={quickView.index} copy={copy} cartCount={cartCount} onAdd={addToCart} onOpenCart={openCartFromSheet} onClose={() => setQuickView(null)} />}

    <div className="receipt-capture" ref={receiptRef}>
      {confirmation && <OrderReceipt orderNumber={confirmation.orderNumber} items={confirmation.items} total={confirmation.total} whatsapp={whatsappDigits} />}
    </div>
  </div>
}
