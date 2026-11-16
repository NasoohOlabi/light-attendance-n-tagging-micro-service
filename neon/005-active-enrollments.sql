ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
