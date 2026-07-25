'use client';

import { createContext, useContext, useReducer, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { CartItem } from '@/types';
import { CartToast } from '@/components/ui/CartToast';
import { getTieredPrice } from '@/lib/utils';

interface CartState {
  items: CartItem[];
  // True once LOAD has run — until then `items` is just the initial empty
  // array, not the customer's real cart. Consumers that redirect on an
  // empty cart (checkout) must wait for this.
  hydrated: boolean;
}

type CartAction =
  | { type: 'ADD_ITEM'; payload: CartItem }
  | { type: 'REMOVE_ITEM'; payload: string }
  | { type: 'UPDATE_QUANTITY'; payload: { variantId: string; quantity: number } }
  | { type: 'CLEAR' }
  | { type: 'LOAD'; payload: CartItem[] };

// Clamps to the variant's stock ceiling AND its MOQ floor — a bulk-only SKU
// can't be dragged below its minimum order quantity from the cart, same as
// the PDP's quantity stepper (AddToCartPanel). Either bound is optional:
// carts saved before stock/moq were tracked have neither, and the backend
// re-validates both at order creation regardless.
function clampQuantity(quantity: number, stock: number | undefined, moq: number | undefined): number {
  const min = moq && moq > 1 ? moq : 1;
  const clamped = Math.max(min, quantity);
  return stock != null ? Math.min(clamped, stock) : clamped;
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find((i) => i.variantId === action.payload.variantId);
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            i.variantId === action.payload.variantId
              // Clamp the merged quantity to the variant's stock/moq so
              // repeated adds can't push the line past what's actually
              // available, or back under its purchase floor.
              ? {
                  ...i,
                  quantity: clampQuantity(i.quantity + action.payload.quantity, action.payload.stock ?? i.stock, action.payload.moq ?? i.moq),
                  moq: action.payload.moq ?? i.moq,
                  priceTiers: action.payload.priceTiers ?? i.priceTiers,
                }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.payload, quantity: clampQuantity(action.payload.quantity, action.payload.stock, action.payload.moq) }],
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter((i) => i.variantId !== action.payload) };
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: state.items.map((i) =>
          i.variantId === action.payload.variantId
            ? { ...i, quantity: clampQuantity(action.payload.quantity, i.stock, i.moq) }
            : i
        ),
      };
    case 'CLEAR':
      return { ...state, items: [] };
    case 'LOAD':
      return { items: action.payload, hydrated: true };
  }
}

interface CartContextType {
  items: CartItem[];
  // See CartState.hydrated.
  hydrated: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], hydrated: false });
  const [toastItem, setToastItem] = useState<{ code: string; name: string; key: number } | null>(null);
  const toastKeyRef = useRef(0);

  useEffect(() => {
    // Always dispatch LOAD — even with nothing saved — so `hydrated` flips
    // and consumers know the (possibly empty) cart is now the real one.
    let items: CartItem[] = [];
    const saved = localStorage.getItem('ascend-cart');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Pre-rework carts were keyed by `productId` (a flat product row's
        // own id) — the parent/variant migration preserved every row's id
        // as-is when it became a ProductVariant, so an old saved id is still
        // a perfectly valid variantId. Silently upgrade the shape on load
        // rather than requiring a version bump or discarding the cart.
        items = parsed.map((item: CartItem & { productId?: string }) => ({
          ...item,
          variantId: item.variantId ?? item.productId,
        }));
      } catch {}
    }
    dispatch({ type: 'LOAD', payload: items });
  }, []);

  useEffect(() => {
    localStorage.setItem('ascend-cart', JSON.stringify(state.items));
  }, [state.items]);

  // Uses each line's own tiered price at its current quantity where
  // priceTiers were captured at add-to-cart time — display-only estimate,
  // same caveat as getTieredPrice's docstring (the order response's total is
  // the real one).
  const total = state.items.reduce((sum, i) => sum + getTieredPrice(i.priceTiers, i.quantity, i.price) * i.quantity, 0);
  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: 'ADD_ITEM', payload: item });
    toastKeyRef.current += 1;
    setToastItem({ code: item.code, name: item.name, key: toastKeyRef.current });
  }, []);

  const clearToast = useCallback(() => setToastItem(null), []);

  return (
    <CartContext value={{
      items: state.items,
      hydrated: state.hydrated,
      addItem,
      removeItem: (id) => dispatch({ type: 'REMOVE_ITEM', payload: id }),
      updateQuantity: (id, qty) => dispatch({ type: 'UPDATE_QUANTITY', payload: { variantId: id, quantity: qty } }),
      clearCart: () => dispatch({ type: 'CLEAR' }),
      total,
      itemCount,
    }}>
      {children}
      <CartToast item={toastItem} onDone={clearToast} />
    </CartContext>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
