import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/terminos')({ component: Terminos })

function Terminos() {
  return (
    <main className="legal-page">
      <Link to="/" className="legal-back"><ArrowLeft size={16} /> Volver a la tienda</Link>
      <h1>Términos y condiciones</h1>
      <p className="legal-updated">Última actualización: {new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <h2>Uso del sitio</h2>
      <p>Este sitio es operado por JB Tech Store. Al navegar y realizar pedidos a través de esta tienda, aceptas los presentes términos y condiciones.</p>

      <h2>Disponibilidad de productos</h2>
      <p>Los precios, existencias y descripciones de los productos están sujetos a cambios sin previo aviso. Confirmamos la disponibilidad final de cada producto al coordinar el pedido por WhatsApp.</p>

      <h2>Precios</h2>
      <p>Todos los precios se muestran en pesos dominicanos (RD$) e incluyen los impuestos aplicables, salvo que se indique lo contrario. Las ofertas y descuentos son válidos por tiempo limitado.</p>

      <h2>Productos usados</h2>
      <p>Los productos marcados como usados se describen con la mayor precisión posible en cuanto a su estado y funcionamiento. Te recomendamos leer la descripción completa antes de confirmar tu pedido.</p>

      <h2>Responsabilidad</h2>
      <p>JB Tech Store no se hace responsable por el mal uso de los productos adquiridos ni por daños derivados de un uso distinto al indicado por el fabricante.</p>

      <h2>Modificaciones</h2>
      <p>Nos reservamos el derecho de actualizar estos términos y condiciones en cualquier momento. Los cambios entran en vigor desde su publicación en esta página.</p>

      <h2>Contacto</h2>
      <p>Si tienes preguntas sobre estos términos, contáctanos por WhatsApp o a través de nuestras redes sociales.</p>
    </main>
  )
}
