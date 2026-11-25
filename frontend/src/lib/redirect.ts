const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Returns a same-origin path (pathname + search + hash) for a post-login `?next=` value,
 * or `fallback` when the value is missing, malformed or could leave the application.
 *
 * Rejected on purpose:
 *  - protocol-relative targets ("//evil.com") and absolute URLs ("https://evil.com")
 *  - ANY backslash, raw or percent-encoded ("/\evil.com", "/%5Cevil.com"): URL parsers treat "\" like "/",
 *    so "/\evil.com" resolves to the external origin http://evil.com
 *  - control characters (tabs/newlines are silently stripped by URL parsers: "/\t/evil.com" -> "//evil.com")
 *  - anything that, once resolved against the current origin, lands on a different origin
 */
export function safeNextPath(raw: string | null | undefined, fallback: string, origin: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback;
  if (CONTROL_CHARS.test(raw)) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;

  // Inspect the value the way a router/browser would after decoding it once more.
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback; // malformed percent-encoding
  }
  if (raw.includes('\\') || decoded.includes('\\') || CONTROL_CHARS.test(decoded) || decoded.startsWith('//')) return fallback;

  try {
    const resolved = new URL(raw, origin);
    if (resolved.origin !== new URL(origin).origin) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}
