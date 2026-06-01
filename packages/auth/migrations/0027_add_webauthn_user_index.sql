-- webauthn_credentials(user_id): the FK declared in 0004_add_webauthn.sql
-- was never indexed. Every login does a "do you have any passkeys?" lookup
-- keyed by user_id (login.ts), and the passkey register flow + the settings
-- credential list + the MFA gate all filter by user_id too. Without this each
-- one forces a full scan of every user's credentials.
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON webauthn_credentials(user_id);
