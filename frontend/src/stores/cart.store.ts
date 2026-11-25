import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * The cart stores ONLY product ids and quantities. Names, prices and stock are always
 * re-fetched from the API for display and are recomputed by the backend at checkout.
 */
export interface CartLine {
  productId: string;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const MAX_QTY = 1000;
const clampQty = (q: number) => Math.min(MAX_QTY, Math.max(1, Math.floor(q) || 1));

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (productId, quantity = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.productId === productId);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.productId === productId ? { ...l, quantity: clampQty(l.quantity + quantity) } : l
              ),
            };
          }
          return { lines: [...s.lines, { productId, quantity: clampQty(quantity) }] };
        }),
      setQuantity: (productId, quantity) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.productId === productId ? { ...l, quantity: clampQty(quantity) } : l)),
        })),
      remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: 'abc-ecommerce-cart',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ lines: s.lines.map(({ productId, quantity }) => ({ productId, quantity })) }),
    }
  )
);

export const selectCartCount = (s: CartState) => s.lines.reduce((n, l) => n + l.quantity, 0);
