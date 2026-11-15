CREATE SCHEMA IF NOT EXISTS neon_auth;
CREATE TABLE IF NOT EXISTS neon_auth."user" (
  id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false, image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS neon_auth.account (
  id uuid PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
  scope text, password text, "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON neon_auth.account ("userId");
CREATE TABLE IF NOT EXISTS neon_auth.session (
  id uuid PRIMARY KEY, "expiresAt" timestamptz NOT NULL, token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text, "userAgent" text,
  "userId" uuid NOT NULL REFERENCES neon_auth."user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON neon_auth.session ("userId");
CREATE TABLE IF NOT EXISTS neon_auth.verification (
  id uuid PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
  "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON neon_auth.verification (identifier);
-- Better Auth's UUID mode delegates ID creation to Postgres.
ALTER TABLE neon_auth."user" ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE neon_auth.account ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE neon_auth.session ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE neon_auth.verification ALTER COLUMN id SET DEFAULT gen_random_uuid();
