import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/politicas')({ component: Politicas })

function Politicas() {
  return (
    <main className="legal-page">
      <Link to="/" className="legal-back"><ArrowLeft size={16} /> Volver a la tienda</Link>
      <h1>Políticas de la tienda</h1>
      <p className="legal-updated">Última actualización: 24 de septiembre de 2026</p>

      <h2>Pedidos</h2>
      <p>Al confirmar un pedido en la tienda, este queda registrado como una solicitud de compra. Un miembro del equipo de JB Tech Store se pondrá en contacto por WhatsApp o teléfono para confirmar disponibilidad, coordinar el método de pago y la entrega.</p>

      <h2>Pagos</h2>
      <p>Aceptamos transferencia bancaria, depósito y pago en efectivo contra entrega según disponibilidad. El pago se coordina directamente con el equipo de ventas después de confirmar el pedido.</p>

      <h2>Envíos y entregas</h2>
      <p>Realizamos entregas locales y envíos a todo el país a través de compañías de encomienda. Los tiempos de entrega varían según la zona y se confirman al coordinar el pedido.</p>

      <h2>Garantía</h2>
      <p>Los equipos y accesorios nuevos cuentan con garantía según el fabricante o distribuidor. Los equipos usados se venden en las condiciones descritas en su publicación, con la garantía indicada en cada producto. Cualquier reclamo debe reportarse dentro del plazo de garantía especificado.</p>

      <h2>Devoluciones</h2>
      <p>Si recibes un producto defectuoso o distinto al solicitado, contáctanos dentro de las 48 horas posteriores a la entrega para coordinar la revisión, cambio o devolución correspondiente.</p>

      <h2>Privacidad</h2>
      <p>Los datos que nos compartes al hacer un pedido (nombre, teléfono, correo y dirección) se usan únicamente para procesar tu pedido y coordinar la entrega. No compartimos tu información con terceros salvo lo necesario para completar el envío.</p>

      <h2>Contacto</h2>
      <p>Para cualquier duda sobre estas políticas, escríbenos por WhatsApp o a través de nuestras redes sociales.</p>
    </main>
  )
}
