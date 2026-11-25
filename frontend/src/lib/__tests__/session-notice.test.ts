import { describe, expect, test } from 'vitest';
import { sessionNotice } from '@/lib/session-notice';

describe('sessionNotice (message shown on /login after a session ended)', () => {
  test('maps the known reasons to user-facing messages', () => {
    expect(sessionNotice('expired')).toBe('Your session has expired. Please sign in again.');
    expect(sessionNotice('deactivated')).toBe('Your account has been deactivated.');
  });

  test.each([[null], [undefined], [''], ['unknown'], ['<script>alert(1)</script>'], ['__proto__'], ['constructor'], ['toString']])(
    'ignores %s (never rendered, no prototype lookups)',
    (value) => {
      expect(sessionNotice(value as string | null | undefined)).toBeNull();
    }
  );
});
