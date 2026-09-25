import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import { content, customers, expenses, imageTrash, orders, products, purchases, pushSubscriptions } from '../../db/schema'
import { createSession, clearSession, verifyPassword, verifySession } from './auth'
import { sendOrderNotificationEmail } from './email'
import { deleteImageFile, pathFromDownloadUrl } from './github'
import { lineName, normalizeVariants, optionPrice, optionStock, parseOptions, resolveOption, tracksOptionStock } from './variants'
import type { ProductVariant } from './variants'
import { generateVapidKeys, sendPush } from './push'
import type { PushMessage, VapidKeys } from './push'

// Días que un elemento permanece en papelera (productos, clientes, pedidos
// e imágenes) antes de eliminarse definitivamente.
const TRASH_DAYS = 30
const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000

export type CartLine = { productId: number; name: string; price: number; quantity: number; image: string; option?: string }
type OrderItem = { id: number; name: string; price: number; quantity: number; cost: number; option?: string }
type ProductRow = typeof products.$inferSelect

export const CATEGORIES = ['Teléfonos', 'Laptops', 'Accesorios', 'Cargadores y Cables', 'Covers y Protectores', 'Audífonos y Bocinas', 'Relojes Inteligentes', 'Gaming', 'Otros']

const defaultContent: Record<string, string> = {
  brandName: 'JB TECH STORE',
  brandTagline: 'Tecnología, accesorios y confianza en un solo lugar.',
  // Mensaje que se dice en voz alta (con la voz del propio navegador del
  // visitante) apenas entra a la tienda. Vacío = no se dice nada.
  welcomeVoiceText: 'Hola... te damos la bienvenida a... JB Tech Store... Esperamos que te guste nuestra variedad de productos.',
  // 'audio' = reproduce un archivo de audio real; 'texto' = usa la voz
  // sintetizada del navegador; 'desactivado' = no dice nada al entrar.
  // Solo uno de los dos (audio o texto) puede estar activo a la vez.
  welcomeVoiceMode: 'audio',
  // 'mujer' usa welcomeAudioUrl (la voz actual, sin tocar); 'hombre' usa
  // welcomeAudioUrlHombre. Solo aplica cuando welcomeVoiceMode = 'audio'.
  welcomeVoiceGender: 'mujer',
  welcomeAudioUrl: '/audio/bienvenida.mp3',
  welcomeAudioUrlHombre: '/audio/bienvenida-hombre.mp3',
  // Igual que welcomeVoiceGender pero para la voz SINTETIZADA del
  // navegador (welcomeVoiceMode = 'texto'). 'hombre' es como ya estaba
  // configurado (preferencia por voz de hombre); se puede cambiar a mujer.
  welcomeVoiceGenderTexto: 'hombre',
  navHome: 'Inicio',
  navShop: 'Tienda',
  navOffers: 'Ofertas',
  navContact: 'Contacto',
  eyebrow: 'Teléfonos · Laptops · Accesorios',
  heroTitle: 'Tecnología, accesorios y confianza en un solo lugar.',
  heroDescription: 'Teléfonos, laptops, cargadores, covers y accesorios originales con garantía y entrega en toda República Dominicana.',
  heroCta: 'Ver catálogo',
  heroBadge: 'Envíos a todo el país',
  catalogTitle: 'Nuestros productos',
  catalogDescription: 'Explora por categoría o busca el producto que necesitas.',
  offersTitle: 'Ofertas del mes',
  offersDescription: 'Precios especiales por tiempo limitado.',
  benefitsTitle: '¿Por qué comprar en JB Tech Store?',
  benefit1Title: 'Productos originales',
  benefit1Text: 'Equipos y accesorios verificados, con garantía.',
  benefit2Title: 'Pedidos por WhatsApp',
  benefit2Text: 'Coordina tu pago y entrega directo con nosotros.',
  benefit3Title: 'Entrega rápida',
  benefit3Text: 'Envíos a todo el país y entrega local en el día.',
  footerText: 'Tecnología, accesorios y confianza en un solo lugar.',
  whatsapp: '18095550123',
  location: 'Santo Domingo, República Dominicana',
  instagram: '@jb_tech.store',
  facebook: 'JB TECH STORE',
  schedule: 'Lunes a sábado · 9:00 AM - 6:00 PM',
  developerCredit: 'Diseño y desarrollo de la tienda',
  cartTitle: 'Tu carrito',
  checkoutTitle: 'Completa tu pedido',
  notificationEmail: '',
  // Configuración de Finanzas (se editan desde el tab Finanzas, no desde
  // Contenido). capitalInicial en centavos; reinvestPercent de 0 a 100.
  capitalInicial: '0',
  reinvestPercent: '70',
}

// Productos de ejemplo para que la tienda no se vea vacía en el primer
// despliegue. Las imágenes son marcadores de posición: reemplázalas por
// fotos reales de tus productos desde el panel admin (Catálogo → editar
// producto → subir imagen). Precios en centavos (RD$).
const seedProducts = [
  { name: 'Xiaomi Redmi A3', category: 'Teléfonos', description: 'Pantalla 6.71" HD+, 3GB RAM, 64GB, cámara trasera 8MP. Usado en excelentes condiciones, garantía de 7 días.', price: 550000, originalPrice: 650000, stock: 4, featured: true, isNew: true, bestSeller: false, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=Xiaomi+Redmi+A3' },
  { name: 'ZTE Blade A5 2020', category: 'Teléfonos', description: 'Pantalla 6.08" HD+, 2GB RAM, 32GB, Android 9 Pie. Usado en excelentes condiciones, garantía de 7 días.', price: 400000, originalPrice: 550000, stock: 6, featured: false, isNew: false, bestSeller: true, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=ZTE+Blade+A5' },
  { name: 'ZTE Blade 05 (sin tapa trasera)', category: 'Teléfonos', description: 'Equipo funcional, ideal como repuesto o segundo teléfono.', price: 120000, originalPrice: 0, stock: 1, featured: false, isNew: false, bestSeller: false, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=ZTE+Blade+05' },
  { name: 'HP Chromebook 11MK G9 EE', category: 'Laptops', description: 'MediaTek Kompanio 500, 4GB RAM LPDDR4X, 32GB eMMC, ChromeOS. Compacta, resistente y perfecta para estudiar o trabajar.', price: 500000, originalPrice: 0, stock: 3, featured: true, isNew: false, bestSeller: false, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=HP+Chromebook' },
  { name: 'Power Bank Magnético con Kickstand', category: 'Cargadores y Cables', description: 'Carga inalámbrica magnética 5000mAh, carga rápida y segura, kickstand integrado para mayor comodidad.', price: 135000, originalPrice: 150000, stock: 10, featured: false, isNew: false, bestSeller: true, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=Power+Bank' },
  { name: 'Reloj Inteligente Watch 7S', category: 'Relojes Inteligentes', description: 'Monitoreo de frecuencia cardíaca, presión arterial y oxígeno en sangre, contador de pasos, resistente a salpicaduras.', price: 99900, originalPrice: 130000, stock: 8, featured: false, isNew: true, bestSeller: false, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=Reloj+Inteligente' },
  { name: 'Combo AirPods Pro 3 + Cover', category: 'Audífonos y Bocinas', description: 'Sonido premium de alta calidad, protección total con cover resistente incluido.', price: 99000, originalPrice: 110000, stock: 5, featured: true, isNew: false, bestSeller: true, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=AirPods+Pro+3' },
  { name: 'Cover para AirPods Pro 3', category: 'Covers y Protectores', description: 'Protección contra golpes y rayones, ajuste perfecto, incluye gancho para mayor seguridad. Varios colores disponibles.', options: 'Negro, Blanco, Transparente', price: 20000, originalPrice: 25000, stock: 15, featured: false, isNew: false, bestSeller: false, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=Cover+AirPods' },
  { name: 'Protector de Pantalla para iPhone', category: 'Covers y Protectores', description: 'Vidrio templado de alta claridad, resistente a impactos y rayones.', price: 45000, originalPrice: 0, stock: 20, featured: false, isNew: false, bestSeller: false, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=Protector+Pantalla' },
  { name: 'Cover para iPhone', category: 'Covers y Protectores', description: 'Diseño resistente y elegante, protege tu iPhone con estilo.', options: 'Negro, Azul, Rojo, Transparente', price: 65000, originalPrice: 0, stock: 12, featured: false, isNew: true, bestSeller: false, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=Cover+iPhone' },
  { name: 'Control Inalámbrico para Gaming', category: 'Gaming', description: 'Compatible con múltiples plataformas, conexión Bluetooth estable, batería de larga duración.', price: 185000, originalPrice: 220000, stock: 7, featured: false, isNew: true, bestSeller: false, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=Control+Gaming' },
  { name: 'Cable Extensor USB-C 240W', category: 'Cargadores y Cables', description: 'Cable trenzado 3.3 pies, soporta carga rápida hasta 240W y transferencia USB 3.2.', price: 99500, originalPrice: 149500, stock: 18, featured: false, isNew: false, bestSeller: false, image: 'https://placehold.co/600x600/0f172a/93c5fd?text=Cable+USB-C' },
]

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0')
}

/** Folio con el mismo espíritu que usa Alexander Perfiles: prefijo + fecha
 * de emisión (DDMMAAAA) + un número corto, para que sea legible de un
 * vistazo y no se repita entre pedidos. */
function makeFolio(prefix: string) {
  const now = new Date()
  const fecha = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`
  const rand = pad(Math.floor(Math.random() * 10000), 4)
  return `${prefix}-${fecha}-${rand}`
}

// ───────────────────────────────────────────────────────────────────────
// ESQUEMA — las columnas nuevas (cantidad por opción y opción de cada
// lote) se crean solas la primera vez que arranca el Worker, así que no
// hace falta correr ninguna migración a mano en Neon. Si ya existen, solo
// se hace una consulta rápida de lectura (una vez por instancia).
// ───────────────────────────────────────────────────────────────────────
let schemaReady: Promise<void> | null = null
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const result = await db.execute(sql`select
        (select count(*) from information_schema.columns where table_schema = current_schema() and ((table_name = 'products' and column_name = 'option_stock') or (table_name = 'purchases' and column_name = 'option')))
        + (select count(*) from information_schema.tables where table_schema = current_schema() and table_name = 'push_subscriptions') as n`)
      const rows = ((result as unknown as { rows?: Array<{ n: number | string }> }).rows ?? (result as unknown as Array<{ n: number | string }>)) || []
      if (Number(rows[0]?.n ?? 0) >= 3) return
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "option_stock" boolean NOT NULL DEFAULT false`)
      await db.execute(sql`ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "option" text NOT NULL DEFAULT ''`)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "push_subscriptions" ("id" serial PRIMARY KEY, "endpoint" text NOT NULL UNIQUE, "p256dh" text NOT NULL, "auth" text NOT NULL, "label" text NOT NULL DEFAULT '', "created_at" timestamp NOT NULL DEFAULT now())`)
    })().catch((error) => {
      schemaReady = null // se reintenta en la próxima petición
      throw error
    })
  }
  return schemaReady
}

async function loadProduct(productId: number): Promise<ProductRow | undefined> {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1)
  return product
}

// ───────────────────────────────────────────────────────────────────────
// INVENTARIO Y LOTES (FIFO)
//
// Cada compra registrada es un "lote" con su propio costo. Al vender, se
// saca primero del lote más viejo que todavía tenga unidades (FIFO: el
// primero que entra es el primero que sale). Si el producto lleva cantidad
// por opción, una venta de "negro/amarillo" solo sale de los lotes de esa
// opción o de los lotes generales (sin opción, ej. compras de antes de
// separar por opción) — nunca del lote de otra opción.
// ───────────────────────────────────────────────────────────────────────

/** Lotes de los que puede salir (o a los que puede volver) una unidad de
 * esa opción. */
function lotsFor(product: ProductRow, option: string) {
  if (tracksOptionStock(product) && option) {
    return and(eq(purchases.productId, product.id), or(eq(purchases.option, option), eq(purchases.option, '')))
  }
  return eq(purchases.productId, product.id)
}

/** Costo a usar si se vende algo que no tiene lote registrado detrás (ej.
 * stock que ya existía antes de activar Finanzas): el último costo
 * conocido de esa opción o, si no hay, el costo actual del producto. */
async function fallbackCost(product: ProductRow, option: string): Promise<number> {
  if (tracksOptionStock(product) && option) {
    const [last] = await db.select({ unitCost: purchases.unitCost }).from(purchases)
      .where(and(eq(purchases.productId, product.id), eq(purchases.option, option)))
      .orderBy(desc(purchases.createdAt), desc(purchases.id)).limit(1)
    if (last) return last.unitCost
  }
  return product.cost
}

// Consume del lote más viejo primero (FIFO) para vender `quantity`
// unidades y devuelve el costo total (centavos) de esa cantidad. Si no hay
// suficiente cantidad registrada en lotes, usa fallbackCost para lo que
// falte, para no bloquear la venta.
async function consumeFifoCost(product: ProductRow, option: string, quantity: number): Promise<number> {
  let remaining = quantity
  let totalCost = 0
  const batches = await db.select().from(purchases)
    .where(and(lotsFor(product, option), gt(purchases.remainingQuantity, 0)))
    .orderBy(purchases.createdAt, purchases.id)
  for (const batch of batches) {
    if (remaining <= 0) break
    const take = Math.min(remaining, batch.remainingQuantity)
    totalCost += take * batch.unitCost
    remaining -= take
    await db.update(purchases).set({ remainingQuantity: batch.remainingQuantity - take }).where(eq(purchases.id, batch.id))
  }
  if (remaining > 0) totalCost += remaining * (await fallbackCost(product, option))
  // El "costo actual" mostrado del producto pasa a ser el del próximo lote
  // disponible (el siguiente que se va a consumir), no un promedio.
  await syncCurrentCost(product.id)
  return totalCost
}

/** Devuelve unidades a los lotes de los que salieron (pedido cancelado o
 * editado a menos unidades): primero al lote más reciente que ya se había
 * empezado a vender, luego a los anteriores — el reverso de consumeFifoCost. */
async function returnToFifo(product: ProductRow, option: string, quantity: number) {
  let remaining = quantity
  const batches = await db.select().from(purchases)
    .where(and(lotsFor(product, option), lt(purchases.remainingQuantity, purchases.quantity)))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
  for (const batch of batches) {
    if (remaining <= 0) break
    const put = Math.min(batch.quantity - batch.remainingQuantity, remaining)
    if (put <= 0) continue
    await db.update(purchases).set({ remainingQuantity: batch.remainingQuantity + put }).where(eq(purchases.id, batch.id))
    remaining -= put
  }
}

/** Suma (delta > 0) o resta (delta < 0) unidades al inventario. Si el
 * producto lleva cantidad por opción, cambia la de esa opción y el total
 * del producto se recalcula como la suma de todas. */
async function changeStock(productId: number, option: string, delta: number) {
  if (!delta) return
  const product = await loadProduct(productId)
  if (!product) return
  if (tracksOptionStock(product)) {
    // Una opción que ya no existe (se borró del producto) no tiene dónde
    // guardar unidades: se ignora.
    if (!option || !parseOptions(product.options).includes(option)) return
    const variants = normalizeVariants(product).map((entry) => (entry.option === option ? { ...entry, stock: Math.max(0, (entry.stock ?? 0) + delta) } : entry))
    const total = variants.reduce((sum, entry) => sum + (entry.stock ?? 0), 0)
    await db.update(products).set({ variantImages: variants, stock: total }).where(eq(products.id, productId))
    return
  }
  await db.update(products).set({ stock: sql`greatest(0, ${products.stock} + ${delta})` }).where(eq(products.id, productId))
}

/** Saca `quantity` unidades del inventario (FIFO) y devuelve su costo
 * total. Falla con un mensaje claro si no hay suficientes. */
async function takeStock(productId: number, option: string, quantity: number, label: string): Promise<number> {
  if (quantity <= 0) return 0
  const product = await loadProduct(productId)
  if (!product) throw new Error(`El producto ${label} ya no existe.`)
  if (tracksOptionStock(product) && !option) throw new Error(`Elige la opción (color/diseño) de ${product.name}.`)
  const available = optionStock(product, option)
  if (available < quantity) throw new Error(`No hay suficientes unidades de ${label} (quedan ${available}).`)
  const cost = await consumeFifoCost(product, option, quantity)
  await changeStock(productId, option, -quantity)
  return cost
}

/** Devuelve `quantity` unidades al inventario y a sus lotes. */
async function returnStock(productId: number, option: string, quantity: number) {
  if (quantity <= 0) return
  const product = await loadProduct(productId)
  if (!product) return // el producto se eliminó definitivamente: no hay a dónde devolver
  await returnToFifo(product, option, quantity)
  await changeStock(productId, option, quantity)
  await syncCurrentCost(productId)
}

/** El "costo actual" del producto es el del próximo lote que se va a
 * vender (FIFO). Si ya no quedan lotes con unidades, se deja como está. */
async function syncCurrentCost(productId: number) {
  const [nextBatch] = await db.select({ unitCost: purchases.unitCost }).from(purchases)
    .where(and(eq(purchases.productId, productId), gt(purchases.remainingQuantity, 0)))
    .orderBy(purchases.createdAt, purchases.id).limit(1)
  if (nextBatch) await db.update(products).set({ cost: nextBatch.unitCost }).where(eq(products.id, productId))
}

/** Revisa, ANTES de tocar nada, que alcance el inventario para todas las
 * líneas juntas. Suma por "cajón": el producto entero, o cada opción por
 * separado si el producto lleva cantidad por opción (dos líneas del mismo
 * producto sin cantidad por opción comparten el mismo cajón). */
function checkAvailability(lines: Array<{ productId: number; option: string; quantity: number }>, rows: ProductRow[]) {
  const totals = new Map<string, { product: ProductRow; option: string; quantity: number }>()
  for (const line of lines) {
    if (line.quantity <= 0) continue
    const product = rows.find((row) => row.id === line.productId)
    if (!product) throw new Error('Uno de los productos ya no existe.')
    const tracking = tracksOptionStock(product)
    if (tracking && !line.option) throw new Error(`Elige la opción (color/diseño) de ${product.name}.`)
    const key = tracking ? `${product.id}::${line.option}` : `${product.id}`
    const current = totals.get(key)
    totals.set(key, { product, option: tracking ? line.option : '', quantity: (current?.quantity ?? 0) + line.quantity })
  }
  for (const { product, option, quantity } of totals.values()) {
    const available = optionStock(product, option)
    if (available < quantity) throw new Error(`No hay suficientes unidades de ${lineName(product.name, option)} (quedan ${available}).`)
  }
}

/** Opción de una línea de pedido: la guardada o, en pedidos viejos, la que
 * viene en el nombre ("Producto — opción"). */
function itemOption(rows: ProductRow[], item: { id: number; name: string; option?: string }) {
  const product = rows.find((row) => row.id === item.id)
  return product ? resolveOption(product, item.option, item.name) : String(item.option || '')
}

// Mantenimiento (textos por defecto + limpieza de papelera): antes se
// hacía en CADA carga de la tienda y después de CADA acción del panel,
// lo que agregaba varias consultas lentas a Neon cada vez. Ahora se hace
// como máximo una vez cada 6 horas por instancia del Worker.
const MAINTENANCE_MS = 6 * 60 * 60 * 1000
let seededAt = 0
let cleanedAt = 0

async function ensureSeededThrottled() {
  if (Date.now() - seededAt < MAINTENANCE_MS) return
  await ensureSeeded()
  seededAt = Date.now()
}

async function cleanupThrottled() {
  if (Date.now() - cleanedAt < MAINTENANCE_MS) return
  cleanedAt = Date.now()
  await cleanupExpired()
}

const ORDER_STATUSES = ['Pendiente', 'Confirmado', 'Preparando', 'Enviado', 'Entregado', 'Cancelado']
const PAYMENT_STATUSES = ['Pendiente', 'Pagado']

async function ensureSeeded() {
  await db.insert(content).values(Object.entries(defaultContent).map(([key, value]) => ({ key, value }))).onConflictDoNothing()
  const existing = await db.select({ count: sql<number>`count(*)` }).from(products)
  if (Number(existing[0]?.count ?? 0) === 0) await db.insert(products).values(seedProducts)
}

async function requireAdmin() {
  const ok = await verifySession()
  if (!ok) throw new Error('Debes iniciar sesión para continuar.')
  await ensureSchema()
}

// Envía una imagen (por su download_url) a la papelera de imágenes. Si la
// URL no pertenece al repo configurado (ej. un placeholder de la semilla
// inicial, o una URL externa pegada a mano), no hace nada: solo
// administramos lo que nosotros mismos subimos a GitHub.
async function trashImage(url: string, reason: string) {
  if (!url) return
  const path = pathFromDownloadUrl(env, url)
  if (!path) return
  await db.insert(imageTrash).values({ path, url, reason })
}

// Job de limpieza: borra definitivamente lo que lleva más de 30 días en
// papelera (productos, clientes, pedidos) y, por separado, lo que lleva
// más de 30 días en la papelera de imágenes. Se ejecuta de forma
// perezosa cada vez que se abre el panel admin (mismo espíritu que
// `ensureSeeded`), así no depende de configurar un cron aparte. Cada paso
// está aislado con try/catch para que un fallo puntual (ej. GitHub caído)
// no tumbe el resto de la limpieza.
async function cleanupExpired() {
  const cutoff = new Date(Date.now() - TRASH_MS)

  try {
    const expiredProducts = await db.select().from(products).where(and(isNotNull(products.deletedAt), lt(products.deletedAt, cutoff)))
    for (const product of expiredProducts) {
      await db.delete(products).where(eq(products.id, product.id))
      if (product.image) await trashImage(product.image, 'Producto eliminado definitivamente tras 30 días en papelera')
      for (const variant of product.variantImages || []) {
        if (variant.image) await trashImage(variant.image, 'Producto eliminado definitivamente tras 30 días en papelera')
      }
    }
  } catch { /* se reintenta en el próximo acceso al panel */ }

  try { await db.delete(customers).where(and(isNotNull(customers.deletedAt), lt(customers.deletedAt, cutoff))) } catch { /* idem */ }
  try { await db.delete(orders).where(and(isNotNull(orders.deletedAt), lt(orders.deletedAt, cutoff))) } catch { /* idem */ }

  try {
    const expiredImages = await db.select().from(imageTrash).where(lt(imageTrash.deletedAt, cutoff))
    for (const image of expiredImages) {
      try { await deleteImageFile(env, image.path) } catch { /* si GitHub falla, se reintenta luego: la fila no se borra */ continue }
      await db.delete(imageTrash).where(eq(imageTrash.id, image.id))
    }
  } catch { /* idem */ }
}

async function findOrCreateCustomer(data: { name: string; email?: string; phone: string; address?: string }) {
  if (data.email) {
    const [existing] = await db.select().from(customers).where(eq(customers.email, data.email)).limit(1)
    if (existing) return existing
  }
  const [existingByPhone] = data.phone ? await db.select().from(customers).where(eq(customers.phone, data.phone)).limit(1) : []
  if (existingByPhone) return existingByPhone
  const [created] = await db.insert(customers).values({ name: data.name, email: data.email || '', phone: data.phone, address: data.address || '' }).returning()
  return created
}

// ───────────────────────────────────────────────────────────────────────
// SESIÓN
// ───────────────────────────────────────────────────────────────────────
export const login = createServerFn({ method: 'POST' })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const ok = await verifyPassword(String(data.password ?? ''))
    if (!ok) {
      // Pequeña espera en cada intento fallido: hace muy lento probar
      // contraseñas al azar (fuerza bruta) sin molestar al usarlo normal.
      await new Promise((resolve) => setTimeout(resolve, 1200))
      throw new Error('Contraseña incorrecta.')
    }
    await createSession()
    return true
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  clearSession()
  return true
})

export const checkSession = createServerFn({ method: 'GET' }).handler(async () => {
  return verifySession()
})

// ───────────────────────────────────────────────────────────────────────
// TIENDA PÚBLICA
// ───────────────────────────────────────────────────────────────────────
export const getStorefront = createServerFn({ method: 'GET' }).handler(async () => {
  await ensureSchema()
  await ensureSeededThrottled()
  const [productRows, contentRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.active, true), isNull(products.deletedAt))).orderBy(desc(products.featured), products.id),
    db.select().from(content),
  ])
  // El costo (lo que se pagó por cada producto) es solo para el panel: no
  // se manda a la tienda pública, donde cualquiera podría verlo en el
  // código de la página.
  const publicProducts = productRows.map(({ cost: _cost, ...product }) => product)
  const publicContent = Object.fromEntries(contentRows.filter((item) => !PRIVATE_CONTENT_KEYS.has(item.key)).map((item) => [item.key, item.value]))
  return { products: publicProducts, content: publicContent }
})

// Configuración privada guardada en la tabla `content` que la tienda no
// necesita (y que no debe verse en el código de la página).
const PRIVATE_CONTENT_KEYS = new Set(['capitalInicial', 'reinvestPercent', 'notificationEmail', 'vapidKeys'])

export const createOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; address: string; website?: string; items: CartLine[] }) => data)
  .handler(async ({ data }) => {
    // Campo trampa: si viene lleno, lo mandó un robot. Se responde como si
    // todo hubiera salido bien, pero no se guarda nada ni se toca el stock.
    if (data.website) return { orderNumber: makeFolio('PED'), total: 0, orderId: 0 }
    if ((data.phone || '').replace(/\D/g, '').length < 10) throw new Error('Escribe un teléfono válido de 10 dígitos.')
    data = { ...data, name: String(data.name || '').trim().slice(0, 80), phone: String(data.phone || '').trim().slice(0, 30), email: String(data.email || '').trim().slice(0, 120), address: String(data.address || '').trim().slice(0, 300) }
    if (!data.name?.trim() || !data.phone?.trim() || !Array.isArray(data.items) || !data.items.length) throw new Error('Completa todos los datos del pedido.')
    // Las cantidades vienen del navegador del cliente: se validan aquí para
    // que nadie pueda mandar cantidades negativas o con decimales (eso
    // sumaría stock falso y daría totales negativos).
    for (const item of data.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw new Error('Hay una cantidad inválida en el carrito.')
    }
    await ensureSchema()
    const productRows = await db.select().from(products).where(and(inArray(products.id, data.items.map((item) => item.productId)), isNull(products.deletedAt), eq(products.active, true)))
    // Cada línea se amarra a su producto y a su opción (color/diseño). El
    // precio y el nombre siempre salen de la base de datos, nunca del
    // navegador del cliente.
    const lines = data.items.map((item) => {
      const product = productRows.find((row) => row.id === item.productId)
      if (!product) throw new Error(`El producto ${String(item.name || '').slice(0, 80) || 'que elegiste'} ya no está disponible.`)
      const option = resolveOption(product, item.option, item.name)
      if (parseOptions(product.options).length > 0 && !option) throw new Error(`Elige una opción (color/diseño) de ${product.name} antes de enviar el pedido.`)
      return { product, productId: product.id, option, quantity: item.quantity }
    })
    // Un mismo producto puede venir en varias líneas (una por opción): se
    // revisa todo junto antes de sacar nada del inventario.
    checkAvailability(lines, productRows)

    // El driver HTTP de Neon no soporta transacciones interactivas, así que
    // estas operaciones (consumo FIFO + descuento de stock) se hacen en
    // secuencia en vez de dentro de una tx.
    const calculated: OrderItem[] = []
    for (const line of lines) {
      const name = lineName(line.product.name, line.option)
      const batchCost = await takeStock(line.productId, line.option, line.quantity, name)
      calculated.push({ id: line.productId, name, price: optionPrice(line.product, line.option), quantity: line.quantity, cost: Math.round(batchCost / line.quantity), option: line.option })
    }
    const total = calculated.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const customer = await findOrCreateCustomer(data)
    const orderNumber = makeFolio('PED')
    const createdAt = new Date()

    const [order] = await db.insert(orders).values({ orderNumber, customerId: customer.id, customerName: data.name, email: data.email, phone: data.phone, address: data.address, items: calculated, total, createdAt }).returning()

    const [notificationRow] = await db.select().from(content).where(eq(content.key, 'notificationEmail')).limit(1)
    if (notificationRow?.value) {
      await sendOrderNotificationEmail(env, notificationRow.value, { orderNumber, createdAt, customerName: data.name, email: data.email, phone: data.phone, address: data.address, total, items: calculated })
    }

    // Aviso al teléfono (app del panel admin). Si algo falla aquí, el
    // pedido ya quedó guardado igual: nunca se le muestra error al cliente.
    try {
      const units = calculated.reduce((sum, item) => sum + item.quantity, 0)
      const names = calculated.map((item) => `${item.quantity}× ${item.name}`).join(', ')
      await notifyAdmins({
        title: `🛒 Nuevo pedido · ${formatMoney(total)}`,
        body: `${data.name} pidió ${units} ${units === 1 ? 'artículo' : 'artículos'}: ${names}`.slice(0, 220),
        url: '/admin?tab=pedidos',
        tag: orderNumber,
      })
    } catch { /* sin aviso, pero el pedido está bien */ }

    return { orderNumber, total, orderId: order.id }
  })

// ───────────────────────────────────────────────────────────────────────
// ADMIN — lectura
// ───────────────────────────────────────────────────────────────────────
export const getAdminData = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  await ensureSeededThrottled()
  await cleanupThrottled()
  const [productRows, orderRows, customerRows, contentRows, purchaseRows, expenseRows, trashedProducts, trashedOrders, trashedCustomers, trashedImages] = await Promise.all([
    db.select().from(products).where(isNull(products.deletedAt)).orderBy(desc(products.createdAt)),
    db.select().from(orders).where(isNull(orders.deletedAt)).orderBy(desc(orders.createdAt)),
    db.select().from(customers).where(isNull(customers.deletedAt)).orderBy(desc(customers.createdAt)),
    db.select().from(content),
    db.select().from(purchases).orderBy(desc(purchases.createdAt)),
    db.select().from(expenses).orderBy(desc(expenses.createdAt)),
    db.select().from(products).where(isNotNull(products.deletedAt)).orderBy(desc(products.deletedAt)),
    db.select().from(orders).where(isNotNull(orders.deletedAt)).orderBy(desc(orders.deletedAt)),
    db.select().from(customers).where(isNotNull(customers.deletedAt)).orderBy(desc(customers.deletedAt)),
    db.select().from(imageTrash).orderBy(desc(imageTrash.deletedAt)),
  ])
  return {
    products: productRows,
    orders: orderRows,
    customers: customerRows,
    content: Object.fromEntries(contentRows.filter((item) => item.key !== 'vapidKeys').map((item) => [item.key, item.value])),
    purchases: purchaseRows,
    expenses: expenseRows,
    trash: { products: trashedProducts, orders: trashedOrders, customers: trashedCustomers, images: trashedImages },
  }
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — catálogo
// ───────────────────────────────────────────────────────────────────────
export const saveProduct = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; name: string; category: string; description: string; options: string; price: number; originalPrice: number; stock: number; image: string; variantImages: ProductVariant[]; optionStock?: boolean; renames?: Array<{ from: string; to: string }>; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = data.name.trim()
    if (!name) throw new Error('El nombre del producto es obligatorio.')
    const optionNames = parseOptions(data.options)
    const typedNames = String(data.options || '').split(',').map((item) => item.trim()).filter(Boolean)
    if (typedNames.length !== optionNames.length) throw new Error('Hay dos opciones con el mismo nombre. Cámbiale el nombre a una de ellas.')
    const isNew = !data.id
    const trackOptions = Boolean(data.optionStock) && optionNames.length > 0
    // Una entrada por cada opción vigente (foto, descripción, precio propio y
    // cantidad). Lo de opciones que ya se borraron no se guarda. Un producto
    // nuevo siempre empieza en 0: las unidades se suman con «Reponer», así
    // queda registrado lo que costaron.
    const variantImages: ProductVariant[] = optionNames.map((option) => {
      const entry = (data.variantImages || []).find((item) => item.option === option)
      return {
        option,
        image: String(entry?.image || ''),
        description: String(entry?.description || '').trim(),
        price: Math.max(0, Math.round(Number(entry?.price || 0))),
        stock: isNew ? 0 : Math.max(0, Math.round(Number(entry?.stock || 0))),
      }
    })
    const stock = isNew ? 0 : trackOptions ? variantImages.reduce((sum, entry) => sum + (entry.stock ?? 0), 0) : Math.max(0, Math.round(Number(data.stock) || 0))
    const values = { name, category: data.category || 'Otros', description: data.description.trim(), options: optionNames.join(', '), price: Math.max(0, Math.round(data.price)), originalPrice: Math.max(0, Math.round(data.originalPrice)), stock, image: data.image, variantImages, optionStock: trackOptions, featured: data.featured, isNew: data.isNew, bestSeller: data.bestSeller, active: data.active }
    if (data.id) {
      // Si se le cambió el nombre a una opción, sus lotes de compra la siguen.
      for (const rename of data.renames || []) {
        const from = String(rename.from || '').trim()
        const to = String(rename.to || '').trim()
        if (from && to && from !== to && optionNames.includes(to) && !optionNames.includes(from)) {
          await db.update(purchases).set({ option: to }).where(and(eq(purchases.productId, data.id), eq(purchases.option, from)))
        }
      }
      const [previous] = await db.select({ image: products.image, variantImages: products.variantImages }).from(products).where(eq(products.id, data.id)).limit(1)
      if (previous && previous.image && previous.image !== data.image) await trashImage(previous.image, 'Imagen reemplazada')
      const keptUrls = new Set(variantImages.map((entry) => entry.image).filter(Boolean))
      for (const old of previous?.variantImages || []) {
        if (old.image && !keptUrls.has(old.image)) await trashImage(old.image, 'Imagen de opción reemplazada')
      }
      await db.update(products).set(values).where(eq(products.id, data.id))
      return data.id
    }
    const [created] = await db.insert(products).values(values).returning({ id: products.id })
    return created.id
  })

export const deleteProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, data))
  return true
})

export const restoreProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(products).set({ deletedAt: null }).where(eq(products.id, data))
  return true
})

export const purgeProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  const [product] = await db.select({ image: products.image, variantImages: products.variantImages }).from(products).where(eq(products.id, data)).limit(1)
  await db.delete(products).where(eq(products.id, data))
  if (product?.image) await trashImage(product.image, 'Producto eliminado definitivamente desde la papelera')
  for (const variant of product?.variantImages || []) {
    if (variant.image) await trashImage(variant.image, 'Producto eliminado definitivamente desde la papelera')
  }
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — pedidos
// ───────────────────────────────────────────────────────────────────────
export const updateOrderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string; notes?: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!ORDER_STATUSES.includes(data.status) || !PAYMENT_STATUSES.includes(data.paymentStatus)) throw new Error('Estado inválido.')
    const [order] = await db.select().from(orders).where(eq(orders.id, data.id)).limit(1)
    if (!order) throw new Error('Ese pedido ya no existe.')
    const wasCancelled = order.status === 'Cancelado'
    const willBeCancelled = data.status === 'Cancelado'
    let items = order.items
    // Cancelar un pedido devuelve sus unidades al inventario (el cliente no
    // se lo llevó). Quitarle el "Cancelado" las vuelve a sacar — si todavía
    // hay stock suficiente; si no, avisa y no cambia nada.
    if (!wasCancelled && willBeCancelled) {
      const rows = await db.select().from(products).where(inArray(products.id, order.items.map((item) => item.id)))
      for (const item of order.items) await returnStock(item.id, itemOption(rows, item), item.quantity)
    } else if (wasCancelled && !willBeCancelled) {
      const rows = await db.select().from(products).where(inArray(products.id, order.items.map((item) => item.id)))
      if (order.items.some((item) => !rows.some((row) => row.id === item.id))) throw new Error('Uno de los productos de este pedido ya no existe; no se puede reactivar.')
      const lines = order.items.map((item) => ({ productId: item.id, option: itemOption(rows, item), quantity: item.quantity }))
      checkAvailability(lines, rows)
      const next: OrderItem[] = []
      for (const [index, item] of order.items.entries()) {
        const option = lines[index].option
        const cost = await takeStock(item.id, option, item.quantity, item.name)
        next.push({ ...item, option, cost: Math.round(cost / Math.max(1, item.quantity)) })
      }
      items = next
    }
    await db.update(orders).set({ status: data.status, paymentStatus: data.paymentStatus, items, ...(data.notes !== undefined ? { notes: data.notes } : {}) }).where(eq(orders.id, data.id))
    return true
  })

export const updateOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; customerName: string; email: string; phone: string; address: string; notes: string; items: OrderItem[]; discount?: number }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const customerName = data.customerName.trim()
    if (!customerName) throw new Error('El nombre del cliente es obligatorio.')
    if (!data.items.length) throw new Error('El pedido debe tener al menos un producto.')
    const [previous] = await db.select().from(orders).where(eq(orders.id, data.id)).limit(1)
    if (!previous) throw new Error('Ese pedido ya no existe.')
    const ids = [...new Set([...previous.items.map((item) => item.id), ...data.items.map((item) => Number(item.id))])]
    const rows = await db.select().from(products).where(inArray(products.id, ids))
    const items: OrderItem[] = data.items.map((item) => {
      const clean = { id: Number(item.id), name: String(item.name || '').trim().slice(0, 200) || 'Producto', price: Math.max(0, Math.round(Number(item.price) || 0)), quantity: Math.max(1, Math.round(Number(item.quantity) || 1)), cost: Math.max(0, Math.round(Number(item.cost) || 0)), option: String(item.option || '') }
      return { ...clean, option: itemOption(rows, clean) }
    })
    // Si cambió la cantidad de algún producto (o se quitó uno), el
    // inventario se ajusta solo: menos unidades = vuelven al stock (y a su
    // lote); más unidades = se sacan del stock. Se cuenta por producto Y por
    // opción. Un pedido cancelado no toca el stock.
    if (previous.status !== 'Cancelado') {
      const keyOf = (item: { id: number; option?: string }) => `${item.id}::${item.option || ''}`
      const before = new Map<string, number>()
      for (const item of previous.items) {
        const key = keyOf({ id: item.id, option: itemOption(rows, item) })
        before.set(key, (before.get(key) ?? 0) + item.quantity)
      }
      const after = new Map<string, number>()
      for (const item of items) after.set(keyOf(item), (after.get(keyOf(item)) ?? 0) + item.quantity)
      const changes = [...new Set([...before.keys(), ...after.keys()])].map((key) => {
        const [id, ...rest] = key.split('::')
        return { key, productId: Number(id), option: rest.join('::'), extra: (after.get(key) ?? 0) - (before.get(key) ?? 0) }
      })
      const increases = changes.filter((change) => change.extra > 0 && rows.some((row) => row.id === change.productId))
      checkAvailability(increases.map((change) => ({ productId: change.productId, option: change.option, quantity: change.extra })), rows)
      for (const change of changes) {
        if (change.extra < 0) await returnStock(change.productId, change.option, -change.extra)
      }
      for (const change of increases) {
        const target = items.find((item) => keyOf(item) === change.key)
        const extraCost = await takeStock(change.productId, change.option, change.extra, target?.name ?? 'un producto')
        // El costo de la línea se vuelve el promedio entre lo que ya tenía y
        // lo que costaron las unidades nuevas que se sacaron ahora.
        if (target) target.cost = Math.round((target.cost * Math.max(0, target.quantity - change.extra) + extraCost) / target.quantity)
      }
    }
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    // El descuento nunca puede ser negativo ni superar el subtotal, para
    // que el total del pedido jamás quede en números rojos.
    const discount = Math.min(subtotal, Math.max(0, Math.round(data.discount ?? 0)))
    const total = subtotal - discount
    await db.update(orders).set({ customerName, email: data.email.trim(), phone: data.phone.trim(), address: data.address.trim(), notes: data.notes.trim(), items, discount, total }).where(eq(orders.id, data.id))
    return true
  })

export const deleteOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(orders).set({ deletedAt: new Date() }).where(eq(orders.id, data))
  return true
})

export const restoreOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(orders).set({ deletedAt: null }).where(eq(orders.id, data))
  return true
})

export const purgeOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(orders).where(eq(orders.id, data))
  return true
})

// Venta hecha POR FUERA de la web (en persona, por WhatsApp, etc.). Se
// registra como un pedido normal —ya entregado y pagado— para que salga en
// Pedidos, descuente el stock (FIFO) y cuente solo en Finanzas. El precio
// por unidad lo pone quien registra la venta (puede ser más bajo que el de
// la tienda, ej. una venta al por mayor).
export const recordManualSale = createServerFn({ method: 'POST' })
  .inputValidator((data: { customerName: string; phone: string; notes: string; paymentStatus: string; items: Array<{ productId: number; option: string; quantity: number; price: number }> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!Array.isArray(data.items) || !data.items.length) throw new Error('Agrega al menos un producto.')
    const lines = data.items.map((item) => ({ productId: Number(item.productId), option: String(item.option || '').trim(), quantity: Math.round(Number(item.quantity)), price: Math.max(0, Math.round(Number(item.price))) }))
    for (const line of lines) {
      if (!line.productId) throw new Error('Elige el producto de cada línea.')
      if (!Number.isFinite(line.quantity) || line.quantity < 1) throw new Error('La cantidad debe ser 1 o más.')
      if (!Number.isFinite(line.price)) throw new Error('El precio no es válido.')
    }
    const rows = await db.select().from(products).where(inArray(products.id, [...new Set(lines.map((line) => line.productId))]))
    for (const line of lines) {
      const row = rows.find((item) => item.id === line.productId)
      if (!row) throw new Error('Uno de los productos ya no existe.')
      line.option = resolveOption(row, line.option)
      if (parseOptions(row.options).length > 0 && !line.option) throw new Error(`Elige la opción (color/diseño) de ${row.name}.`)
    }
    try {
      checkAvailability(lines, rows)
    } catch (caught) {
      throw new Error(`${caught instanceof Error ? caught.message : 'No hay suficientes unidades.'} Si tienes más, regístralas primero con «Reponer».`)
    }
    const items: OrderItem[] = []
    for (const line of lines) {
      const row = rows.find((item) => item.id === line.productId)!
      const name = lineName(row.name, line.option)
      const cost = await takeStock(row.id, line.option, line.quantity, name)
      items.push({ id: row.id, name, price: line.price, quantity: line.quantity, cost: Math.round(cost / line.quantity), option: line.option })
    }
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const customerName = String(data.customerName || '').trim().slice(0, 80) || 'Venta en tienda'
    const phone = String(data.phone || '').trim().slice(0, 30)
    const customer = phone ? await findOrCreateCustomer({ name: customerName, phone }) : null
    const orderNumber = makeFolio('VTA')
    await db.insert(orders).values({
      orderNumber, customerId: customer?.id ?? null, customerName, email: '', phone, address: '', items, total,
      status: 'Entregado', paymentStatus: PAYMENT_STATUSES.includes(data.paymentStatus) ? data.paymentStatus : 'Pagado',
      notes: ['Venta por fuera', String(data.notes || '').trim()].filter(Boolean).join(' · ').slice(0, 500),
    })
    return { orderNumber, total }
  })

// ───────────────────────────────────────────────────────────────────────
// ADMIN — contenido del sitio
// ───────────────────────────────────────────────────────────────────────
export const saveContent = createServerFn({ method: 'POST' }).inputValidator((data: Record<string, string>) => data).handler(async ({ data }) => {
  await requireAdmin()
  // Todo en UNA sola consulta (antes era una consulta por cada campo,
  // ~40 viajes a Neon uno tras otro: por eso "Guardar" tardaba tanto).
  const rows = Object.entries(data || {})
    .filter(([key]) => typeof key === 'string' && key.length > 0 && key.length <= 64)
    .map(([key, value]) => ({ key, value: String(value ?? '') }))
  if (rows.length) await db.insert(content).values(rows).onConflictDoUpdate({ target: content.key, set: { value: sql`excluded.value` } })
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — clientes
// ───────────────────────────────────────────────────────────────────────
export const saveCustomer = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; name: string; email: string; phone: string; address: string; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = data.name.trim()
    if (!name) throw new Error('El nombre es obligatorio.')
    const values = { name, email: data.email.trim(), phone: data.phone.trim(), address: data.address.trim(), notes: data.notes.trim() }
    if (data.id) {
      await db.update(customers).set(values).where(eq(customers.id, data.id))
      return data.id
    }
    const [created] = await db.insert(customers).values(values).returning({ id: customers.id })
    return created.id
  })

export const deleteCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, data))
  return true
})

export const restoreCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(customers).set({ deletedAt: null }).where(eq(customers.id, data))
  return true
})

export const purgeCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(customers).where(eq(customers.id, data))
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — Finanzas (compras y gastos)
// ───────────────────────────────────────────────────────────────────────

// Registra una compra/reposición de inventario: suma el stock del
// producto y crea un lote nuevo (las ventas consumen primero el lote más
// viejo — FIFO). Si se registró mal, se puede borrar (ver deletePurchase).
export const recordPurchase = createServerFn({ method: 'POST' })
  .inputValidator((data: { productId: number; notes: string; lines: Array<{ option: string; quantity: number; unitCost: number }> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const product = await loadProduct(Number(data.productId))
    if (!product) throw new Error('Ese producto ya no existe.')
    const tracking = tracksOptionStock(product)
    const options = parseOptions(product.options)
    // Cada línea con cantidad es un lote aparte (en un producto con cantidad
    // por opción, un lote por cada opción que se compró).
    const lines = (Array.isArray(data.lines) ? data.lines : [])
      .map((line) => ({ option: tracking ? String(line.option || '').trim() : '', quantity: Math.round(Number(line.quantity)), unitCost: Math.max(0, Math.round(Number(line.unitCost))) }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0)
    if (!lines.length) throw new Error('Pon cuántas unidades compraste (al menos 1).')
    for (const line of lines) {
      if (!Number.isFinite(line.unitCost)) throw new Error('El costo no es válido.')
      if (tracking && !options.includes(line.option)) throw new Error('Elige la opción de cada compra.')
    }
    const notes = String(data.notes || '').trim().slice(0, 300)

    if (tracking) {
      const added = new Map<string, number>()
      for (const line of lines) added.set(line.option, (added.get(line.option) ?? 0) + line.quantity)
      const variants = normalizeVariants(product).map((entry) => ({ ...entry, stock: (entry.stock ?? 0) + (added.get(entry.option) ?? 0) }))
      const total = variants.reduce((sum, entry) => sum + (entry.stock ?? 0), 0)
      await db.update(products).set({ variantImages: variants, stock: total, cost: product.stock <= 0 ? lines[0].unitCost : product.cost }).where(eq(products.id, product.id))
    } else {
      // FIFO: este lote nuevo solo se vuelve "el costo actual" si ya no
      // queda stock de lotes anteriores (o sea, si es el próximo que se va a
      // consumir). Si todavía hay stock viejo, el costo mostrado no cambia
      // hasta que ese stock se agote.
      const quantity = lines.reduce((sum, line) => sum + line.quantity, 0)
      const newCost = product.stock <= 0 ? lines[0].unitCost : product.cost
      await db.update(products).set({ stock: product.stock + quantity, cost: newCost }).where(eq(products.id, product.id))
    }
    await db.insert(purchases).values(lines.map((line) => ({
      productId: product.id, productName: product.name, option: line.option, quantity: line.quantity, unitCost: line.unitCost,
      totalCost: line.quantity * line.unitCost, remainingQuantity: line.quantity, notes,
    })))
    return { lots: lines.length, total: lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0) }
  })

// Elimina una compra registrada por error (ej. una de prueba). Solo
// resta del stock la parte de ese lote que TODAVÍA no se ha vendido
// (remainingQuantity) — lo que ya se vendió de ese lote se queda como
// está, porque esas ventas ya guardaron su propio costo y no se tocan.
// Esto es lo que hace bajar "Capital usado" en Finanzas cuando se borra.
export const deletePurchase = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  const [purchase] = await db.select().from(purchases).where(eq(purchases.id, data)).limit(1)
  if (!purchase) throw new Error('Esa compra ya no existe.')
  if (purchase.remainingQuantity <= 0) throw new Error('Ese lote ya se vendió completo: no queda nada que quitar.')
  const sold = purchase.quantity - purchase.remainingQuantity
  if (sold > 0) {
    // Ya se vendieron unidades de este lote: esas ventas guardaron este
    // costo, así que el lote no se puede borrar entero sin descuadrar las
    // Finanzas (el Capital disponible subiría de más). En vez de borrarlo,
    // se reduce a lo que ya se vendió y solo se quita lo que queda.
    await db.update(purchases).set({ quantity: sold, remainingQuantity: 0, totalCost: sold * purchase.unitCost, notes: `${purchase.notes ? `${purchase.notes} · ` : ''}ajustada: se quitaron ${purchase.remainingQuantity} sin vender` }).where(eq(purchases.id, data))
  } else {
    await db.delete(purchases).where(eq(purchases.id, data))
  }
  const product = await loadProduct(purchase.productId)
  let adjustByHand = false
  if (product) {
    if (tracksOptionStock(product) && !purchase.option) {
      // Lote general (de antes de separar por opción): no se sabe de cuál
      // opción eran esas unidades, así que las cantidades no se tocan; el
      // panel avisa para corregirlas a mano en «Editar».
      adjustByHand = true
    } else {
      await changeStock(product.id, purchase.option, -purchase.remainingQuantity)
    }
    await syncCurrentCost(purchase.productId)
  }
  return { adjustByHand }
})

// Reparte un lote "general" (sin opción, ej. una compra registrada antes de
// separar por opción) entre las opciones del producto: "de estos 8 a 26,
// 3 son negro/amarillo y 5 son azul MagSafe". No cambia cuántas unidades
// hay ni el dinero gastado: solo deja claro de qué opción es cada unidad
// para que, al vender, cada opción salga con SU costo. Los lotes nuevos
// conservan la fecha del original, así siguen en su mismo turno (FIFO).
export const splitPurchase = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; parts: Array<{ option: string; quantity: number }> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const [purchase] = await db.select().from(purchases).where(eq(purchases.id, Number(data.id))).limit(1)
    if (!purchase) throw new Error('Esa compra ya no existe.')
    if (purchase.option) throw new Error('Este lote ya pertenece a una opción.')
    if (purchase.remainingQuantity <= 0) throw new Error('De este lote ya no queda nada por repartir.')
    const product = await loadProduct(purchase.productId)
    if (!product) throw new Error('El producto de esta compra ya no existe.')
    const options = parseOptions(product.options)
    if (!options.length) throw new Error('Este producto no tiene opciones para repartir.')
    const byOption = new Map<string, number>()
    for (const part of Array.isArray(data.parts) ? data.parts : []) {
      const quantity = Math.round(Number(part.quantity))
      if (!Number.isFinite(quantity) || quantity <= 0) continue
      const option = String(part.option || '').trim()
      if (!options.includes(option)) throw new Error(`La opción «${option}» ya no existe en este producto.`)
      byOption.set(option, (byOption.get(option) ?? 0) + quantity)
    }
    const total = [...byOption.values()].reduce((sum, quantity) => sum + quantity, 0)
    if (total !== purchase.remainingQuantity) throw new Error(`Tienes que repartir exactamente ${purchase.remainingQuantity} (llevas ${total}).`)
    await db.insert(purchases).values([...byOption.entries()].map(([option, quantity]) => ({
      productId: purchase.productId, productName: purchase.productName, option, quantity, unitCost: purchase.unitCost,
      totalCost: quantity * purchase.unitCost, remainingQuantity: quantity, notes: purchase.notes, createdAt: purchase.createdAt,
    })))
    const sold = purchase.quantity - purchase.remainingQuantity
    if (sold > 0) {
      await db.update(purchases).set({ quantity: sold, remainingQuantity: 0, totalCost: sold * purchase.unitCost }).where(eq(purchases.id, purchase.id))
    } else {
      await db.delete(purchases).where(eq(purchases.id, purchase.id))
    }
    await syncCurrentCost(purchase.productId)
    return true
  })

// Registra un gasto del negocio o un gasto/retiro personal. `type`
// 'negocio' sale del Capital disponible (no toca la ganancia a repartir);
// 'personal' se resta de lo que ya le corresponde a Yeilin, sin tocar la
// ganancia del negocio.
export const recordExpense = createServerFn({ method: 'POST' })
  .inputValidator((data: { type: 'negocio' | 'personal'; description: string; amount: number }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const description = data.description.trim()
    const amount = Math.max(0, Math.round(data.amount))
    if (!description) throw new Error('Escribe una descripción del gasto.')
    if (amount <= 0) throw new Error('El monto debe ser mayor a 0.')
    await db.insert(expenses).values({ type: data.type === 'personal' ? 'personal' : 'negocio', description, amount })
    return true
  })

export const deleteExpense = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(expenses).where(eq(expenses.id, data))
  return true
})

// ───────────────────────────────────────────────────────────────────────
// NOTIFICACIONES AL TELÉFONO (app del panel admin) — ver src/lib/push.ts
// ───────────────────────────────────────────────────────────────────────
const PUSH_SUBJECT = 'https://jbtechstore.com'

function formatMoney(cents: number) {
  return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', maximumFractionDigits: 0 }).format(cents / 100)
}

/** Claves VAPID de la tienda: se crean solas la primera vez y se guardan
 * (juntas, en una sola fila) en la tabla de contenido. Nunca se mandan a
 * la tienda pública ni al panel. */
async function getVapidKeys(): Promise<VapidKeys> {
  const read = async () => {
    const [row] = await db.select().from(content).where(eq(content.key, 'vapidKeys')).limit(1)
    if (!row?.value) return null
    try { return JSON.parse(row.value) as VapidKeys } catch { return null }
  }
  const existing = await read()
  if (existing?.publicKey && existing.privateJwk) return existing
  const fresh = await generateVapidKeys()
  await db.insert(content).values({ key: 'vapidKeys', value: JSON.stringify(fresh) }).onConflictDoNothing()
  return (await read()) ?? fresh
}

async function sendToSubscriptions(rows: Array<{ id: number; endpoint: string; p256dh: string; auth: string }>, message: PushMessage) {
  if (!rows.length) return { sent: 0, failed: 0 }
  const keys = await getVapidKeys()
  const results = await Promise.all(rows.map((row) => sendPush(row, message, keys, PUSH_SUBJECT)))
  // Aparatos que ya no existen (app desinstalada o permiso quitado): fuera.
  const gone = rows.filter((_, index) => results[index] === 'gone').map((row) => row.id)
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone))
  return { sent: results.filter((result) => result === 'ok').length, failed: results.filter((result) => result !== 'ok').length }
}

async function notifyAdmins(message: PushMessage) {
  await ensureSchema()
  const rows = await db.select().from(pushSubscriptions)
  return sendToSubscriptions(rows, message)
}

/** Lo que la app necesita para activar las notificaciones en un aparato. */
export const getPushSetup = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  const keys = await getVapidKeys()
  const rows = await db.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, label: pushSubscriptions.label, createdAt: pushSubscriptions.createdAt }).from(pushSubscriptions).orderBy(desc(pushSubscriptions.createdAt))
  return { publicKey: keys.publicKey, devices: rows.map((row) => ({ id: row.id, endpoint: row.endpoint, label: row.label, createdAt: row.createdAt })) }
})

export const savePushSubscription = createServerFn({ method: 'POST' })
  .inputValidator((data: { endpoint: string; p256dh: string; auth: string; label: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const endpoint = String(data.endpoint || '')
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) throw new Error('La suscripción del navegador no es válida.')
    if (!data.p256dh || !data.auth) throw new Error('Faltan las claves de la suscripción.')
    const values = { endpoint, p256dh: String(data.p256dh).slice(0, 200), auth: String(data.auth).slice(0, 100), label: String(data.label || '').slice(0, 80) }
    await db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: values.p256dh, auth: values.auth, label: values.label } })
    return true
  })

export const removePushSubscription = createServerFn({ method: 'POST' }).inputValidator((endpoint: string) => endpoint).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, String(data || '')))
  return true
})

/** Manda un aviso de prueba (a este aparato o, sin endpoint, a todos). */
export const sendTestPush = createServerFn({ method: 'POST' }).inputValidator((endpoint: string) => endpoint).handler(async ({ data }) => {
  await requireAdmin()
  const rows = data
    ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, String(data)))
    : await db.select().from(pushSubscriptions)
  if (!rows.length) throw new Error('Este aparato todavía no tiene las notificaciones activadas.')
  const result = await sendToSubscriptions(rows, { title: '🔔 Notificaciones activadas', body: 'Así te va a llegar cada pedido nuevo de la tienda.', url: '/admin?tab=pedidos', tag: 'prueba' })
  if (!result.sent) throw new Error('No se pudo entregar la prueba. Desactiva y vuelve a activar las notificaciones en este aparato.')
  return result
})
