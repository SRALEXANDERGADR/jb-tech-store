// Factura en IMAGEN (PNG) para mandarla por WhatsApp, con los colores de la
// tienda y el logo. Se dibuja en el navegador con <canvas> (sin librerías).
// El PDF sigue existiendo aparte (botón «Descargar factura»).

export type InvoiceData = {
  orderNumber: string
  createdAt: string
  customerName: string
  phone: string
  address: string
  items: Array<{ name: string; price: number; quantity: number; warranty?: string }>
  discount: number
  total: number
  paymentStatus: string
  warrantyTerms: string
  whatsapp: string
}

const C = {
  bg: '#0b1220',
  card: '#0f1b33',
  card2: '#16233f',
  line: 'rgba(255,255,255,0.09)',
  ink: '#eaf0fb',
  dim: '#a9b6cc',
  faint: '#77839c',
  blue: '#93c5fd',
  blue2: '#60a5fa',
  green: '#22c55e',
  orange: '#ff8a1f',
  orange2: '#f25c05',
  white: '#ffffff',
}
const FONT = "'Inter', 'Segoe UI', system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif"
const W = 1080
const M = 56 // margen

const money = (cents: number) => `${cents < 0 ? '-' : ''}RD$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`
const longDate = (date: Date) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', day: 'numeric', month: 'long', year: 'numeric' }).format(date)
const dateTime = (value: string) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))

/** «30 días», «3 meses», «1 año», «2 semanas» → fecha en que vence. */
export function warrantyUntil(text: string | undefined, from: string): Date | null {
  const match = /(\d+)\s*(d[ií]as?|semanas?|mes(?:es)?|años?|anos?)/i.exec(String(text || ''))
  if (!match) return null
  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  const date = new Date(from)
  if (unit.startsWith('d')) date.setDate(date.getDate() + amount)
  else if (unit.startsWith('s')) date.setDate(date.getDate() + amount * 7)
  else if (unit.startsWith('m')) date.setMonth(date.getMonth() + amount)
  else date.setFullYear(date.getFullYear() + amount)
  return date
}

/** Texto de la garantía para la factura: «30 días · hasta el 5 de noviembre de 2026». */
export function warrantyLabel(text: string | undefined, from: string) {
  const until = warrantyUntil(text, from)
  return until ? `${text} · hasta el ${longDate(until)}` : String(text || '')
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/** Parte un texto en líneas que caben en `width`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines = 99): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= width || !current) current = next
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    let last = kept[maxLines - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
    kept[maxLines - 1] = `${last}…`
    return kept
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Dibuja la factura y la devuelve como PNG. */
export async function invoiceImage(data: InvoiceData): Promise<Blob> {
  const logo = await loadImage('/logo.png')
  // Primero se mide todo con un canvas de prueba para saber la altura.
  const probe = document.createElement('canvas').getContext('2d')!
  const inner = W - M * 2
  const nameWidth = inner - 280
  probe.font = `700 30px ${FONT}`
  const rows = data.items.map((item) => {
    const lines = wrap(probe, item.name, nameWidth, 3)
    probe.font = `600 23px ${FONT}`
    const warranty = item.warranty ? wrap(probe, `Garantía: ${warrantyLabel(item.warranty, data.createdAt)}`, nameWidth) : []
    probe.font = `700 30px ${FONT}`
    return { item, lines, warranty, height: 30 + lines.length * 38 + 34 + warranty.length * 31 + 26 }
  })
  probe.font = `600 25px ${FONT}`
  const address = data.address ? wrap(probe, data.address, inner - 210 - 40, 3) : []
  const customer = wrap(probe, data.customerName, inner - 210 - 40, 2)
  const hasWarranty = data.items.some((item) => item.warranty)
  probe.font = `500 22px ${FONT}`
  const terms = hasWarranty && data.warrantyTerms.trim() ? wrap(probe, data.warrantyTerms.trim(), inner - 56, 8) : []
  const subtotal = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const headerH = 230
  const infoH = 64 + 4 * 46 + Math.max(0, address.length - 1) * 34 + Math.max(0, customer.length - 1) * 34 + 30
  const itemsH = 70 + rows.reduce((sum, row) => sum + row.height, 0)
  const totalsH = (data.discount > 0 ? 2 * 46 : 0) + 130
  const termsH = terms.length ? 106 + terms.length * 32 : 0
  const footerH = 170
  const H = headerH + 40 + infoH + 30 + itemsH + totalsH + termsH + footerH

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'

  // Fondo.
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)

  // Encabezado con degradado, logo y número de factura.
  const grad = ctx.createLinearGradient(0, 0, W, headerH)
  grad.addColorStop(0, '#16233f')
  grad.addColorStop(1, '#0f1b33')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, W, headerH)
  ctx.fillStyle = C.blue2
  ctx.fillRect(0, headerH - 6, W, 6)
  if (logo) {
    ctx.save()
    ctx.beginPath(); ctx.arc(M + 62, 112, 62, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
    ctx.drawImage(logo, M, 50, 124, 124)
    ctx.restore()
    ctx.strokeStyle = 'rgba(147,197,253,0.5)'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(M + 62, 112, 63, 0, Math.PI * 2); ctx.stroke()
  }
  const brandX = M + (logo ? 150 : 0)
  ctx.font = `800 44px ${FONT}`
  ctx.fillStyle = C.blue
  ctx.fillText('JB', brandX, 112)
  const jbWidth = ctx.measureText('JB ').width
  ctx.fillStyle = C.white
  ctx.fillText('TECH STORE', brandX + jbWidth, 112)
  ctx.font = `500 24px ${FONT}`
  ctx.fillStyle = C.dim
  ctx.fillText('jbtechstore.com', brandX, 150)
  ctx.textAlign = 'right'
  ctx.font = `800 22px ${FONT}`
  ctx.fillStyle = C.blue
  ctx.fillText('FACTURA', W - M, 92)
  ctx.font = `800 30px ${FONT}`
  ctx.fillStyle = C.white
  ctx.fillText(data.orderNumber, W - M, 134)
  ctx.textAlign = 'left'

  // Datos del pedido y del cliente.
  let y = headerH + 40
  roundRect(ctx, M, y, inner, infoH, 24)
  ctx.fillStyle = C.card
  ctx.fill()
  let rowY = y + 64
  const info: Array<[string, string[]]> = [
    ['Fecha', [dateTime(data.createdAt)]],
    ['Cliente', customer],
    ['Teléfono', [data.phone || '—']],
    ['Dirección', address.length ? address : ['—']],
  ]
  for (const [label, values] of info) {
    ctx.font = `600 24px ${FONT}`
    ctx.fillStyle = C.faint
    ctx.fillText(label, M + 32, rowY)
    ctx.font = `600 25px ${FONT}`
    ctx.fillStyle = C.ink
    values.forEach((value, index) => ctx.fillText(value, M + 210, rowY + index * 34))
    rowY += 46 + (values.length - 1) * 34
  }
  // Estado del pago.
  const paid = data.paymentStatus === 'Pagado'
  const pill = paid ? 'PAGADO' : 'PAGO PENDIENTE'
  ctx.font = `800 20px ${FONT}`
  const pillW = ctx.measureText(pill).width + 36
  roundRect(ctx, W - M - 32 - pillW, y + 34, pillW, 42, 21)
  ctx.fillStyle = paid ? 'rgba(34,197,94,0.16)' : 'rgba(255,138,31,0.16)'
  ctx.fill()
  ctx.fillStyle = paid ? C.green : C.orange
  ctx.textAlign = 'center'
  ctx.fillText(pill, W - M - 32 - pillW / 2, y + 62)
  ctx.textAlign = 'left'
  y += infoH + 30

  // Productos.
  ctx.font = `800 22px ${FONT}`
  ctx.fillStyle = C.blue
  ctx.fillText('PRODUCTOS', M, y + 30)
  y += 70
  for (const row of rows) {
    roundRect(ctx, M, y, inner, row.height - 14, 20)
    ctx.fillStyle = C.card
    ctx.fill()
    let lineY = y + 30 + 30
    ctx.font = `700 30px ${FONT}`
    ctx.fillStyle = C.ink
    for (const line of row.lines) { ctx.fillText(line, M + 28, lineY); lineY += 38 }
    ctx.font = `500 24px ${FONT}`
    ctx.fillStyle = C.dim
    ctx.fillText(`${row.item.quantity} × ${money(row.item.price)}`, M + 28, lineY - 2)
    lineY += 34
    ctx.font = `600 23px ${FONT}`
    ctx.fillStyle = C.blue
    for (const line of row.warranty) { ctx.fillText(line, M + 28, lineY - 6); lineY += 31 }
    ctx.textAlign = 'right'
    ctx.font = `800 30px ${FONT}`
    ctx.fillStyle = C.white
    ctx.fillText(money(row.item.price * row.item.quantity), W - M - 28, y + 60)
    ctx.textAlign = 'left'
    y += row.height
  }

  // Totales.
  y += 10
  const totalLine = (label: string, value: string, color = C.dim) => {
    ctx.font = `600 26px ${FONT}`
    ctx.fillStyle = color
    ctx.fillText(label, M + 8, y + 30)
    ctx.textAlign = 'right'
    ctx.fillText(value, W - M - 8, y + 30)
    ctx.textAlign = 'left'
    y += 46
  }
  if (data.discount > 0) {
    totalLine('Subtotal', money(subtotal))
    totalLine('Descuento', `-${money(data.discount)}`, C.green)
  }
  const totalGrad = ctx.createLinearGradient(M, 0, W - M, 0)
  totalGrad.addColorStop(0, C.orange)
  totalGrad.addColorStop(1, C.orange2)
  roundRect(ctx, M, y + 6, inner, 96, 24)
  ctx.fillStyle = totalGrad
  ctx.fill()
  ctx.font = `800 30px ${FONT}`
  ctx.fillStyle = C.white
  ctx.fillText('TOTAL', M + 32, y + 66)
  ctx.textAlign = 'right'
  ctx.font = `800 44px ${FONT}`
  ctx.fillText(money(data.total), W - M - 32, y + 70)
  ctx.textAlign = 'left'
  y += 130

  // Condiciones de la garantía (si algún producto tiene garantía).
  if (terms.length) {
    const boxH = termsH - 30
    roundRect(ctx, M, y, inner, boxH, 20)
    ctx.fillStyle = 'rgba(96,165,250,0.08)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(147,197,253,0.35)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.font = `800 22px ${FONT}`
    ctx.fillStyle = C.blue
    ctx.fillText('GARANTÍA', M + 28, y + 44)
    ctx.font = `500 22px ${FONT}`
    ctx.fillStyle = C.dim
    terms.forEach((line, index) => ctx.fillText(line, M + 28, y + 82 + index * 32))
    y += termsH
  }

  // Pie.
  ctx.fillStyle = C.line
  ctx.fillRect(M, y + 20, inner, 2)
  ctx.textAlign = 'center'
  ctx.font = `700 28px ${FONT}`
  ctx.fillStyle = C.ink
  ctx.fillText('¡Gracias por comprar en JB Tech Store!', W / 2, y + 78)
  ctx.font = `500 23px ${FONT}`
  ctx.fillStyle = C.faint
  const phone = data.whatsapp.replace(/\D/g, '').replace(/^1?(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')
  ctx.fillText(`${phone ? `WhatsApp ${phone} · ` : ''}jbtechstore.com`, W / 2, y + 118)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))), 'image/png'))
}
