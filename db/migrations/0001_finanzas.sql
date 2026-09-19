ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost" integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" integer NOT NULL,
	"total_cost" integer NOT NULL,
	"notes" text NOT NULL DEFAULT '',
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL DEFAULT 'negocio',
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "purchases_product_idx" ON "purchases" ("product_id");
CREATE INDEX IF NOT EXISTS "purchases_created_idx" ON "purchases" ("created_at");
CREATE INDEX IF NOT EXISTS "expenses_created_idx" ON "expenses" ("created_at");
