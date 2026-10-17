-- Retiro personal donde lo de Yeilin no alcanzaba: cuánto de ese retiro
-- salió de su parte de la ganancia con un socio (`partner_id`, «Te toca a
-- ti»). Los gastos de antes quedan en 0.
-- La app también crea esta columna sola al arrancar (ver ensureSchema en
-- src/lib/store.ts), así que correr esto a mano es opcional.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "partner_amount" integer NOT NULL DEFAULT 0;
