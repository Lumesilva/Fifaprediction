
-- App-wide settings stored as a single-row config table
CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  negative_points_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the single row
INSERT INTO app_settings (id, negative_points_enabled) VALUES (1, false);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read settings
CREATE POLICY "select_app_settings" ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "select_app_settings_anon" ON app_settings FOR SELECT TO anon USING (true);

-- Only admins can update settings
CREATE POLICY "update_app_settings" ON app_settings FOR UPDATE TO authenticated
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()))
  WITH CHECK ((SELECT is_admin FROM profiles WHERE id = auth.uid()));
