// Envía el correo de aviso cuando un cliente hace un pedido desde la
// tienda pública. Usa la API de Resend (https://resend.com) vía fetch,
// sin necesidad de instalar ningún paquete adicional (igual que
// src/lib/github.ts).
//
// Requiere el secreto de Cloudflare RESEND_API_KEY. Opcionalmente
// RESEND_FROM_EMAIL (remitente). Si RESEND_API_KEY no está configurado, o
// si no hay un correo de destino guardado en el panel de admin (campo
// "notificationEmail" del editor de contenido), simplemente no se envía
// nada: un fallo o falta de configuración en el correo nunca debe
// interrumpir el registro del pedido.

const money = (cents: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(cents / 100)
const shortDate = (value: string | Date) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

type EmailOrder = {
  orderNumber: string
  createdAt: string | Date
  customerName: string
  email: string
  phone: string
  address: string
  total: number
  items: Array<{ name: string; price: number; quantity: number }>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapEmail(headerLabel: string, title: string, subtitle: string, bodyHtml: string): string {
  return `
  <!DOCTYPE html>
  <html lang="es">
  <body style="margin:0;padding:0;background-color:#0b1220;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1220;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
            <tr>
              <td style="background-color:#0f1b33;padding:28px 32px;">
                <p style="margin:0;color:#3b82f6;font-size:12px;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(headerLabel)}</p>
                <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;">${escapeHtml(title)}</h1>
                <p style="margin:6px 0 0;color:#a9b6cc;font-size:13px;">${escapeHtml(subtitle)}</p>
              </td>
            </tr>
            ${bodyHtml}
            <tr>
              <td style="padding:28px 32px 32px;">
                <p style="margin:0;color:#999;font-size:12px;text-align:center;">Este correo se generó automáticamente desde la tienda de JB Tech Store.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`
}

function buildOrderEmailHtml(order: EmailOrder): string {
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#333;font-size:14px;">${escapeHtml(item.name)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#333;font-size:14px;text-align:center;">${item.quantity}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#333;font-size:14px;text-align:right;">${money(item.price)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#333;font-size:14px;text-align:right;font-weight:600;">${money(item.price * item.quantity)}</td>
        </tr>`,
    )
    .join('')

  const body = `
    <tr>
      <td style="padding:28px 32px 0;">
        <h2 style="margin:0 0 12px;color:#0f1b33;font-size:15px;">Datos del cliente</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f5fa;border-radius:8px;">
          <tr>
            <td style="padding:14px 16px;font-size:14px;color:#333;">
              <p style="margin:0 0 6px;"><strong>Nombre:</strong> ${escapeHtml(order.customerName)}</p>
              <p style="margin:0 0 6px;"><strong>Teléfono:</strong> ${escapeHtml(order.phone)}</p>
              <p style="margin:0 0 6px;"><strong>Correo:</strong> ${order.email ? escapeHtml(order.email) : 'No proporcionado'}</p>
              <p style="margin:0;"><strong>Dirección:</strong> ${order.address ? escapeHtml(order.address) : 'No proporcionada'}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px 0;">
        <h2 style="margin:0 0 12px;color:#0f1b33;font-size:15px;">Productos pedidos</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead>
            <tr>
              <th style="padding:10px 12px;background-color:#0f1b33;color:#ffffff;font-size:12px;text-align:left;">Producto</th>
              <th style="padding:10px 12px;background-color:#0f1b33;color:#ffffff;font-size:12px;text-align:center;">Cant.</th>
              <th style="padding:10px 12px;background-color:#0f1b33;color:#ffffff;font-size:12px;text-align:right;">Precio</th>
              <th style="padding:10px 12px;background-color:#0f1b33;color:#ffffff;font-size:12px;text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;color:#0f1b33;font-size:16px;font-weight:700;border-top:1px solid #eee;">Total</td>
            <td style="padding:8px 0;color:#0f1b33;font-size:16px;font-weight:700;text-align:right;border-top:1px solid #eee;">${money(order.total)}</td>
          </tr>
        </table>
      </td>
    </tr>`

  return wrapEmail('Nuevo pedido', `Pedido ${order.orderNumber}`, shortDate(order.createdAt), body)
}

async function sendResendEmail(env: Env, to: string, subject: string, html: string): Promise<void> {
  if (!to) return
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY no está configurado: no se envió el correo de aviso.')
    return
  }
  try {
    const from = env.RESEND_FROM_EMAIL || 'JB Tech Store <onboarding@resend.dev>'
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })
    if (!response.ok) {
      const detail = await response.text()
      console.error(`No se pudo enviar el correo de aviso (${response.status}). ${detail.slice(0, 300)}`)
    }
  } catch (caught) {
    console.error('Error enviando el correo de aviso:', caught)
  }
}

/** Envía el correo de aviso de pedido. Nunca lanza: un fallo aquí no debe
 * interrumpir el registro del pedido del cliente. */
export async function sendOrderNotificationEmail(env: Env, to: string, order: EmailOrder): Promise<void> {
  await sendResendEmail(env, to, `Nuevo pedido: ${order.orderNumber} — ${order.customerName}`, buildOrderEmailHtml(order))
}
