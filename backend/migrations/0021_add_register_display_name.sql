ALTER TABLE registers
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);

UPDATE registers
   SET display_name = CASE WHEN code = 'REG-1' THEN 'الخزينة الرئيسية' ELSE code END
 WHERE display_name IS NULL OR BTRIM(display_name) = '';

ALTER TABLE registers
  ALTER COLUMN display_name SET NOT NULL,
  ALTER COLUMN display_name SET DEFAULT 'Register';
