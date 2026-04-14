-- Sealed product metadata columns — run in the Supabase SQL editor
-- Adds product_type, quantity, and language to items table

ALTER TABLE items ADD COLUMN IF NOT EXISTS product_type text;   -- 'booster_box' | 'etb' | 'tin' | 'collection_box' | 'bundle' | 'booster_pack' | 'promo_box' | 'other'
ALTER TABLE items ADD COLUMN IF NOT EXISTS quantity    integer NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS language    text    NOT NULL DEFAULT 'english';
