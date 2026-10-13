"use client";

import { createContext, createElement, useContext, type ComponentType, type ReactNode } from "react";
import { useHydrated } from "../../utils/useHydrated";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lang = "es" | "en";

type LangState = {
  lang: Lang;
  hasHydrated: boolean;
  /** Cambia idioma y sincroniza <html lang>. */
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** Inicializa sólo si aún NO hidrató (primera vez). */
  initLang: (initial?: Lang) => void;
};

const syncHtmlLang = (lang: Lang) => {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", lang);
    // Título de la pestaña: las páginas que lo tienen en los dos idiomas
    // publican <meta name="site:title-es|en"> (ver OptimizedHead.astro).
    const meta = document.querySelector<HTMLMetaElement>(`meta[name="site:title-${lang}"]`);
    if (meta?.content) document.title = meta.content;
  }
};

const useLangStoreBase = create<LangState>()(
  persist(
    (set, get) => ({
      lang: "es",
      hasHydrated: false,

      setLang: (lang) => {
        set({ lang });
        syncHtmlLang(lang);
      },

      toggleLang: () => {
        const next = get().lang === "es" ? "en" : "es";
        set({ lang: next });
        syncHtmlLang(next);
      },

      initLang: (initial) => {
        // Sólo si todavía NO se ha hidratado desde storage
        if (get().hasHydrated) {
          // Ya hay un valor real rehidratado → sólo sincroniza <html lang>
          syncHtmlLang(get().lang);
          return;
        }
        // Si te pasan initial, úsalo; si no, detecta por navegador
        const guess: Lang =
          initial ??
          ((typeof navigator !== "undefined" &&
            (navigator.language || "").toLowerCase().startsWith("en"))
            ? "en"
            : "es");
        set({ lang: guess });
        syncHtmlLang(guess);
      },
    }),
    {
      name: "site.lang", // clave localStorage
      version: 1,
      partialize: (s) => ({ lang: s.lang }),

      // Se llama antes y después de rehidratar
      onRehydrateStorage: () => {
        // before rehydrate (opcional)
        return (state, error) => {
          // after rehydrate
          // ✅ usa la API del store para marcar hidratado y sincronizar <html lang>
          useLangStoreBase.setState({ hasHydrated: true });
          const cur = useLangStoreBase.getState().lang;
          syncHtmlLang(cur);
          if (error) {
            console.error("Error rehydrating language store:", error);
          }
        };
      },
    }
  )
);

// ── Idioma en el render del servidor ───────────────────────────────────────
// Las islas que se renderizan en el servidor (portada, precios…) reciben el
// idioma de la página (`lang`) y lo usan en el HTML del servidor Y en el
// primer render del navegador (hidratación), para que coincidan. Después
// manda el idioma guardado de la usuaria (zustand + localStorage).

const LangSsrContext = createContext<Lang | null>(null);

/** Proveedor del idioma de la página para las islas renderizadas en servidor. */
export function LangSsrProvider({ lang, children }: { lang?: Lang | null; children?: ReactNode }) {
  return createElement(LangSsrContext.Provider, { value: lang ?? null }, children);
}

/** HOC: la isla acepta `lang` (idioma de la página) y lo provee a sus hijos. */
export function withSsrLang<P extends object>(Component: ComponentType<P>) {
  const Wrapped = (props: P & { lang?: Lang }) => {
    const { lang, ...rest } = props as P & { lang?: Lang };
    return createElement(LangSsrProvider, { lang }, createElement(Component, rest as P));
  };
  Wrapped.displayName = `withSsrLang(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped;
}

type LangHook = {
  (): LangState;
  <T>(selector: (s: LangState) => T): T;
} & typeof useLangStoreBase;

function useLangStoreSsrAware<T>(selector?: (s: LangState) => T) {
  const ssrLang = useContext(LangSsrContext);
  const hydrated = useHydrated();
  const sel = (selector ?? ((s: LangState) => s as unknown as T)) as (s: LangState) => T;
  const value = useLangStoreBase(sel);
  if (ssrLang && !hydrated) return sel({ ...useLangStoreBase.getState(), lang: ssrLang });
  return value;
}

/** Store del idioma (mismo API que zustand: getState, setState, persist…). */
export const useLangStore = Object.assign(useLangStoreSsrAware, useLangStoreBase) as LangHook;

/** Hook helper por si quieres evitar flicker antes de hidratado */
export const useLangHydrated = () => useLangStore((s) => s.hasHydrated);
