import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'

export const Route = createFileRoute('/')({
  // La tienda y el panel admin son 2 "apps" distintas al instalarlas: cada
  // página trae su propio manifest (el del panel está en /admin).
  // El tamaño de la portada para compartir va aquí (y no en __root) porque
  // el enlace de cada artículo (/p/<id>) usa la foto del artículo.
  head: () => ({
    links: [{ rel: 'manifest', href: '/site.webmanifest' }],
    meta: [{ property: 'og:image:width', content: '1200' }, { property: 'og:image:height', content: '630' }],
  }),
  loader: () => getStorefront(),
  component: Home,
})

function Home() {
  return <Storefront data={Route.useLoaderData()} />
}
