-- Con qué dinero se pagó cada lote de compra: 'capital' (dinero del
-- negocio) o 'reinversion' (dinero para reinvertir). Los lotes viejos
-- quedan como 'capital'.
-- La app también crea esta columna sola al arrancar (ver ensureSchema en
-- src/lib/store.ts), así que correr esto a mano es opcional.
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "fund" text NOT NULL DEFAULT 'capital';
