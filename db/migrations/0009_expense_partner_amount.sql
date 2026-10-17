-- Retiro personal que no cabía en «Puedes retirar»: cuánto de ese retiro
-- salió del dinero de un socio (`partner_id`). Los gastos de antes quedan
-- en 0, así que sus números no cambian.
-- La app también crea esta columna sola al arrancar (ver ensureSchema en
-- src/lib/store.ts), así que correr esto a mano es opcional.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "partner_amount" integer NOT NULL DEFAULT 0;
