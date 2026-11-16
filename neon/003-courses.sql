CREATE TABLE IF NOT EXISTS courses (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200)
);
CREATE TABLE IF NOT EXISTS course_enrollments (
  id uuid PRIMARY KEY,
  course_id uuid NOT NULL REFERENCES courses(id),
  student_id uuid NOT NULL REFERENCES students(id),
  level text NOT NULL DEFAULT '' CHECK (length(level) <= 200),
  practical numeric CHECK (practical BETWEEN 0 AND 100),
  theory numeric CHECK (theory BETWEEN 0 AND 100),
  UNIQUE (course_id, student_id),
  UNIQUE (id, student_id)
);
ALTER TABLE events ADD COLUMN IF NOT EXISTS enrollment_id uuid;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_enrollment_student_fk' AND conrelid = 'events'::regclass) THEN
    ALTER TABLE events ADD CONSTRAINT events_enrollment_student_fk FOREIGN KEY (enrollment_id, student_id) REFERENCES course_enrollments(id, student_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_attendance_enrollment_check' AND conrelid = 'events'::regclass) THEN
    ALTER TABLE events ADD CONSTRAINT events_attendance_enrollment_check CHECK (
      payload->>'kind' <> 'attendance' OR (payload->>'enrollmentId') IS NOT DISTINCT FROM enrollment_id::text
    );
  END IF;
END $$;
REVOKE ALL ON TABLE courses, course_enrollments FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE courses, course_enrollments FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE courses, course_enrollments FROM authenticated;
  END IF;
END $$;
