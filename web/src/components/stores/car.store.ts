// src/stores/cart.store.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Define la estructura de un item en el carrito.
 */
export interface CartItem {
  id: string; // ID único (ej: "claseId_timestamp")
  title: string;
  /** Título en inglés (de `title_en` de la API) — se pinta según el idioma actual. */
  title_en?: string;
  credits: number; // Ej: 1
  image: string | null;
  sessionDate: Date; // El objeto Date de la sesión
  sessionDateEnd: Date;
  id_session: number;
  id_source: number;
  price: number;
}

/**
 * Define el estado y las acciones del store.
 */
interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        // Evita añadir la misma clase en la misma hora dos veces
        if (get().items.some(existing => existing.id === item.id)) {
          console.warn("Este item ya está en el carrito.");
          return;
        }
        set((state) => ({
          items: [...state.items, item],
        }));
      },

      removeItem: (itemId) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== itemId),
        }));
      },

      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'site-cart-storage',
      storage: createJSONStorage(() => localStorage),

      // Zustand v5: usar onRehydrateStorage para convertir strings de fecha
      // (JSON no preserva Date) de vuelta a objetos Date y normalizar números.
      // Las antiguas opciones `serialize`/`deserialize` fueron removidas en v4+.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.items = state.items.map((item: any) => ({
          ...item,
          sessionDate: new Date(item.sessionDate),
          sessionDateEnd: item.sessionDateEnd
            ? new Date(item.sessionDateEnd)
            : new Date(item.sessionDate),
          price: Number(item.price) || 0,
          credits: Number(item.credits) || 0,
          id_session: Number(item.id_session) || 0,
          id_source: Number(item.id_source) || 0,
        }));
      },
    }
  )
);
