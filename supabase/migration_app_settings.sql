-- App-wide key/value settings store.
-- Each setting is identified by a unique key.

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: only authenticated users can read/write
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON app_settings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upsert settings"
  ON app_settings FOR ALL
  USING (auth.role() = 'authenticated');

-- Seed default: invoice on the 1st of each month
INSERT INTO app_settings (key, value)
VALUES ('retainer_invoice_day', '1')
ON CONFLICT (key) DO NOTHING;
