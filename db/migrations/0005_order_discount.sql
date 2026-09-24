-- Descuento por pedido (lo usa "Editar pedido" en el panel admin).
-- Si ya existe la columna, no hace nada.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount" integer NOT NULL DEFAULT 0;
