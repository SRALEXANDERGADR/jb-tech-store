ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "variant_images" jsonb NOT NULL DEFAULT '[]';
