/**
 * Checks that a signing secret is not a publicly known placeholder or an obviously weak value.
 * Returns a list of short reasons. Reasons never contain the secret itself.
 */
const KNOWN_PLACEHOLDERS = new Set([
  // Values shipped in backend/.env.example (public on GitHub).
  'change-me-access-secret-at-least-32-characters',
  'change-me-refresh-secret-at-least-32-characters',
]);

const PLACEHOLDER_PREFIXES = [
  'change-me', 'changeme', 'change_me', 'replace-me', 'replaceme', 'replace_me',
  'your-', 'your_', 'example', 'placeholder', 'default', 'secret', 'password', 'test-', 'test_',
];

const PLACEHOLDER_WORDS = /change-?me|placeholder|example|replace-?me|your-secret|todo/i;

const MIN_LENGTH = 32;
const MIN_UNIQUE_CHARS = 12;

function assessSecret(value) {
  const reasons = [];
  if (typeof value !== 'string' || value.length < MIN_LENGTH) {
    reasons.push(`must be at least ${MIN_LENGTH} characters`);
    return reasons;
  }
  const lower = value.toLowerCase();
  if (KNOWN_PLACEHOLDERS.has(lower)) reasons.push('is a publicly known example value');
  if (PLACEHOLDER_PREFIXES.some((p) => lower.startsWith(p))) reasons.push('starts with a placeholder prefix');
  if (PLACEHOLDER_WORDS.test(value)) reasons.push('contains placeholder wording');
  if (new Set(value).size < MIN_UNIQUE_CHARS) reasons.push(`is too repetitive (needs at least ${MIN_UNIQUE_CHARS} different characters)`);
  return [...new Set(reasons)];
}

module.exports = { assessSecret, MIN_LENGTH };
