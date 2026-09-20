ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "remaining_quantity" integer NOT NULL DEFAULT 0;

-- Backfill para compras que ya existían antes de este cambio: calcula
-- cuánto de cada lote sigue disponible, asumiendo que las ventas ya
-- hechas consumieron primero el lote más viejo de cada producto (FIFO),
-- comparando el total comprado contra el stock actual. Si un producto no
-- tiene compras registradas, no hay nada que rellenar para él.
WITH totals AS (
  SELECT product_id, SUM(quantity) AS total_purchased
  FROM purchases
  GROUP BY product_id
),
already_sold AS (
  SELECT t.product_id, GREATEST(0, t.total_purchased - COALESCE(p.stock, 0)) AS sold
  FROM totals t
  JOIN products p ON p.id = t.product_id
),
running AS (
  SELECT
    pu.id,
    pu.product_id,
    pu.quantity,
    SUM(pu.quantity) OVER (PARTITION BY pu.product_id ORDER BY pu.created_at, pu.id ROWS UNBOUNDED PRECEDING) AS running_total
  FROM purchases pu
)
UPDATE purchases
SET remaining_quantity = GREATEST(0, LEAST(running.quantity, running.running_total - COALESCE(already_sold.sold, 0)))
FROM running
LEFT JOIN already_sold ON already_sold.product_id = running.product_id
WHERE purchases.id = running.id;

CREATE INDEX IF NOT EXISTS "purchases_remaining_idx" ON "purchases" ("product_id", "remaining_quantity");
