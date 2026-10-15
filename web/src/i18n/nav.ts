import type { Dict } from "./types";

// Navegación de la web: 5 enlaces principales + «Reservar clase» (Navbar.tsx).
// El resto de páginas (promociones, legales…) va en «Más» (menú del móvil y pie).
export const nav: Record<"es" | "en", Dict> = {
  es: {
    brandAltScrolled: "{studio}",
    brandAltDefault: "{studio}",
    languageLabel: "Idioma / Language",
    drawer: { title: "Menú", more: "Más" },
    items: {
      home: { label: "Inicio", href: "/" },
      classes: { label: "Clases", href: "/classes" },
      calendar: { label: "Horario", href: "/calendar" },
      prices: { label: "Precios", href: "/prices" },
      studio: { label: "Equipo", href: "/estudio" },
      contact: { label: "Contacto", href: "/contacto" },
      faq: { label: "Preguntas frecuentes", href: "/contacto#faq" },
      promos: { label: "Promociones", href: "/promociones" },
      terms: { label: "Términos y condiciones", href: "/terminos-condiciones" },
      cookies: { label: "Cookies", href: "/cookies" },
      // Claves antiguas que aún leen otros componentes
      project: { label: "El estudio", href: "/estudio" },
      events: { label: "Horario", href: "/calendar" },
    },
    cta: { contact: "Contacto", href: "/contacto", book: "Reservar clase", account: "Mi cuenta", cart: "Ver mi reserva" },
    a11y: { toggleNav: "Abrir o cerrar el menú", language: "Idioma", mainNav: "Navegación principal", cart: "Clases elegidas" },
  },
  en: {
    brandAltScrolled: "{studio}",
    brandAltDefault: "{studio}",
    languageLabel: "Idioma / Language",
    drawer: { title: "Menu", more: "More" },
    items: {
      home: { label: "Home", href: "/en" },
      classes: { label: "Classes", href: "/en/classes" },
      calendar: { label: "Timetable", href: "/calendar" },
      prices: { label: "Prices", href: "/en/prices" },
      studio: { label: "Team", href: "/en/studio" },
      contact: { label: "Contact", href: "/en/contact" },
      faq: { label: "FAQ", href: "/en/contact#faq" },
      promos: { label: "Promotions", href: "/en/promotions-terms" },
      terms: { label: "Terms and conditions", href: "/en/terms-conditions" },
      cookies: { label: "Cookies", href: "/en/cookies" },
      project: { label: "The studio", href: "/en/studio" },
      events: { label: "Timetable", href: "/calendar" },
    },
    cta: { contact: "Contact", href: "/en/contact", book: "Book a class", account: "My account", cart: "View my booking" },
    a11y: { toggleNav: "Open or close the menu", language: "Language", mainNav: "Main navigation", cart: "Selected classes" },
  },
};
