ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS grade_decisions jsonb NOT NULL DEFAULT '[]'::jsonb;
