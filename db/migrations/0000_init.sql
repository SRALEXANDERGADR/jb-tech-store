CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL DEFAULT 'Otros',
	"description" text NOT NULL DEFAULT '',
	"price" integer NOT NULL DEFAULT 0,
	"original_price" integer NOT NULL DEFAULT 0,
	"stock" integer NOT NULL DEFAULT 0,
	"image" text NOT NULL DEFAULT '',
	"featured" boolean NOT NULL DEFAULT false,
	"is_new" boolean NOT NULL DEFAULT false,
	"best_seller" boolean NOT NULL DEFAULT false,
	"active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"deleted_at" timestamp
);

CREATE TABLE IF NOT EXISTS "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL DEFAULT '',
	"phone" text NOT NULL DEFAULT '',
	"address" text NOT NULL DEFAULT '',
	"notes" text NOT NULL DEFAULT '',
	"created_at" timestamp NOT NULL DEFAULT now(),
	"deleted_at" timestamp
);

CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL UNIQUE,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"email" text NOT NULL DEFAULT '',
	"phone" text NOT NULL DEFAULT '',
	"address" text NOT NULL DEFAULT '',
	"items" jsonb NOT NULL,
	"total" integer NOT NULL,
	"status" text NOT NULL DEFAULT 'Pendiente',
	"payment_status" text NOT NULL DEFAULT 'Pendiente',
	"notes" text NOT NULL DEFAULT '',
	"created_at" timestamp NOT NULL DEFAULT now(),
	"deleted_at" timestamp
);

CREATE TABLE IF NOT EXISTS "image_trash" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"url" text NOT NULL,
	"reason" text NOT NULL DEFAULT '',
	"deleted_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "content" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products" ("category");
CREATE INDEX IF NOT EXISTS "orders_created_idx" ON "orders" ("created_at");
