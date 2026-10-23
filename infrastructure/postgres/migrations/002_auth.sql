CREATE TABLE auth_users (
  id uuid PRIMARY KEY,
  email text,
  display_name text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_external_identities (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id),
  provider text NOT NULL CHECK (provider = 'google'),
  issuer text NOT NULL,
  subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject)
);
CREATE TABLE auth_user_roles (
  user_id uuid NOT NULL REFERENCES auth_users(id),
  role text NOT NULL CHECK (role IN ('user', 'admin')),
  PRIMARY KEY (user_id, role)
);
CREATE TABLE auth_oauth_transactions (
  state_hash char(64) PRIMARY KEY,
  browser_hash char(64) NOT NULL,
  nonce text NOT NULL,
  verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE auth_role_audit (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id),
  action text NOT NULL CHECK (action IN ('grant', 'revoke')),
  role text NOT NULL CHECK (role = 'admin'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_oauth_transactions_expiry ON auth_oauth_transactions(expires_at);
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth_users(id),
  family_id uuid NOT NULL,
  token_hash char(64) NOT NULL UNIQUE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at <= absolute_expires_at)
);
CREATE INDEX auth_sessions_family ON auth_sessions(family_id);
CREATE INDEX auth_sessions_expiry ON auth_sessions(absolute_expires_at);
-- Nenhum admin e nenhuma senha são criados por login social. Papéis são operações offline explícitas.
-- Tokens Google e access JWT não são persistidos. Cookies opacos são guardados somente como hash.
