import { describe, expect, test } from 'vitest';
import { cartSignature, keyForCart, type KeyHolder } from '@/lib/checkout-key';

const A = '507f1f77bcf86cd799439011';
const B = '507f1f77bcf86cd799439012';

let counter = 0;
const makeKey = () => `key-${++counter}`;

describe('checkout idempotency key', () => {
  test('creates a key for the first attempt', () => {
    const holder = keyForCart(null, [{ productId: A, quantity: 1 }], makeKey);
    expect(holder.key).toMatch(/^key-\d+$/);
  });

  test('retrying the SAME cart reuses the key (double click / network retry)', () => {
    const items = [{ productId: A, quantity: 2 }, { productId: B, quantity: 1 }];
    const first = keyForCart(null, items, makeKey);
    const retry = keyForCart(first, items, makeKey);
    const again = keyForCart(retry, items, makeKey);
    expect(retry.key).toBe(first.key);
    expect(again.key).toBe(first.key);
  });

  test('the same cart in a different line order still reuses the key', () => {
    const first = keyForCart(null, [{ productId: A, quantity: 2 }, { productId: B, quantity: 1 }], makeKey);
    const reordered = keyForCart(first, [{ productId: B, quantity: 1 }, { productId: A, quantity: 2 }], makeKey);
    expect(reordered.key).toBe(first.key);
  });

  test('changing a quantity, adding or removing a product creates a NEW key', () => {
    const base = [{ productId: A, quantity: 2 }];
    const first = keyForCart(null, base, makeKey);
    expect(keyForCart(first, [{ productId: A, quantity: 3 }], makeKey).key).not.toBe(first.key);
    expect(keyForCart(first, [...base, { productId: B, quantity: 1 }], makeKey).key).not.toBe(first.key);
    expect(keyForCart(first, [{ productId: B, quantity: 2 }], makeKey).key).not.toBe(first.key);
  });

  test('after a successful order the holder is cleared, so the next order gets a fresh key', () => {
    const items = [{ productId: A, quantity: 1 }];
    const first = keyForCart(null, items, makeKey);
    const afterSuccess: KeyHolder | null = null; // the checkout page sets keyRef.current = null on success
    expect(keyForCart(afterSuccess, items, makeKey).key).not.toBe(first.key);
  });

  test('a failed attempt (e.g. insufficient stock) keeps the key so the retry is idempotent', () => {
    const items = [{ productId: A, quantity: 5 }];
    const first = keyForCart(null, items, makeKey);
    // the page does not clear the holder on failure; the user retries with the same cart
    expect(keyForCart(first, items, makeKey).key).toBe(first.key);
  });

  test('the signature contains ids and quantities only, never prices or totals', () => {
    const sig = cartSignature([{ productId: A.toUpperCase(), quantity: 2 }]);
    expect(sig).toBe(JSON.stringify([[A, 2]]));
    expect(sig).not.toMatch(/price|total|name/i);
  });
});
