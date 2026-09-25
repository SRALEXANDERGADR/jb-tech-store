// ───────────────────────────────────────────────────────────────────────
// OPCIONES DE UN PRODUCTO (colores, diseños, modelos…)
//
// Una misma tarjeta puede tener varias opciones (ej. "Cover iPhone 12"
// con 10 diseños). Cada opción puede tener, además de su foto y su
// descripción:
//   • su PROPIO PRECIO (si se deja en 0, usa el precio general de la tarjeta)
//   • su PROPIA CANTIDAD en existencia — solo cuando el producto tiene
//     activado `optionStock` ("Cada opción tiene su propia cantidad").
//     En ese caso `products.stock` es siempre la suma de todas las opciones.
//
// Este archivo no toca la base de datos: lo usan igual la tienda, el panel
// admin y el servidor, para que todos calculen precios y existencias de la
// misma forma.
// ───────────────────────────────────────────────────────────────────────

export type ProductVariant = {
  option: string
  image: string
  description: string
  /** Precio propio en centavos. 0 o vacío = usa el precio general. */
  price?: number
  /** Unidades de esta opción (solo cuenta si el producto tiene optionStock). */
  stock?: number
}

type ProductLike = {
  name: string
  options: string
  price: number
  stock: number
  optionStock?: boolean | null
  variantImages?: ProductVariant[] | null
}

/** Separador entre el nombre del producto y la opción en el carrito y en
 * los pedidos: "Cover iPhone 12 — negro/amarillo". */
export const OPTION_SEPARATOR = ' — '

/** Lista de opciones sin espacios de más, sin vacías y sin repetidas. */
export function parseOptions(options: string | null | undefined): string[] {
  const seen = new Set<string>()
  const list: string[] = []
  for (const raw of String(options || '').split(',')) {
    const item = raw.trim()
    if (!item || seen.has(item)) continue
    seen.add(item)
    list.push(item)
  }
  return list
}

export function variantFor(product: ProductLike, option: string | null | undefined): ProductVariant | undefined {
  if (!option) return undefined
  return (product.variantImages || []).find((entry) => entry.option === option)
}

/** ¿Este producto lleva la cantidad separada por cada opción? */
export function tracksOptionStock(product: ProductLike): boolean {
  return Boolean(product.optionStock) && parseOptions(product.options).length > 0
}

/** Precio (centavos) de una opción: el suyo propio o, si no tiene, el general. */
export function optionPrice(product: ProductLike, option: string | null | undefined): number {
  const own = Math.round(Number(variantFor(product, option)?.price || 0))
  return own > 0 ? own : product.price
}

export function hasOwnPrice(product: ProductLike, option: string | null | undefined): boolean {
  const own = Math.round(Number(variantFor(product, option)?.price || 0))
  return own > 0 && own !== product.price
}

/** Unidades disponibles para vender de esa opción (o del producto entero
 * si no lleva cantidad por opción). */
export function optionStock(product: ProductLike, option: string | null | undefined): number {
  if (tracksOptionStock(product) && option) return Math.max(0, Math.round(Number(variantFor(product, option)?.stock || 0)))
  return Math.max(0, product.stock)
}

/** Opciones que se pueden comprar ahora mismo (con cantidad, si aplica). */
export function availableOptions(product: ProductLike): string[] {
  const options = parseOptions(product.options)
  if (!tracksOptionStock(product)) return product.stock > 0 ? options : []
  return options.filter((option) => optionStock(product, option) > 0)
}

/** Precio más bajo y más alto entre las opciones que se pueden comprar
 * (para mostrar "Desde RD$…" en la tarjeta cuando no todas valen igual). */
export function priceRange(product: ProductLike): { min: number; max: number } {
  const options = parseOptions(product.options)
  if (!options.length) return { min: product.price, max: product.price }
  const available = availableOptions(product)
  const pool = available.length ? available : options
  const prices = pool.map((option) => optionPrice(product, option))
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

/** Saca la opción del nombre de una línea del carrito o de un pedido
 * ("Cover iPhone 12 — negro/amarillo" → "negro/amarillo"). Sirve para
 * pedidos viejos que se guardaron antes de que existiera el campo `option`. */
export function optionFromName(name: string | null | undefined): string {
  const value = String(name || '')
  const at = value.lastIndexOf(OPTION_SEPARATOR)
  return at === -1 ? '' : value.slice(at + OPTION_SEPARATOR.length).trim()
}

/** Decide qué opción es una línea: primero el campo `option`, si no, la
 * que viene en el nombre. Devuelve '' si el producto no tiene esa opción. */
export function resolveOption(product: ProductLike, option: string | null | undefined, name?: string | null): string {
  const options = parseOptions(product.options)
  if (!options.length) return ''
  const direct = String(option || '').trim()
  if (direct && options.includes(direct)) return direct
  const fromName = optionFromName(name)
  if (fromName && options.includes(fromName)) return fromName
  return ''
}

/** Una entrada por cada opción vigente, en el mismo orden, conservando lo
 * que ya tenía guardado (foto, descripción, precio, cantidad). */
export function normalizeVariants(product: ProductLike): ProductVariant[] {
  return parseOptions(product.options).map((option) => {
    const entry = variantFor(product, option)
    return {
      option,
      image: entry?.image || '',
      description: entry?.description || '',
      price: Math.max(0, Math.round(Number(entry?.price || 0))),
      stock: Math.max(0, Math.round(Number(entry?.stock || 0))),
    }
  })
}

export function lineName(productName: string, option: string | null | undefined): string {
  return option ? `${productName}${OPTION_SEPARATOR}${option}` : productName
}
