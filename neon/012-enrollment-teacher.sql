ALTER TABLE course_enrollments ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES teachers(id);
