import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../../db'
import { content, customers, expenses, imageTrash, orders, products, purchases } from '../../db/schema'
import { createSession, clearSession, verifyPassword, verifySession } from './auth'
import { sendOrderNotificationEmail } from './email'
import { deleteImageFile, pathFromDownloadUrl } from './github'

// Días que un elemento permanece en papelera (productos, clientes, pedidos
// e imágenes) antes de eliminarse definitivamente.
const TRASH_DAYS = 30
const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000

export type CartLine = { productId: number; name: string; price: number; quantity: number; image: string }

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

/** Nuevo costo promedio ponderado (centavos) al sumar `addQty` unidades
 * compradas a `addUnitCost` c/u, a un producto con `prevStock` unidades
 * que ya costaban `prevCost` c/u. Si no había stock previo (producto
 * nuevo o agotado), el promedio es simplemente el costo de esta compra. */
// Consume del lote más viejo primero (FIFO) para vender `quantity`
// unidades de un producto, y devuelve el costo total (centavos) de esa
// cantidad. Si no hay suficiente cantidad registrada en `purchases` (ej.
// stock que ya existía antes de activar Finanzas y nunca se registró como
// compra), usa el costo actual del producto para lo que falte, para no
// bloquear la venta.
async function consumeFifoCost(productId: number, quantity: number): Promise<number> {
  let remaining = quantity
  let totalCost = 0
  const batches = await db.select().from(purchases).where(and(eq(purchases.productId, productId), gt(purchases.remainingQuantity, 0))).orderBy(purchases.createdAt, purchases.id)
  for (const batch of batches) {
    if (remaining <= 0) break
    const take = Math.min(remaining, batch.remainingQuantity)
    totalCost += take * batch.unitCost
    remaining -= take
    await db.update(purchases).set({ remainingQuantity: batch.remainingQuantity - take }).where(eq(purchases.id, batch.id))
  }
  if (remaining > 0) {
    const [product] = await db.select({ cost: products.cost }).from(products).where(eq(products.id, productId)).limit(1)
    totalCost += remaining * (product?.cost ?? 0)
  }
  // El "costo actual" mostrado del producto pasa a ser el del próximo lote
  // disponible (el siguiente que se va a consumir), no un promedio.
  await syncCurrentCost(productId)
  return totalCost
}

/** Devuelve `quantity` unidades al inventario (pedido cancelado o
 * editado a menos unidades). Las unidades vuelven a los lotes de compra de
 * los que salieron: primero al lote más reciente que ya se había empezado
 * a vender, luego a los anteriores — el reverso exacto de consumeFifoCost. */
async function returnToFifo(productId: number, quantity: number) {
  if (quantity <= 0) return
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1)
  if (!product) return // el producto se eliminó definitivamente: no hay a dónde devolver
  let remaining = quantity
  const batches = await db.select().from(purchases)
    .where(and(eq(purchases.productId, productId), lt(purchases.remainingQuantity, purchases.quantity)))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
  for (const batch of batches) {
    if (remaining <= 0) break
    const put = Math.min(batch.quantity - batch.remainingQuantity, remaining)
    if (put <= 0) continue
    await db.update(purchases).set({ remainingQuantity: batch.remainingQuantity + put }).where(eq(purchases.id, batch.id))
    remaining -= put
  }
  await db.update(products).set({ stock: sql`${products.stock} + ${quantity}` }).where(eq(products.id, productId))
  await syncCurrentCost(productId)
}

/** Saca `quantity` unidades del inventario (FIFO) y devuelve su costo
 * total. Falla con un mensaje claro si no hay suficiente stock. */
async function takeStock(productId: number, quantity: number, label: string): Promise<number> {
  if (quantity <= 0) return 0
  const [product] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId)).limit(1)
  if (!product) throw new Error(`El producto ${label} ya no existe.`)
  if (product.stock < quantity) throw new Error(`Stock insuficiente para ${label} (quedan ${product.stock}).`)
  const cost = await consumeFifoCost(productId, quantity)
  await db.update(products).set({ stock: sql`${products.stock} - ${quantity}` }).where(eq(products.id, productId))
  return cost
}

/** El "costo actual" del producto es el del próximo lote que se va a
 * vender (FIFO). Si ya no quedan lotes con unidades, se deja como está. */
async function syncCurrentCost(productId: number) {
  const [nextBatch] = await db.select({ unitCost: purchases.unitCost }).from(purchases)
    .where(and(eq(purchases.productId, productId), gt(purchases.remainingQuantity, 0)))
    .orderBy(purchases.createdAt, purchases.id).limit(1)
  if (nextBatch) await db.update(products).set({ cost: nextBatch.unitCost }).where(eq(products.id, productId))
}

/** Suma las unidades por producto (un mismo producto puede venir en
 * varias líneas, una por color/opción). */
function unitsByProduct(items: Array<{ id: number; quantity: number }>) {
  const map = new Map<number, number>()
  for (const item of items) map.set(item.id, (map.get(item.id) ?? 0) + item.quantity)
  return map
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
  await ensureSeededThrottled()
  const [productRows, contentRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.active, true), isNull(products.deletedAt))).orderBy(desc(products.featured), products.id),
    db.select().from(content),
  ])
  return { products: productRows, content: Object.fromEntries(contentRows.map((item) => [item.key, item.value])) }
})

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
    const productRows = await db.select().from(products).where(and(inArray(products.id, data.items.map((item) => item.productId)), isNull(products.deletedAt), eq(products.active, true)))
    // Un mismo producto puede venir en varias líneas (una por color), así
    // que el stock se revisa contra el TOTAL de unidades de ese producto.
    const requested = unitsByProduct(data.items.map((item) => ({ id: item.productId, quantity: item.quantity })))
    for (const [productId, quantity] of requested) {
      const product = productRows.find((row) => row.id === productId)
      const label = data.items.find((item) => item.productId === productId)?.name || 'un producto'
      if (!product) throw new Error(`El producto ${label} ya no está disponible.`)
      if (product.stock < quantity) throw new Error(`Stock insuficiente para ${product.name} (quedan ${product.stock}).`)
    }

    // El driver HTTP de Neon no soporta transacciones interactivas, así que
    // estas operaciones (consumo FIFO + descuento de stock) se hacen en
    // secuencia en vez de dentro de una tx.
    const calculated: Array<{ id: number; name: string; price: number; quantity: number; cost: number }> = []
    for (const item of data.items) {
      const product = productRows.find((row) => row.id === item.productId)!
      const batchCost = await consumeFifoCost(product.id, item.quantity)
      // El nombre solo se acepta si es el del producto (+ la opción elegida);
      // el precio siempre sale de la base de datos, nunca del navegador.
      const name = typeof item.name === 'string' && item.name.startsWith(product.name) ? item.name.slice(0, 200) : product.name
      calculated.push({ id: product.id, name, price: product.price, quantity: item.quantity, cost: Math.round(batchCost / item.quantity) })
    }
    const total = calculated.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const customer = await findOrCreateCustomer(data)
    const orderNumber = makeFolio('PED')
    const createdAt = new Date()

    const [order] = await db.insert(orders).values({ orderNumber, customerId: customer.id, customerName: data.name, email: data.email, phone: data.phone, address: data.address, items: calculated, total, createdAt }).returning()
    for (const item of calculated) await db.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` }).where(and(eq(products.id, item.id), sql`${products.stock} >= ${item.quantity}`))

    const [notificationRow] = await db.select().from(content).where(eq(content.key, 'notificationEmail')).limit(1)
    if (notificationRow?.value) {
      await sendOrderNotificationEmail(env, notificationRow.value, { orderNumber, createdAt, customerName: data.name, email: data.email, phone: data.phone, address: data.address, total, items: calculated })
    }

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
    content: Object.fromEntries(contentRows.map((item) => [item.key, item.value])),
    purchases: purchaseRows,
    expenses: expenseRows,
    trash: { products: trashedProducts, orders: trashedOrders, customers: trashedCustomers, images: trashedImages },
  }
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — catálogo
// ───────────────────────────────────────────────────────────────────────
export const saveProduct = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; name: string; category: string; description: string; options: string; price: number; originalPrice: number; stock: number; image: string; variantImages: Array<{ option: string; image: string; description: string }>; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = data.name.trim()
    if (!name) throw new Error('El nombre del producto es obligatorio.')
    // Solo se guardan entradas que de verdad coincidan con una opción
    // vigente y que tengan al menos imagen o descripción — así, si luego
    // se borra o se renombra una opción en el campo de arriba, su
    // imagen/descripción huérfana no se queda guardada sin poder editarse.
    const validOptions = new Set((data.options || '').split(',').map((item) => item.trim()).filter(Boolean))
    const variantImages = (data.variantImages || []).filter((entry) => validOptions.has(entry.option) && (entry.image || entry.description))
    const values = { name, category: data.category || 'Otros', description: data.description.trim(), options: (data.options || '').trim(), price: Math.max(0, Math.round(data.price)), originalPrice: Math.max(0, Math.round(data.originalPrice)), stock: Math.max(0, Math.round(data.stock)), image: data.image, variantImages, featured: data.featured, isNew: data.isNew, bestSeller: data.bestSeller, active: data.active }
    if (data.id) {
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
      for (const [productId, quantity] of unitsByProduct(order.items)) await returnToFifo(productId, quantity)
    } else if (wasCancelled && !willBeCancelled) {
      const needed = unitsByProduct(order.items)
      const rows = await db.select({ id: products.id, name: products.name, stock: products.stock }).from(products).where(inArray(products.id, [...needed.keys()]))
      for (const [productId, quantity] of needed) {
        const row = rows.find((item) => item.id === productId)
        if (!row) throw new Error('Uno de los productos de este pedido ya no existe; no se puede reactivar.')
        if (row.stock < quantity) throw new Error(`No hay stock suficiente de ${row.name} para reactivar el pedido (quedan ${row.stock}).`)
      }
      const costs = new Map<number, number>()
      for (const [productId, quantity] of needed) costs.set(productId, (await takeStock(productId, quantity, rows.find((row) => row.id === productId)?.name ?? 'un producto')) / quantity)
      items = order.items.map((item) => ({ ...item, cost: Math.round(costs.get(item.id) ?? item.cost) }))
    }
    await db.update(orders).set({ status: data.status, paymentStatus: data.paymentStatus, items, ...(data.notes !== undefined ? { notes: data.notes } : {}) }).where(eq(orders.id, data.id))
    return true
  })

export const updateOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; customerName: string; email: string; phone: string; address: string; notes: string; items: { id: number; name: string; price: number; quantity: number; cost: number }[]; discount?: number }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const customerName = data.customerName.trim()
    if (!customerName) throw new Error('El nombre del cliente es obligatorio.')
    if (!data.items.length) throw new Error('El pedido debe tener al menos un producto.')
    const items = data.items.map((item) => ({ ...item, name: String(item.name || '').trim().slice(0, 200) || 'Producto', price: Math.max(0, Math.round(item.price)), quantity: Math.max(1, Math.round(item.quantity)) }))
    const [previous] = await db.select().from(orders).where(eq(orders.id, data.id)).limit(1)
    if (!previous) throw new Error('Ese pedido ya no existe.')
    // Si cambió la cantidad de algún producto (o se quitó uno), el
    // inventario se ajusta solo: menos unidades = vuelven al stock; más
    // unidades = se sacan del stock. Un pedido cancelado no toca el stock.
    if (previous.status !== 'Cancelado') {
      const before = unitsByProduct(previous.items)
      const after = unitsByProduct(items)
      const ids = new Set([...before.keys(), ...after.keys()])
      const rows = await db.select({ id: products.id, name: products.name, stock: products.stock }).from(products).where(inArray(products.id, [...ids]))
      for (const id of ids) {
        const extra = (after.get(id) ?? 0) - (before.get(id) ?? 0)
        const row = rows.find((item) => item.id === id)
        if (extra > 0 && row && row.stock < extra) throw new Error(`No hay stock suficiente de ${row.name} para subir la cantidad (quedan ${row.stock}).`)
      }
      for (const id of ids) {
        const extra = (after.get(id) ?? 0) - (before.get(id) ?? 0)
        if (extra < 0) await returnToFifo(id, -extra)
        else if (extra > 0 && rows.some((item) => item.id === id)) await takeStock(id, extra, rows.find((item) => item.id === id)?.name ?? 'un producto')
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
    const needed = unitsByProduct(lines.map((line) => ({ id: line.productId, quantity: line.quantity })))
    const rows = await db.select().from(products).where(inArray(products.id, [...needed.keys()]))
    for (const [productId, quantity] of needed) {
      const row = rows.find((item) => item.id === productId)
      if (!row) throw new Error('Uno de los productos ya no existe.')
      if (row.stock < quantity) throw new Error(`No hay stock suficiente de ${row.name} (quedan ${row.stock}). Si tienes más unidades, regístralas primero con «Registrar compra».`)
    }
    const items: Array<{ id: number; name: string; price: number; quantity: number; cost: number }> = []
    for (const line of lines) {
      const row = rows.find((item) => item.id === line.productId)!
      const cost = await takeStock(row.id, line.quantity, row.name)
      items.push({ id: row.id, name: line.option ? `${row.name} — ${line.option}` : row.name, price: line.price, quantity: line.quantity, cost: Math.round(cost / line.quantity) })
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
  .inputValidator((data: { productId: number; quantity: number; unitCost: number; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const quantity = Math.round(Number(data.quantity))
    const unitCost = Math.max(0, Math.round(Number(data.unitCost)))
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('La cantidad debe ser mayor a 0.')
    if (!Number.isFinite(unitCost)) throw new Error('El costo no es válido.')
    const [product] = await db.select().from(products).where(eq(products.id, data.productId)).limit(1)
    if (!product) throw new Error('Ese producto ya no existe.')

    // FIFO: este lote nuevo solo se vuelve "el costo actual" si ya no
    // queda stock de lotes anteriores (o sea, si es el próximo que se va a
    // consumir). Si todavía hay stock viejo, el costo mostrado no cambia
    // hasta que ese stock se agote — así se refleja el ahorro de comprar
    // más barato solo cuando de verdad empiece a venderse ese lote.
    const newCost = product.stock <= 0 ? unitCost : product.cost
    await db.update(products).set({ stock: product.stock + quantity, cost: newCost }).where(eq(products.id, product.id))
    await db.insert(purchases).values({ productId: product.id, productName: product.name, quantity, unitCost, totalCost: quantity * unitCost, remainingQuantity: quantity, notes: data.notes.trim() })
    return true
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
  const [product] = await db.select().from(products).where(eq(products.id, purchase.productId)).limit(1)
  if (product) {
    await db.update(products).set({ stock: Math.max(0, product.stock - purchase.remainingQuantity) }).where(eq(products.id, purchase.productId))
    await syncCurrentCost(purchase.productId)
  }
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
