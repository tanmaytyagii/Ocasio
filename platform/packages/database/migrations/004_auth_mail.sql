-- Transactional authentication-mail delivery. Ciphertext contains sensitive links.
-- No public access is granted. Retention/replay policy for dead rows remains open.
CREATE TABLE auth_mail_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_payload text,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'processing', 'sent', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  lock_token uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code IN (
    'AUTH_MAIL_PAYLOAD_INVALID', 'AUTH_MAIL_DELIVERY_FAILED', 'AUTH_MAIL_ATTEMPTS_EXHAUSTED'
  )),
  CONSTRAINT auth_mail_ciphertext_lifecycle CHECK (
    (state = 'sent' AND encrypted_payload IS NULL)
    OR (state <> 'sent' AND encrypted_payload IS NOT NULL AND length(encrypted_payload) > 0)
  ),
  CONSTRAINT auth_mail_lease_lifecycle CHECK (
    (state = 'processing' AND locked_until IS NOT NULL AND lock_token IS NOT NULL)
    OR (state <> 'processing' AND locked_until IS NULL AND lock_token IS NULL)
  ),
  CONSTRAINT auth_mail_sent_lifecycle CHECK (
    (state = 'sent' AND sent_at IS NOT NULL)
    OR (state <> 'sent' AND sent_at IS NULL)
  )
);

CREATE INDEX auth_mail_pending_delivery
  ON auth_mail_queue (available_at, created_at, id) WHERE state = 'pending';
CREATE INDEX auth_mail_expired_lease
  ON auth_mail_queue (locked_until, created_at, id) WHERE state = 'processing';
