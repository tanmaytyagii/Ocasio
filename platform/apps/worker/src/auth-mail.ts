import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { Pool } from 'pg';
import type { Environment } from '@ocasio/contracts';
import { decryptMail, transaction } from '@ocasio/database';

type DeliveryState = 'idle' | 'sent' | 'retry' | 'dead';
interface ClaimedMail {
  id: string;
  encrypted_payload: string | null;
  attempts: number;
  state: 'processing' | 'dead';
  lock_token: string | null;
}

function isMailPayload(value: unknown): value is { to: string; subject: string; text: string } {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.to === 'string' && payload.to.trim().length > 0
    && !/[\r\n]/.test(payload.to)
    && typeof payload.subject === 'string' && payload.subject.trim().length > 0
    && !/[\r\n]/.test(payload.subject)
    && typeof payload.text === 'string' && payload.text.trim().length > 0;
}

/**
 * At-least-once SMTP delivery. A deterministic Message-ID is helpful but does
 * not establish exactly-once delivery when SMTP succeeds before a worker dies.
 * Never log a payload, recipient, link, token, credential or raw SMTP error.
 */
export async function processAuthMail(pool: Pool, config: Environment): Promise<DeliveryState> {
  if (!config.SMTP_HOST?.trim() || !config.MAIL_FROM?.trim()
    || /[\r\n]/.test(config.MAIL_FROM)
    || Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASSWORD)) {
    throw new Error('AUTH_MAIL_CONFIGURATION_INVALID');
  }

  const token = randomUUID();
  const mail = await transaction(pool, async (client): Promise<ClaimedMail | undefined> => {
    // One short transaction; external SMTP happens only after the lease commits.
    const result = await client.query<ClaimedMail>(
      `WITH candidate AS (
         SELECT id FROM auth_mail_queue
         WHERE (state = 'pending' AND available_at <= now())
            OR (state = 'processing' AND locked_until <= now())
         ORDER BY available_at, created_at, id
         FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE auth_mail_queue AS mail
       SET state = CASE WHEN mail.attempts >= 5 THEN 'dead' ELSE 'processing' END,
           attempts = CASE WHEN mail.attempts >= 5 THEN mail.attempts ELSE mail.attempts + 1 END,
           locked_until = CASE WHEN mail.attempts >= 5 THEN NULL ELSE now() + interval '2 minutes' END,
           lock_token = CASE WHEN mail.attempts >= 5 THEN NULL ELSE $1::uuid END,
           last_error_code = CASE WHEN mail.attempts >= 5 THEN 'AUTH_MAIL_ATTEMPTS_EXHAUSTED' ELSE NULL END
       FROM candidate WHERE mail.id = candidate.id
       RETURNING mail.id, mail.encrypted_payload, mail.attempts, mail.state, mail.lock_token`,
      [token],
    );
    return result.rows[0];
  });

  if (!mail) return 'idle';
  if (mail.state === 'dead') return 'dead';

  let payload: unknown;
  try {
    payload = await decryptMail(mail.encrypted_payload!, config.SESSION_SECRET);
    if (!isMailPayload(payload)) throw new Error('AUTH_MAIL_PAYLOAD_INVALID');
  } catch {
    // Corrupt/undecryptable messages will not recover through SMTP retries.
    const result = await pool.query(
      `UPDATE auth_mail_queue SET state = 'dead', locked_until = NULL, lock_token = NULL,
       last_error_code = 'AUTH_MAIL_PAYLOAD_INVALID'
       WHERE id = $1 AND state = 'processing' AND lock_token = $2`, [mail.id, token],
    );
    return result.rowCount === 1 ? 'dead' : 'retry';
  }

  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: config.NODE_ENV === 'production' && !config.SMTP_SECURE,
    ...(config.SMTP_USER && config.SMTP_PASSWORD
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    logger: false,
    debug: false,
  });

  try {
    await transport.sendMail({
      from: config.MAIL_FROM,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      messageId: `<auth-${mail.id}@ocasio.local>`,
    });
  } catch {
    const terminal = mail.attempts >= 5;
    // Only the holder of the current lease can reschedule this message.
    const result = await pool.query(
      `UPDATE auth_mail_queue
       SET state = $3, locked_until = NULL, lock_token = NULL,
           available_at = now() + make_interval(secs => $4),
           last_error_code = 'AUTH_MAIL_DELIVERY_FAILED'
       WHERE id = $1 AND state = 'processing' AND lock_token = $2`,
      [mail.id, token, terminal ? 'dead' : 'pending', Math.min(30 * 2 ** (mail.attempts - 1), 900)],
    );
    return result.rowCount === 1 && terminal ? 'dead' : 'retry';
  } finally {
    transport.close();
  }

  // Database failure here leaves the lease recoverable. SMTP may already have
  // delivered; a retry can duplicate delivery and must not be called exactly-once.
  const result = await pool.query(
    `UPDATE auth_mail_queue SET state = 'sent', sent_at = now(),
     encrypted_payload = NULL, locked_until = NULL, lock_token = NULL, last_error_code = NULL
     WHERE id = $1 AND state = 'processing' AND lock_token = $2`, [mail.id, token],
  );
  return result.rowCount === 1 ? 'sent' : 'retry';
}
