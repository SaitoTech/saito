CREATE TABLE IF NOT EXISTS store_categories (
  store_key TEXT NOT NULL,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  listing_order TEXT NOT NULL DEFAULT 'newest',
  PRIMARY KEY (store_key, category_id)
);
