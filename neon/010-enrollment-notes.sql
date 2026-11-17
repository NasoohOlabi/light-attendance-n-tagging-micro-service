ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
