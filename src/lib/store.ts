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
  const [nextBatch] = await db.select({ unitCost: purchases.unitCost }).from(purchases).where(and(eq(purchases.productId, productId), gt(purchases.remainingQuantity, 0))).orderBy(purchases.createdAt, purchases.id).limit(1)
  if (nextBatch) await db.update(products).set({ cost: nextBatch.unitCost }).where(eq(products.id, productId))
  return totalCost
}

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
    const ok = await verifyPassword(data.password)
    if (!ok) throw new Error('Contraseña incorrecta.')
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
  await ensureSeeded()
  const [productRows, contentRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.active, true), isNull(products.deletedAt))).orderBy(desc(products.featured), products.id),
    db.select().from(content),
  ])
  return { products: productRows, content: Object.fromEntries(contentRows.map((item) => [item.key, item.value])) }
})

export const createOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; address: string; items: CartLine[] }) => data)
  .handler(async ({ data }) => {
    if (!data.name || !data.phone || !data.items.length) throw new Error('Completa todos los datos del pedido.')
    const productRows = await db.select().from(products).where(and(inArray(products.id, data.items.map((item) => item.productId)), isNull(products.deletedAt)))
    for (const item of data.items) {
      const product = productRows.find((row) => row.id === item.productId)
      if (!product) throw new Error(`El producto ${item.name} ya no está disponible.`)
      if (product.stock < item.quantity) throw new Error(`Stock insuficiente para ${item.name}.`)
    }

    // El driver HTTP de Neon no soporta transacciones interactivas, así que
    // estas operaciones (consumo FIFO + descuento de stock) se hacen en
    // secuencia en vez de dentro de una tx.
    const calculated: Array<{ id: number; name: string; price: number; quantity: number; cost: number }> = []
    for (const item of data.items) {
      const product = productRows.find((row) => row.id === item.productId)!
      const batchCost = await consumeFifoCost(product.id, item.quantity)
      calculated.push({ id: product.id, name: item.name, price: product.price, quantity: item.quantity, cost: Math.round(batchCost / item.quantity) })
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
  await ensureSeeded()
  await cleanupExpired()
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
  .inputValidator((data: { id?: number; name: string; category: string; description: string; options: string; price: number; originalPrice: number; stock: number; image: string; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = data.name.trim()
    if (!name) throw new Error('El nombre del producto es obligatorio.')
    const values = { name, category: data.category || 'Otros', description: data.description.trim(), options: (data.options || '').trim(), price: Math.max(0, Math.round(data.price)), originalPrice: Math.max(0, Math.round(data.originalPrice)), stock: Math.max(0, Math.round(data.stock)), image: data.image, featured: data.featured, isNew: data.isNew, bestSeller: data.bestSeller, active: data.active }
    if (data.id) {
      const [previous] = await db.select({ image: products.image }).from(products).where(eq(products.id, data.id)).limit(1)
      if (previous && previous.image && previous.image !== data.image) await trashImage(previous.image, 'Imagen reemplazada')
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
  const [product] = await db.select({ image: products.image }).from(products).where(eq(products.id, data)).limit(1)
  await db.delete(products).where(eq(products.id, data))
  if (product?.image) await trashImage(product.image, 'Producto eliminado definitivamente desde la papelera')
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — pedidos
// ───────────────────────────────────────────────────────────────────────
export const updateOrderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string; notes?: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    await db.update(orders).set({ status: data.status, paymentStatus: data.paymentStatus, ...(data.notes !== undefined ? { notes: data.notes } : {}) }).where(eq(orders.id, data.id))
    return true
  })

export const updateOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; customerName: string; email: string; phone: string; address: string; notes: string; items: { id: number; name: string; price: number; quantity: number; cost: number }[]; discount?: number }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const customerName = data.customerName.trim()
    if (!customerName) throw new Error('El nombre del cliente es obligatorio.')
    if (!data.items.length) throw new Error('El pedido debe tener al menos un producto.')
    const items = data.items.map((item) => ({ ...item, price: Math.max(0, Math.round(item.price)), quantity: Math.max(1, Math.round(item.quantity)) }))
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

// ───────────────────────────────────────────────────────────────────────
// ADMIN — contenido del sitio
// ───────────────────────────────────────────────────────────────────────
export const saveContent = createServerFn({ method: 'POST' }).inputValidator((data: Record<string, string>) => data).handler(async ({ data }) => {
  await requireAdmin()
  for (const [key, value] of Object.entries(data)) await db.insert(content).values({ key, value }).onConflictDoUpdate({ target: content.key, set: { value } })
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
// producto y recalcula su costo promedio ponderado. Es un libro de solo
// lectura una vez creado — no hay editar/borrar, así el historial de
// costos nunca queda inconsistente (si hay un error, se registra otra
// compra que lo ajuste).
export const recordPurchase = createServerFn({ method: 'POST' })
  .inputValidator((data: { productId: number; quantity: number; unitCost: number; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const quantity = Math.round(data.quantity)
    const unitCost = Math.max(0, Math.round(data.unitCost))
    if (quantity <= 0) throw new Error('La cantidad debe ser mayor a 0.')
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
  await db.delete(purchases).where(eq(purchases.id, data))
  const [product] = await db.select().from(products).where(eq(products.id, purchase.productId)).limit(1)
  if (product) {
    const newStock = Math.max(0, product.stock - purchase.remainingQuantity)
    const [nextBatch] = await db.select({ unitCost: purchases.unitCost }).from(purchases)
      .where(and(eq(purchases.productId, purchase.productId), gt(purchases.remainingQuantity, 0)))
      .orderBy(purchases.createdAt, purchases.id).limit(1)
    await db.update(products).set({ stock: newStock, cost: nextBatch ? nextBatch.unitCost : product.cost }).where(eq(products.id, purchase.productId))
  }
  return true
})

// Registra un gasto del negocio o un gasto/retiro personal. `type`
// 'negocio' se resta de la ganancia antes de calcular la reinversión;
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
