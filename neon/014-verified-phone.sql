ALTER TABLE app_accounts ADD COLUMN IF NOT EXISTS verified_phone text;
CREATE UNIQUE INDEX IF NOT EXISTS app_accounts_verified_phone_idx ON app_accounts (verified_phone);
