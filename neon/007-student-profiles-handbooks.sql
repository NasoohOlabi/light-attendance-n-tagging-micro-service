ALTER TABLE students ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS birth_year integer;
ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS handbook_received boolean NOT NULL DEFAULT false;
