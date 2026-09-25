-- Aparatos que reciben notificaciones de pedidos nuevos (app del panel).
-- La app también crea esta tabla sola al arrancar (ensureSchema).
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" serial PRIMARY KEY,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "label" text NOT NULL DEFAULT '',
  "created_at" timestamp NOT NULL DEFAULT now()
);
