import type { ReactNode } from 'react'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
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
    ],
  }),
  shellComponent: RootDocument,
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
