import { describe, expect, test } from 'vitest';
import { safeNextPath } from '@/lib/redirect';

const ORIGIN = 'http://localhost:3100';
const FALLBACK = '/home-fallback';
const run = (raw: string | null | undefined) => safeNextPath(raw, FALLBACK, ORIGIN);

describe('safeNextPath (post-login ?next= validation)', () => {
  test.each([
    ['/admin', '/admin'],
    ['/products', '/products'],
    ['/', '/'],
    ['/orders/abc123', '/orders/abc123'],
    ['/products/abc%20def', '/products/abc%20def'], // valid encoded internal path
    ['/?search=a%20b&page=2', '/?search=a%20b&page=2'],
    ['/admin/products?status=ACTIVE#top', '/admin/products?status=ACTIVE#top'],
    ['/orders%2Fabc', '/orders%2Fabc'], // encoded slash inside a segment is still same-origin
  ])('keeps valid internal destination %s', (input, expected) => {
    expect(run(input)).toBe(expected);
  });

  test.each([
    ['protocol-relative', '//evil.com'],
    ['protocol-relative with path', '//evil.com/login'],
    ['backslash host', '/\\evil.com'],
    ['backslash + slash', '/\\/evil.com'],
    ['encoded backslash', '/%5Cevil.com'],
    ['encoded backslash (lowercase)', '/%5cevil.com'],
    ['backslash in the middle', '/ok\\..\\evil.com'],
    ['absolute https', 'https://evil.com'],
    ['absolute http', 'http://evil.com/path'],
    ['absolute same host (must be a path, not a URL)', 'http://localhost:3100/admin'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['relative without slash', 'evil.com'],
    ['tab hidden slash', '/\t/evil.com'],
    ['newline hidden slash', '/\n/evil.com'],
    ['carriage return', '/\r/evil.com'],
    ['null byte', '/%00'.replace('%00', '\u0000')],
    ['encoded protocol-relative', '/%2F%2Fevil.com'],
    ['malformed percent-encoding', '/%E0%A4%A'],
    ['dangling percent', '/%'],
    ['empty string', ''],
    ['only whitespace', '   '],
    ['too long', '/' + 'a'.repeat(3000)],
  ])('rejects %s', (_label, input) => {
    expect(run(input)).toBe(FALLBACK);
  });

  test.each([[null], [undefined]])('uses the fallback for %s', (input) => {
    expect(run(input)).toBe(FALLBACK);
  });

  test('every accepted result resolves to the application origin (never external)', () => {
    const inputs = ['/admin', '/a/../b', '/x?y=//evil.com', '/x#//evil.com', '/%2e%2e/admin', '/a%20b'];
    for (const i of inputs) {
      const out = run(i);
      expect(new URL(out, ORIGIN).origin).toBe(ORIGIN);
    }
  });

  test('a query string that merely CONTAINS a URL does not make the destination external', () => {
    expect(run('/x?next=https://evil.com')).toBe('/x?next=https://evil.com');
  });

  test('the original vulnerable guard accepted /\\evil.com and it resolves externally (regression proof)', () => {
    const vulnerable = (n: string) => n.startsWith('/') && !n.startsWith('//');
    const payload = '/\\evil.com';
    expect(vulnerable(payload)).toBe(true); // old check let it through
    expect(new URL(payload, ORIGIN).origin).toBe('http://evil.com'); // ...to an external origin
    expect(run(payload)).toBe(FALLBACK); // new check blocks it
  });

  test('a different origin argument is respected', () => {
    expect(safeNextPath('/shop', FALLBACK, 'https://shop.example.com')).toBe('/shop');
  });
});
