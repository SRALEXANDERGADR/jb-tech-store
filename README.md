# JB Tech Store

Tienda online de JB Tech Store: teléfonos, laptops, cargadores, covers y
accesorios. Misma idea de estructura que portatilshoprd.com (categorías,
ofertas por pestañas, catálogo con filtros, carrito) pero con la marca,
colores y productos de JB, y construida con la misma base técnica que
Ela Esencia (React + TanStack Start en Cloudflare Workers, con Neon
Postgres como base de datos y GitHub para guardar las fotos de producto).

No procesa pagos con tarjeta: el cliente arma su pedido, dejas sus datos,
y el pago/entrega se coordina por WhatsApp — igual que ya haces con el
catálogo de Kyte, pero con tu propia tienda, tu propio catálogo
administrable y sin la marca de Kyte.

## Antes de empezar — necesitas 2 cuentas gratis

1. **Neon** (base de datos Postgres): https://neon.tech — crea un
   proyecto, copia la cadena de conexión (`postgresql://...`).
2. **Cloudflare** (donde vive el sitio): ya tienes cuenta por tus otros
   proyectos (Alexander Perfiles, Ela, GADR Net, etc.), así que solo
   necesitas crear este Worker nuevo.

Opcional: **Resend** (https://resend.com) si quieres que además del
pedido guardado y el botón de WhatsApp, te llegue un correo por cada
pedido nuevo.

## 1. Instalar dependencias

```
cd jb-tech-store
npm install
```

## 2. Configurar variables locales

```
cp .dev.vars.example .dev.vars
```

Abre `.dev.vars` y completa:
- `DATABASE_URL`: la cadena de conexión que copiaste de Neon.
- `ADMIN_PASSWORD`: la contraseña que vas a usar para entrar a `/admin`.
- `SESSION_SECRET`: cualquier texto largo al azar.
- `GITHUB_TOKEN` y `GITHUB_REPO`: para poder subir fotos de producto
  desde el panel admin (ver sección siguiente).

`.dev.vars` nunca se sube a git (ya está en `.gitignore`).

## 3. Token de GitHub para subir fotos

El panel admin sube las fotos de los productos directo al repo de
GitHub (a `public/uploads/`), igual que en Ela Esencia y Alexander
Perfiles — así no dependes de otro servicio de imágenes.

1. En GitHub: Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token.
2. Dale acceso solo al repositorio de esta tienda, con permiso
   **Contents: Read and write**.
3. Copia el token a `GITHUB_TOKEN` en `.dev.vars`.
4. En `GITHUB_REPO` pon `usuario/nombre-del-repo` (ej.
   `SRALEXANDERGADR/jb-tech-store`).

## 4. Crear las tablas en Neon

Con `DATABASE_URL` ya configurada:

```
npx drizzle-kit migrate
```

Esto crea las tablas (`products`, `customers`, `orders`, `content`,
`image_trash`) en tu base de Neon. La primera vez que abras la tienda
o el panel admin, se cargan solos los textos por defecto y 12
productos de ejemplo (con fotos de marcador de posición) para que no
se vea vacía — bórralos o edítalos desde **Catálogo** en cuanto tengas
tus fotos y precios reales.

## 5. Probar en local

```
npm run dev
```

Abre lo que te muestre la terminal (normalmente
`http://localhost:3000`). El panel admin está en `/admin`.

## 6. Publicar en Cloudflare Workers

```
npx wrangler login
```

(te va a pedir abrir un link en el navegador para autorizar).

Configura los secretos de producción (uno por uno, cada uno te pedirá
pegar el valor):

```
npx wrangler secret put DATABASE_URL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GITHUB_TOKEN
```

Y estas dos variables normales (no secretas) van directo en
`wrangler.jsonc`, dentro de `"vars"` — agrega tu usuario/repo:

```jsonc
"vars": {
  "GITHUB_REPO": "SRALEXANDERGADR/jb-tech-store",
  "GITHUB_BRANCH": "main",
  "GITHUB_UPLOAD_PATH": "public/uploads"
}
```

Si quieres correo de aviso por pedido, agrega también:

```
npx wrangler secret put RESEND_API_KEY
```

Y por último:

```
npm run deploy
```

Cloudflare te da la URL final (algo como
`jb-tech-store.<tu-cuenta>.workers.dev`), o puedes conectarle un
dominio propio desde el dashboard de Cloudflare.

## Subir el proyecto a GitHub (con tu token, como ya haces)

```
git init
git add .
git commit -m "Tienda JB Tech Store"
git branch -M main
git remote add origin https://github.com/SRALEXANDERGADR/jb-tech-store.git
git push -u origin main
```

## Cómo administrar la tienda día a día

Entra a `/admin` con la contraseña que pusiste en `ADMIN_PASSWORD`.

- **Catálogo**: agregar/editar/ocultar productos, subir fotos, poner
  precio de oferta (precio anterior tachado + tu precio actual — deja
  "Precio anterior" vacío si no está en oferta), marcar
  Destacado/Nuevo/Más vendido (controla en qué pestaña de "Ofertas"
  aparece cada producto en la portada), y las existencias.
- **Pedidos**: todo pedido hecho desde la tienda aparece aquí con sus
  datos de contacto y productos; cambia el estado (Pendiente →
  Confirmado → Preparando → Enviado → Entregado) y si ya pagó.
- **Clientes**: se crean solos con cada pedido; también puedes
  agregarlos a mano.
- **Contenido**: edita todos los textos de la tienda sin tocar código
  — el título de la portada, el WhatsApp, la dirección, el horario,
  Instagram/Facebook, etc. El número de WhatsApp va solo con dígitos y
  código de país (ej. `18095551234` para México... para RD sería
  `1809...` o `1829...`/`1849...` según tu operador — sin espacios,
  signos ni el `+`).
- **Papelera**: lo que borres desde Catálogo/Pedidos/Clientes cae aquí
  por 30 días antes de eliminarse para siempre (por si te
  equivocaste), con botón para restaurar o borrar ya mismo.

## Reemplazar el logo

El logo circular ya está incluido en `public/logo.png` (recortado de
tu logo de Instagram). Si tienes un archivo más nítido, solo
reemplaza `public/logo.png` (cuadrado, fondo transparente idealmente)
y los `public/favicon-*.png` / `public/apple-touch-icon.png` con tu
propio ícono.

## Categorías

Las categorías del menú y del catálogo están fijas en
`src/lib/store.ts` (constante `CATEGORIES`): Teléfonos, Laptops,
Accesorios, Cargadores y Cables, Covers y Protectores, Audífonos y
Bocinas, Relojes Inteligentes, Gaming, Otros. Si quieres agregar o
renombrar una categoría, edita esa lista (y los íconos en
`CATEGORY_ICONS` dentro de `src/components/Storefront.tsx` si agregas
una categoría nueva).

## Lo que esta tienda NO incluye (a propósito)

Para mantenerla simple y enfocada en lo que de verdad usas (catálogo +
pedido coordinado por WhatsApp, igual que ahora), no incluye: pago con
tarjeta en línea, citas/reservas (eso es lo de Ela, que vende
servicios), ni facturación con PDF. Si en algún momento quieres
agregar alguna de estas cosas, dímelo y lo construimos encima de esta
misma base.

## Opciones con su propio precio y cantidad

Una misma tarjeta (ej. "Cover para iPhone 12") puede tener varias
opciones (colores, diseños, modelos). En **Productos → Editar → 3 ·
Opciones**, cada opción puede tener su foto, su **precio** (si se deja
vacío usa el precio general) y, con «Cada opción tiene su propia
cantidad» activado, su **cantidad**.

- **Reponer** muestra todas las opciones: pones cuántas compraste de cada
  una y a cuánto. Cada opción queda como su propio lote de compra.
- Al vender, cada opción sale de SUS compras, la más vieja primero
  (FIFO). En **Productos → Compras** se ve cuál compra «Se vende ahora» y
  cuál está «En espera»; en **Pedidos** cada línea dice a cuánto costó.
- Compras registradas antes de separar por opción aparecen como «Sin
  opción»: con **Repartir** se dice cuántas eran de cada opción.

Las columnas nuevas (`products.option_stock`, `purchases.option`) las crea
la app sola al arrancar; `db/migrations/0006_option_stock.sql` es solo
para referencia.
