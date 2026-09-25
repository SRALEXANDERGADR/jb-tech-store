-- Precio y cantidad propios por opción (color/diseño) dentro de una misma
-- tarjeta. El precio y la cantidad de cada opción viven dentro del JSON
-- `variant_images` que ya existía, así que solo hacen falta 2 columnas.
-- La app también las crea sola al arrancar (ver ensureSchema en
-- src/lib/store.ts), así que correr esto a mano es opcional.
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "option_stock" boolean NOT NULL DEFAULT false;
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "option" text NOT NULL DEFAULT '';
