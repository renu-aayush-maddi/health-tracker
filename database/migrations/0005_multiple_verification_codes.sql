-- 0005: keep the few most recent verification codes valid instead of only the latest.
-- Emails can arrive late or out of order; a code from an earlier email should still work
-- while it is within its 10-minute lifetime. The service keeps at most 3 per user.

ALTER TABLE email_verification_codes DROP CONSTRAINT email_verification_codes_user_id_key;
CREATE INDEX email_verification_codes_user_idx ON email_verification_codes (user_id, created_at DESC);
