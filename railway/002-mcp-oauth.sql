-- Better Auth OAuth provider schema, matching @better-auth/oauth-provider 1.7.25.
CREATE TABLE IF NOT EXISTS neon_auth."oauthClient" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" text NOT NULL UNIQUE,
  "clientSecret" text,
  "clientDiscoveryId" text,
  "disabled" boolean,
  "skipConsent" boolean,
  "enableEndSession" boolean,
  "subjectType" text,
  "scopes" jsonb,
  "clientCredentialsScopes" jsonb,
  "userId" uuid REFERENCES neon_auth."user" ("id"),
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  "name" text,
  "uri" text,
  "icon" text,
  "contacts" jsonb,
  "tos" text,
  "policy" text,
  "softwareId" text,
  "softwareVersion" text,
  "softwareStatement" text,
  "redirectUris" jsonb NOT NULL,
  "postLogoutRedirectUris" jsonb,
  "backchannelLogoutUri" text,
  "backchannelLogoutSessionRequired" boolean,
  "tokenEndpointAuthMethod" text,
  "applicationType" text,
  "jwks" text,
  "jwksUri" text,
  "grantTypes" jsonb,
  "responseTypes" jsonb,
  "requirePKCE" boolean,
  "dpopBoundAccessTokens" boolean,
  "referenceId" text,
  "metadata" jsonb
);
CREATE INDEX IF NOT EXISTS "oauthClient_userId_idx" ON neon_auth."oauthClient" ("userId");
CREATE TABLE IF NOT EXISTS neon_auth."oauthResource" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "identifier" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "accessTokenTtl" integer,
  "refreshTokenTtl" integer,
  "signingAlgorithm" text,
  "signingKeyId" text,
  "allowedScopes" jsonb,
  "customClaims" jsonb,
  "dpopBoundAccessTokensRequired" boolean,
  "disabled" boolean,
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  "policyVersion" integer,
  "metadata" jsonb
);
CREATE TABLE IF NOT EXISTS neon_auth."oauthClientResource" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" text NOT NULL REFERENCES neon_auth."oauthClient" ("clientId") ON DELETE CASCADE,
  "resourceId" text NOT NULL REFERENCES neon_auth."oauthResource" ("identifier") ON DELETE CASCADE,
  "metadata" jsonb,
  "createdAt" timestamptz
);
CREATE INDEX IF NOT EXISTS "oauthClientResource_clientId_idx" ON neon_auth."oauthClientResource" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthClientResource_resourceId_idx" ON neon_auth."oauthClientResource" ("resourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "oauthClientResource_compound_0_idx" ON neon_auth."oauthClientResource" ("clientId", "resourceId");
CREATE TABLE IF NOT EXISTS neon_auth."oauthRefreshToken" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" text NOT NULL UNIQUE,
  "clientId" text NOT NULL REFERENCES neon_auth."oauthClient" ("clientId"),
  "sessionId" uuid REFERENCES neon_auth."session" ("id") ON DELETE SET NULL,
  "userId" uuid NOT NULL REFERENCES neon_auth."user" ("id"),
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" jsonb,
  "requestedUserInfoClaims" jsonb,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "revoked" timestamptz,
  "rotatedAt" timestamptz,
  "rotationReplayResponse" text,
  "rotationReplayExpiresAt" timestamptz,
  "authTime" timestamptz,
  "confirmation" jsonb,
  "scopes" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_clientId_idx" ON neon_auth."oauthRefreshToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_sessionId_idx" ON neon_auth."oauthRefreshToken" ("sessionId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_userId_idx" ON neon_auth."oauthRefreshToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_authorizationCodeId_idx" ON neon_auth."oauthRefreshToken" ("authorizationCodeId");
CREATE TABLE IF NOT EXISTS neon_auth."oauthAccessToken" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token" text NOT NULL UNIQUE,
  "clientId" text NOT NULL REFERENCES neon_auth."oauthClient" ("clientId"),
  "sessionId" uuid REFERENCES neon_auth."session" ("id") ON DELETE SET NULL,
  "userId" uuid REFERENCES neon_auth."user" ("id"),
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" jsonb,
  "requestedUserInfoClaims" jsonb,
  "refreshId" uuid REFERENCES neon_auth."oauthRefreshToken" ("id"),
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "revoked" timestamptz,
  "confirmation" jsonb,
  "scopes" jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx" ON neon_auth."oauthAccessToken" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_sessionId_idx" ON neon_auth."oauthAccessToken" ("sessionId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx" ON neon_auth."oauthAccessToken" ("userId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_authorizationCodeId_idx" ON neon_auth."oauthAccessToken" ("authorizationCodeId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_refreshId_idx" ON neon_auth."oauthAccessToken" ("refreshId");
CREATE TABLE IF NOT EXISTS neon_auth."oauthConsent" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "clientId" text NOT NULL REFERENCES neon_auth."oauthClient" ("clientId"),
  "userId" uuid REFERENCES neon_auth."user" ("id"),
  "referenceId" text,
  "resources" jsonb,
  "requestedUserInfoClaims" jsonb,
  "scopes" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_idx" ON neon_auth."oauthConsent" ("clientId");
CREATE INDEX IF NOT EXISTS "oauthConsent_userId_idx" ON neon_auth."oauthConsent" ("userId");
CREATE TABLE IF NOT EXISTS neon_auth."oauthClientAssertion" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "expiresAt" timestamptz NOT NULL
);
