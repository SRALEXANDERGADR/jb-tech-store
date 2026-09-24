import type { ReactNode } from 'react'
import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'

import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        title: 'JB Tech Store — Tecnología, accesorios y confianza',
      },
      {
        name: 'description',
        content: 'Teléfonos, laptops, cargadores, covers y accesorios originales en República Dominicana. Pedidos coordinados por WhatsApp con entrega a todo el país.',
      },
      {
        property: 'og:title',
        content: 'JB Tech Store — Tecnología, accesorios y confianza',
      },
      {
        property: 'og:description',
        content: 'Teléfonos, laptops y accesorios originales, con garantía y entrega en toda República Dominicana.',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      // Imagen y enlace que salen cuando se comparte la tienda por WhatsApp,
      // Facebook, etc. Si algún día se cambia a un dominio propio, cambiar
      // también estas dos direcciones.
      { property: 'og:url', content: 'https://jb-tech-store.gadrnet.workers.dev/' },
      { property: 'og:image', content: 'https://jb-tech-store.gadrnet.workers.dev/favicon-512.png' },
      { property: 'og:locale', content: 'es_DO' },
      { property: 'og:site_name', content: 'JB Tech Store' },
      { name: 'twitter:card', content: 'summary' },
      {
        name: 'theme-color',
        content: '#0b1220',
      },
    ],
    links: [
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
      { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/favicon-192.png' },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap' },
    ],
  }),
  shellComponent: RootDocument,
  // Página propia para enlaces que no existen (en vez del "Not Found" en
  // blanco) y para cuando algo falla al cargar (ej. la base de datos no
  // responde): el cliente ve un mensaje claro y un botón para volver.
  notFoundComponent: () => (
    <main className="legal-page status-page">
      <h1>Esta página no existe</h1>
      <p>Puede que el enlace esté mal escrito o que el producto ya no esté disponible.</p>
      <Link to="/" className="primary-button">Ir a la tienda</Link>
    </main>
  ),
  errorComponent: () => (
    <main className="legal-page status-page">
      <h1>No pudimos cargar la tienda</h1>
      <p>Intenta de nuevo en unos segundos. Si sigue pasando, escríbenos por WhatsApp y te atendemos directo.</p>
      <button type="button" className="primary-button" onClick={() => window.location.reload()}>Reintentar</button>
    </main>
  ),
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
