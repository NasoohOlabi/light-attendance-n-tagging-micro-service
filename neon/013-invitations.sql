ALTER TABLE app_accounts ADD COLUMN IF NOT EXISTS invitation_request_id uuid;
ALTER TABLE app_accounts ADD COLUMN IF NOT EXISTS invitation_username text;
ALTER TABLE app_accounts ADD COLUMN IF NOT EXISTS invitation_phone text;
ALTER TABLE app_accounts ADD COLUMN IF NOT EXISTS invitation_birth_date date;
ALTER TABLE app_accounts ADD COLUMN IF NOT EXISTS invitation_requires_setup boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS app_accounts_invitation_username_idx ON app_accounts (invitation_username);
CREATE INDEX IF NOT EXISTS app_accounts_invitation_request_idx ON app_accounts (invitation_request_id);
