ALTER TABLE courses ADD COLUMN IF NOT EXISTS attendance_minimum double precision NOT NULL DEFAULT 70 CHECK (attendance_minimum BETWEEN 0 AND 100);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS practical_minimum double precision NOT NULL DEFAULT 80 CHECK (practical_minimum BETWEEN 0 AND 100);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS theory_minimum double precision NOT NULL DEFAULT 80 CHECK (theory_minimum BETWEEN 0 AND 100);
