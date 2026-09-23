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
  // Opciones seleccionables (color/diseño), separadas por coma, ej. "Negro, Azul, Transparente".
  // Vacío = el producto no muestra selector. No lleva stock ni precio propio por opción.
  options: text('options').notNull().default(''),
  price: integer('price').notNull().default(0), // centavos
  originalPrice: integer('original_price').notNull().default(0), // centavos, 0 = sin descuento
  stock: integer('stock').notNull().default(0),
  // Costo promedio ponderado por unidad, en centavos. Se recalcula solo
  // cada vez que se registra una compra (ver tabla `purchases`): no se
  // edita a mano desde el formulario del producto.
  cost: integer('cost').notNull().default(0),
  image: text('image').notNull().default(''),
  // Imagen y descripción específicas por opción (color/diseño/modelo,
  // ej. "Batman" o "iPhone 14 Pro Max"). Cada entrada debe coincidir
  // EXACTO con uno de los valores separados por coma en `options`. Si una
  // opción no tiene entrada aquí, la tienda usa la imagen y la
  // descripción generales del producto (arriba) como hasta ahora — no
  // reemplaza `options`, solo lo enriquece opción por opción.
  variantImages: jsonb('variant_images').notNull().default([]).$type<Array<{ option: string; image: string; description: string }>>(),
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
  // `cost` es el costo promedio del producto en el momento de la venta
  // (copia, no referencia) — así la Ganancia de un pedido ya hecho no
  // cambia si más adelante compras ese mismo producto a otro costo.
  items: jsonb('items').notNull().$type<Array<{ id: number; name: string; price: number; quantity: number; cost: number }>>(),
  // Descuento manual aplicado por el admin al negociar con el cliente
  // (en centavos). 0 = sin descuento. `total` ya sale con el descuento
  // restado — se recalcula en el servidor cada vez que se edita el pedido.
  discount: integer('discount').notNull().default(0),
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
// También guarda aquí 2 valores de configuración de Finanzas
// (`capitalInicial`, `reinvestPercent`) reutilizando esta misma tabla
// clave-valor en vez de crear una tabla de un solo renglón.
// ───────────────────────────────────────────────────────────────────────
export const content = pgTable('content', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
})

// ───────────────────────────────────────────────────────────────────────
// COMPRAS — cada reposición de inventario. Reemplaza la hoja "Inventario"
// del Excel: en vez de una fila nueva a mano, cada compra aquí (a) suma
// `quantity` al stock del producto y (b) recalcula `products.cost` como
// costo promedio ponderado. Es un libro de solo lectura una vez creado
// (no se edita ni se borra) para que el historial de costos nunca quede
// inconsistente — si hay un error, se corrige con otra compra o, si es
// necesario, a mano en la base de datos.
// ───────────────────────────────────────────────────────────────────────
export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').notNull(),
  productName: text('product_name').notNull(), // copia del nombre, por si el producto se borra después
  quantity: integer('quantity').notNull(),
  unitCost: integer('unit_cost').notNull(), // centavos
  totalCost: integer('total_cost').notNull(), // centavos = quantity * unitCost
  // Cuánto queda de este lote sin vender todavía. Empieza en `quantity` y
  // baja con cada venta (consumo FIFO: se gasta el lote más viejo
  // primero). Cuando llega a 0, la próxima venta pasa al siguiente lote.
  remainingQuantity: integer('remaining_quantity').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// ───────────────────────────────────────────────────────────────────────
// GASTOS — reemplaza la hoja "Gastos". `type` separa gasto del negocio
// (se resta de la ganancia antes de calcular la reinversión) de gasto o
// retiro personal (se resta de lo que ya le toca a Yeilin, no afecta la
// ganancia del negocio). Esto reemplaza la mezcla confusa de "Gastos" y
// "gastos personales" que tenía el Excel.
// ───────────────────────────────────────────────────────────────────────
export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  type: text('type').notNull().default('negocio'), // 'negocio' | 'personal'
  description: text('description').notNull(),
  amount: integer('amount').notNull(), // centavos
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
