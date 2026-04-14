-- Adds columns that exist in the codebase but were never captured in a migration file.
-- Safe to run multiple times (uses IF NOT EXISTS throughout).

-- Acquisition metadata (referenced in actions.ts, InventoryClient, GuestView)
ALTER TABLE items ADD COLUMN IF NOT EXISTS sticker_price         numeric;
ALTER TABLE items ADD COLUMN IF NOT EXISTS acquired_market_price  numeric;
ALTER TABLE items ADD COLUMN IF NOT EXISTS acquired_date          timestamptz;

-- Sealed product fields (from 20240415_sealed_products.sql — add here too for safety)
ALTER TABLE items ADD COLUMN IF NOT EXISTS product_type  text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS quantity      integer NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN IF NOT EXISTS language      text    NOT NULL DEFAULT 'english';

-- Image flag (from 20240420_card_images.sql — add here too for safety)
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_flagged boolean NOT NULL DEFAULT false;

-- cert_number may also be missing depending on when the table was created
ALTER TABLE items ADD COLUMN IF NOT EXISTS cert_number   text;
