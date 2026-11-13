CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY,
  auth_user_id text NOT NULL UNIQUE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  active boolean NOT NULL DEFAULT true,
  access_mode text NOT NULL CHECK (access_mode IN ('read_write', 'read_only', 'write_only')),
  expires_at timestamptz
);
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  teacher_id uuid NOT NULL REFERENCES teachers(id),
  group_name text NOT NULL DEFAULT '' CHECK (length(group_name) <= 100),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  teacher_id uuid NOT NULL REFERENCES teachers(id),
  student_id uuid NOT NULL REFERENCES students(id),
  actor text NOT NULL,
  client_time timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS students_teacher_active_idx ON students(teacher_id, active);
CREATE INDEX IF NOT EXISTS events_teacher_sequence_idx ON events(teacher_id, sequence);
REVOKE ALL ON TABLE teachers, students, events FROM PUBLIC;
REVOKE ALL ON SEQUENCE events_sequence_seq FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE teachers, students, events FROM anon;
    REVOKE ALL ON SEQUENCE events_sequence_seq FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE teachers, students, events FROM authenticated;
    REVOKE ALL ON SEQUENCE events_sequence_seq FROM authenticated;
  END IF;
END $$;
