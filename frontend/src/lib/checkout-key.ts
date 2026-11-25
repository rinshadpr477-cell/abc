import { newIdempotencyKey } from '@/lib/utils';

export interface CartLineInput {
  productId: string;
  quantity: number;
}

export interface KeyHolder {
  sig: string;
  key: string;
}

/** Order-independent fingerprint of a cart (ids + quantities only; prices are never part of it). */
export function cartSignature(items: CartLineInput[]): string {
  return JSON.stringify([...items].map((i) => [i.productId.toLowerCase(), i.quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

/**
 * One Idempotency-Key per distinct cart. Retrying the SAME cart (double click, network retry, after a
 * stock error was fixed) reuses the key so the server can never create two orders; changing the cart
 * produces a new key, because the server rejects a key that is reused with a different cart.
 */
export function keyForCart(current: KeyHolder | null, items: CartLineInput[], makeKey: () => string = newIdempotencyKey): KeyHolder {
  const sig = cartSignature(items);
  return current && current.sig === sig ? current : { sig, key: makeKey() };
}
