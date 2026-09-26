# Contexto para trabajar en JB Tech Store

Lee todo antes de tocar nada. (Este repo es PÚBLICO: aquí nunca van contraseñas, claves ni cadenas de conexión.)

## Quién es el desarrollador y cómo hablarle
- Es desarrollador, trabaja solo desde Android con Termux. No tiene PC.
- Háblale en español, corto y sencillo, sin palabras técnicas de más. Primero haz o dile qué hacer; explica solo lo necesario.
- La clienta es **Yeilin**, la dueña de la tienda. Cuando te pida un texto para ella, escríbelo claro, sin abreviaturas (nada de "c/u"; escribe "cada una").

## El proyecto
- Tienda online **JB Tech Store**: productos tecnológicos (covers, cargadores, audífonos...) en República Dominicana. No cobra con tarjeta: el cliente hace el pedido y se coordina por WhatsApp.
- Stack: React + **TanStack Start** en **Cloudflare Workers**, base de datos **Neon Postgres** (drizzle-orm con driver `neon-http`, sin transacciones interactivas), las fotos se suben al repo de GitHub (`public/uploads`) y se sirven desde raw.githubusercontent.com.
- **Todo el dinero se guarda en centavos** (RD$350 = 35000).
- Archivos principales:
  - `src/lib/store.ts`: todas las funciones del servidor (pedidos, productos, compras/lotes FIFO, Finanzas, notificaciones).
  - `src/lib/variants.ts`: precio y cantidad por opción (lo usan la tienda, el panel y el servidor).
  - `src/lib/push.ts`: notificaciones push (Web Push hecho a mano con WebCrypto, probado contra el ejemplo oficial del RFC 8291).
  - `src/components/AdminPanel.tsx`: todo el panel admin (aquí se calcula Finanzas).
  - `src/components/Storefront.tsx`: la tienda.
  - `db/schema.ts`: tablas. `db/migrations/*.sql`: solo de referencia.
  - `public/admin-sw.js`: service worker de la app "JB Admin". `public/admin.webmanifest`: manifest de la app.
- **Columnas nuevas en la base de datos:** se crean solas con `ensureSchema()` en `store.ts` (usa `ALTER TABLE ... IF NOT EXISTS`). Si agregas una columna, agrégala ahí también y sube el número del chequeo. No hace falta correr migraciones a mano en Neon.
- Antes de subir: `npm install` y `npm run build` (el build genera `src/routeTree.gen.ts`; después de eso `npx tsc --noEmit` también pasa). No subas `package-lock.json` (el repo no lo usa).

## ⚠️ MUY IMPORTANTE: qué cuenta está en uso
Hay dos cuentas. **La que funciona es la VIEJA.** La nueva (de Yeilin) está en pausa.

**En uso (trabaja aquí):**
- GitHub: `SRALEXANDERGADR/jb-tech-store`, rama `main`. Cada push a main hace que Cloudflare publique solo (1 a 3 minutos).
- Cloudflare Worker `jb-tech-store` en la cuenta vieja → `jb-tech-store.gadrnet.workers.dev`.
  - Secretos del Worker: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `GITHUB_TOKEN` (y `RESEND_API_KEY` si se usa el correo).
  - En `wrangler.jsonc` están `GITHUB_REPO`, `GITHUB_BRANCH` (`main`) y `GITHUB_UPLOAD_PATH` (`public/uploads`). `GITHUB_REPO` tiene que ser `SRALEXANDERGADR/jb-tech-store` (de ahí se suben y borran las fotos). No lo cambies.
- Neon: proyecto "JB Tech Store" `cool-boat-36837022` (cuenta vieja). Ahí están los datos reales.

**El dominio jbtechstore.com (funciona y es el que se usa):**
- La tienda, el panel (jbtechstore.com/admin) y la app JB Admin se abren desde ahí.
- Está en la cuenta de Cloudflare de Yeilin, conectado como dominio personalizado a su Worker `jb-tech-store`. Ese Worker NO tiene la app: tiene un código "puente", puesto a mano con "Editar código" en el panel de Cloudflare, que reenvía todo a la cuenta vieja:
  ```js
  export default {
    async fetch(request) {
      const incoming = new URL(request.url)
      const target = new URL(incoming.pathname + incoming.search, 'https://jb-tech-store.gadrnet.workers.dev')
      return fetch(target.toString(), request)
    }
  }
  ```
- Por eso, todo lo que se sube a la cuenta vieja se ve también en jbtechstore.com.
- Se hizo con un puente porque Cloudflare no deja apuntar un dominio de una cuenta a un Worker de otra cuenta (da el Error 1014).

**En pausa (NO TOCAR):**
- GitHub `YeilinJavierBaez/jb-tech-store` y el Neon `rough-firefly-15636381` (una copia de los datos del 25 de septiembre).
- **Si se sube cualquier cosa al repo de Yeilin, Cloudflare reconstruye su Worker, borra el puente y jbtechstore.com se cae.** Nunca hagas push a ese repo.
- Se dejó así porque Yeilin ya tiene volantes y códigos QR impresos con el enlace viejo (`jb-tech-store.gadrnet.workers.dev`). Algún día se mudará todo a su cuenta; cuando llegue ese momento, habrá que copiar otra vez los datos a su Neon y revisar su secreto `DATABASE_URL` (ese Worker daba error 500, probablemente por esa variable mal pegada). No es para ahora.

## Lo que ya está hecho y funcionando
1. **Opciones con precio y cantidad propios** dentro de una misma tarjeta (ej. "Cover iPhone 12" con 10 diseños). Cada opción tiene su foto, su descripción, su precio (0 = usa el precio general) y su cantidad, si el producto tiene activado `optionStock` ("Cada opción tiene su propia cantidad").
   - Se guarda en `products.options` (nombres separados por coma), en `products.variant_images` (JSON con `option`, `image`, `description`, `price`, `stock` de cada opción) y en `products.option_stock`. Con cantidad por opción, `products.stock` es siempre la suma de las opciones.
   - En la tienda, si las opciones no valen igual, la tarjeta dice "Desde RD$…"; las opciones agotadas salen tachadas.
2. **Compras por lotes (FIFO):** cada "Reponer" crea un lote con su costo (tabla `purchases`, columna `option` = de qué opción es; '' = sin opción). Al vender, sale primero del lote más viejo con unidades. Una venta de una opción solo sale de los lotes de esa opción o de los lotes "Sin opción", nunca de los de otra opción. En Productos → "Compras" se ve "Se vende ahora" / "En espera". Los lotes "Sin opción" se pueden "Repartir entre opciones".
3. **Pedidos:** cada línea guarda `cost` (costo por unidad) y `option`. Los pedidos viejos no tienen `option`: se saca del nombre ("Producto — opción"). En el panel se ve "Costó X cada una · ganancia Y". Cancelar un pedido devuelve las unidades a su opción y a su lote; reactivarlo las vuelve a sacar.
4. **La tienda pública no manda el costo** ni la configuración privada (capital, % de reinversión, claves).
5. **App "JB Admin" con notificaciones:** el panel se instala como app (el botón "Instalar app" solo sale después de entrar con la contraseña). Cada pedido nuevo de un cliente manda una notificación push con el punto en el ícono. Tabla `push_subscriptions`. Las claves VAPID se crean solas y se guardan en la tabla `content` (key `vapidKeys`); nunca se mandan al navegador.
   - El service worker tiene alcance `/admin`. El manifest de la tienda (`/site.webmanifest`) va solo en la página de inicio, y el de la app solo se agrega con la sesión abierta.
   - El manifest de la app (`public/admin.webmanifest`) tiene `scope: "/"` (y `start_url`/`id` en `/admin`): así, si dentro de la app se abre la tienda (al cerrar sesión o tocar "Ver la tienda"), no sale la barra blanca con la dirección y la X. El dueño lo quiere así: la tienda se abre DENTRO de la app, sin barra. Efecto aceptado: en el aparato donde esté instalada JB Admin, los enlaces de la tienda de ese mismo dominio pueden abrirse dentro de la app.
   - Cada pedido nuevo también manda un correo con Resend, si en "Textos" hay un correo para avisos (`notificationEmail`).
   - Si falla la activación, el panel muestra el código de error que respondió Google.
6. **Panel admin simplificado:** menú en cuadritos en el teléfono (Inicio, Productos, Pedidos, Finanzas, Clientes, Textos, Papelera). Finanzas tiene 5 números grandes y el detalle en secciones que se abren. Crear un producto nuevo abre "Reponer" enseguida, porque un producto nuevo siempre empieza en 0.
7. **Portada para compartir:** `public/og-cover.png` y las etiquetas `og:` en `src/routes/__root.tsx` apuntan a jbtechstore.com.
8. **"Dinero para reinvertir" como dinero propio de la dueña** (ver Finanzas abajo).

## Finanzas: el dinero para reinvertir es de la dueña
La dueña lo explicó así: el dinero de reinvertir **es suyo, no del negocio**. Es como su cartera:
> "Si tengo 100 míos de mi cartera y compro un cargador, cuando lo venda en 200, los 100 de la cartera vuelven a su lugar y los otros 100 son míos limpios, no pasan por el negocio."

Cómo está hecho:
- `purchases.fund` (`'capital'` o `'reinversion'`, por defecto `'capital'`): con qué dinero se pagó cada lote. En "Reponer" se elige "¿Con qué dinero?" (Dinero del negocio / Dinero para reinvertir), mostrando el saldo de cada uno y cuánto queda después. `splitPurchase` copia el `fund` del lote original. En la lista de compras, los lotes de reinversión llevan la etiqueta "Reinversión".
- Al vender, `consumeFifoCost`/`takeStock` devuelven `{ cost, reinv, reinvQty }`. Cada línea del pedido guarda `reinvCost` (lo que costaron EN TOTAL las unidades de lotes de reinversión, en centavos) y `reinvQty` (cuántas unidades). Solo se guardan si hay alguna. Aplica a `createOrder`, `recordManualSale` y a reactivar un pedido en `updateOrderStatus`.
- Cancelar un pedido devuelve las `reinvQty` unidades a lotes de reinversión y las demás a lotes del negocio (`returnToFifo`).
- Editar pedido (`updateOrder`): el costo NO se toma del navegador. Se calcula por producto+opción desde el pedido anterior (unidades, costo total, `reinvCost`, `reinvQty`). Si bajan las unidades, todo baja en proporción (`shrinkPool`) y las que salen vuelven a su caja. Si suben, se suma lo que devuelve `takeStock`. Después se reparte entre las líneas (`splitByWeight`).
- Cuentas en `AdminPanel.tsx` (solo pedidos "Pagado" que no estén "Cancelado"; el descuento del pedido se reparte en proporción al precio de cada línea):
  - `ganancia = ingresos − costo de lo vendido`
  - `ventasReinv` = lo que se cobró por las unidades de lotes de reinversión; `recuperadoReinv` = suma de `reinvCost`
  - `gananciaPropia = ventasReinv − recuperadoReinv` → 100% de la dueña, va directo a "Puedes retirar" (no se reparte)
  - `gananciaNegocio = ganancia − gananciaPropia` → solo esta se reparte: `reinversion` = `reinvestPercent`% (70% por defecto) y `paraTi` = el resto
  - `gastadoReinv` = compras con `fund = 'reinversion'`; `gastadoCapital` = las demás
  - **Dinero del negocio** = capitalInicial − gastadoCapital + (costo de lo vendido − recuperadoReinv) − gastos del negocio
  - **Dinero para reinvertir** = reinversion − gastadoReinv + recuperadoReinv
  - **Puedes retirar** = paraTi + gananciaPropia − gastos personales
  - Las tres cajas juntas siempre suman: capital inicial − compras + ventas − gastos.
  - Si se borra un lote de reinversión, su dinero vuelve solo a "Para reinvertir" (baja su `totalCost`).
- Los lotes y pedidos de antes quedaron como `capital` y sin `reinvCost`, así que sus números no cambiaron.

## Otros detalles
- La sesión del admin dura 12 horas (`SESSION_HOURS` en `src/lib/auth.ts`). Se le ofreció al dueño subirla a 30 días para la app; no ha decidido. No lo cambies sin preguntar.
- `src/routes/__root.tsx` tiene un `errorComponent` que muestra "No pudimos cargar la tienda" y esconde el error real. Si algo falla, busca el error en los logs de Cloudflare, no en la pantalla.
- En el pie de la tienda está el crédito "GADR Net | gadrnet.com" (la marca del desarrollador). Se queda.
- **Pendiente para Yeilin:** los covers que registró el 25 de septiembre quedaron con compras "Sin opción". En cada tarjeta tiene que ir a "Editar", marcar "Cada opción tiene su propia cantidad" y poner cuántas hay de cada una. Después, en "Compras", tocar "Repartir entre opciones" para decir cuáles costaron 26 y cuáles 130.
- Si no puedes subir a GitHub, prepara el cambio como un parche (`git diff`) y dale los comandos para Termux. Él lo aplica en `~/jb-tech-store` con el remoto apuntando a `https://github.com/SRALEXANDERGADR/jb-tech-store.git`.
- La tienda se usa de verdad todos los días: antes de subir, revisa que no se rompan pedidos, stock ni Finanzas.
