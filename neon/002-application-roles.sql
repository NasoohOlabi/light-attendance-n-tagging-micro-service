CREATE TABLE IF NOT EXISTS app_accounts (
  auth_user_id text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('administrator', 'teacher', 'student')),
  teacher_id uuid UNIQUE REFERENCES teachers(id),
  student_id uuid UNIQUE REFERENCES students(id),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  CHECK ((role IN ('administrator', 'teacher') AND teacher_id IS NOT NULL AND student_id IS NULL)
      OR (role = 'student' AND student_id IS NOT NULL AND teacher_id IS NULL))
);
INSERT INTO app_accounts (auth_user_id, role, teacher_id)
SELECT auth_user_id, 'teacher', id FROM teachers ON CONFLICT DO NOTHING;
REVOKE ALL ON TABLE app_accounts FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE app_accounts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE app_accounts FROM authenticated;
  END IF;
END $$;
