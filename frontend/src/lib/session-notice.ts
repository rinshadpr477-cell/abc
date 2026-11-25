/**
 * Why the user was sent to /login. `sessionExpired()` ends the session with a FULL page load (to drop
 * all in-memory state), which would discard any toast shown just before it. So the reason travels in the
 * URL (`/login?next=…&reason=expired`) and the login page shows it.
 */
export type SessionReason = 'expired' | 'deactivated';

const NOTICES: Record<SessionReason, string> = {
  expired: 'Your session has expired. Please sign in again.',
  deactivated: 'Your account has been deactivated.',
};

/** Returns the message for a known reason, otherwise null (unknown values are ignored, never rendered). */
export function sessionNotice(reason: string | null | undefined): string | null {
  return reason && Object.prototype.hasOwnProperty.call(NOTICES, reason) ? NOTICES[reason as SessionReason] : null;
}
