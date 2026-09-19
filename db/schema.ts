import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core'

// ───────────────────────────────────────────────────────────────────────
// PRODUCTOS — catálogo de teléfonos, laptops y accesorios de JB Tech Store.
// `price` es el precio de venta actual; `originalPrice` es el precio
// anterior cuando el producto está en oferta (0 = sin descuento, no se
// muestra ningún precio tachado ni badge de "-XX%"). Las banderas
// featured/isNew/bestSeller alimentan las 3 pestañas de la portada
// (Destacados / Nuevos / Más vendidos), igual de espíritu que las
// pestañas "NUEVOS / DESTACADOS / MÁS VENDIDOS" de portatilshop.
// ───────────────────────────────────────────────────────────────────────
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull().default('Otros'),
  description: text('description').notNull().default(''),
  price: integer('price').notNull().default(0), // centavos
  originalPrice: integer('original_price').notNull().default(0), // centavos, 0 = sin descuento
  stock: integer('stock').notNull().default(0),
  image: text('image').notNull().default(''),
  featured: boolean('featured').notNull().default(false), // pestaña Destacados
  isNew: boolean('is_new').notNull().default(false), // pestaña Nuevos
  bestSeller: boolean('best_seller').notNull().default(false), // pestaña Más vendidos
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  // Papelera: NULL = visible normalmente. Con fecha = enviado a la
  // papelera; se restaura poniendo esto en NULL de nuevo, o se elimina
  // definitivamente (junto a su imagen) 30 días después de esta fecha.
  deletedAt: timestamp('deleted_at'),
})

// ───────────────────────────────────────────────────────────────────────
// CLIENTES
// ───────────────────────────────────────────────────────────────────────
export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'), // papelera, igual que products
})

// ───────────────────────────────────────────────────────────────────────
// PEDIDOS — el checkout de la tienda crea un pedido interno (no procesa
// pagos con tarjeta); el pago y la entrega se coordinan después por
// WhatsApp, igual que en Ela Esencia y que el botón de WhatsApp de
// portatilshop. El folio se genera al crearse.
// ───────────────────────────────────────────────────────────────────────
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  customerId: integer('customer_id'),
  customerName: text('customer_name').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  address: text('address').notNull().default(''),
  items: jsonb('items').notNull().$type<Array<{ id: number; name: string; price: number; quantity: number }>>(),
  total: integer('total').notNull(),
  status: text('status').notNull().default('Pendiente'), // Pendiente, Confirmado, Preparando, Enviado, Entregado, Cancelado
  paymentStatus: text('payment_status').notNull().default('Pendiente'), // Pendiente, Pagado
  notes: text('notes').notNull().default(''), // notas internas del admin
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'), // papelera
})

// ───────────────────────────────────────────────────────────────────────
// PAPELERA DE IMÁGENES — cuando se reemplaza o se elimina definitivamente
// la imagen de un producto, la imagen anterior (que vive en el repo de
// GitHub, no en la base de datos) no se borra de inmediato: se registra
// aquí con la ruta que tenía en el repo. 30 días después de `deletedAt`,
// un job de limpieza la borra de GitHub de verdad y quita esta fila.
// ───────────────────────────────────────────────────────────────────────
export const imageTrash = pgTable('image_trash', {
  id: serial('id').primaryKey(),
  path: text('path').notNull(), // ruta dentro del repo, ej. public/uploads/123-telefono.jpg
  url: text('url').notNull(), // download_url original (raw.githubusercontent.com/...)
  reason: text('reason').notNull().default(''), // ej. 'imagen reemplazada', 'producto eliminado'
  deletedAt: timestamp('deleted_at').notNull().defaultNow(),
})

// ───────────────────────────────────────────────────────────────────────
// CONTENIDO DEL SITIO (editor de textos e imágenes desde el admin: marca,
// WhatsApp, dirección, horario, redes sociales, textos del hero, etc.)
// ───────────────────────────────────────────────────────────────────────
export const content = pgTable('content', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
})
