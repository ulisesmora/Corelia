import type { Dict } from "./types";

export const nav: Record<"es" | "en", Dict> = {
  es: {
    brandAltScrolled: "{studio}",
    brandAltDefault: "{studio}",
    languageLabel: "Idioma / Language",
    drawer: { title: "Menú" },
    items: {
      home: { label: "Inicio", href: "/" },
      project: { label: "Nuestro Proyecto", href: "#our-project" },
      classes: { label: "Clases", href: "/classes" }, 

      prices: { label: "Precio", href: "/prices" },
      calendar: { label: "Calendario", href: "/calendar" },// cambia a /clases si quieres
      events: { label: "Eventos", href: "#events" },
    },
    cta: { contact: "Contacto", href: "#contact" },
    a11y: { toggleNav: "Abrir o cerrar el menú", language: "Idioma", mainNav: "Navegación principal" },
  },
  en: {
    brandAltScrolled: "{studio}",
    brandAltDefault: "{studio}",
    languageLabel: "Idioma / Language",
    drawer: { title: "Menu" },
    items: {
      home: { label: "Home", href: "/en" },
      project: { label: "Our Project", href: "#our-project" },
      classes: { label: "Classes", href: "/en/classes" },
      events: { label: "Events", href: "#events" },
      calendar: { label: "Calendar", href: "/calendar" },
      prices: { label: "Prices", href: "/prices" },
    },
    cta: { contact: "Contact", href: "#contact" },
    a11y: { toggleNav: "Open or close the menu", language: "Language", mainNav: "Main navigation" },
  },
};
