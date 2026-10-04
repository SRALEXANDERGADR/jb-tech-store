import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'

// Enlace para compartir UN artículo: jbtechstore.com/p/<id>. Abre la tienda
// con la ficha de ese artículo ya abierta, y al compartirlo por WhatsApp o
// Facebook sale con su foto, su nombre y su precio.
const SITE = 'https://jbtechstore.com'
const money = (value: number) => `RD$${Math.round(value / 100).toLocaleString('en-US')}`

export const Route = createFileRoute('/p/$id')({
  loader: async ({ params }) => {
    const data = await getStorefront()
    const product = data.products.find((item) => item.id === Number(params.id)) ?? null
    return { data, product }
  },
  head: ({ loaderData, params }) => {
    const product = loaderData?.product
    const links = [{ rel: 'manifest', href: '/site.webmanifest' }]
    if (!product) return { links }
    const image = product.image ? (/^https?:\/\//.test(product.image) ? product.image : `${SITE}${product.image}`) : `${SITE}/og-cover.png`
    const title = `${product.name} · JB Tech Store`
    const description = `${money(product.price)} · ${(product.description || 'Pídelo en JB Tech Store y coordina la entrega por WhatsApp.').replace(/\s+/g, ' ').trim()}`.slice(0, 200)
    return {
      links,
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'product' },
        { property: 'og:url', content: `${SITE}/p/${params.id}` },
        { property: 'og:image', content: image },
        { name: 'twitter:image', content: image },
      ],
    }
  },
  component: ProductLink,
})

function ProductLink() {
  const { data, product } = Route.useLoaderData()
  return <Storefront data={data} initialProductId={product?.id} />
}
