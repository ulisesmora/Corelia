import * as React from "react";
import type { Dict, Params } from "./types";// o ruta relativa
import { nav } from "./nav";
import { useLangStore } from '../components/stores/lang.store';
import { getSiteClient } from '../lib/site';

// Tus textos existentes (los mantengo tal cual):
export const baseDict: Record<ReturnType<typeof getLangConst>, Dict> = {
  es: {
    common: {
      bookNow: "Reservar ahora", back: "volver",
      prev: "Anterior", next: "Siguiente",
      slideAlt: "Foto {n} del estudio",
      unknownError: "Ha ocurrido un error inesperado.",
      errorTitle: "¡Ups! Algo salió mal",
      loadClassesError: "No se pudieron cargar las clases.",
    },
    links: { terms: '/terminos-condiciones', promo: '/promociones'},
    home: {
      hero: {
        h1: "Clases de Pilates, Yoga y más en {studio}",
        subtitle: "Grupos reducidos y sesiones privadas en un espacio pensado para ti.",
      },
       heroVideo: {
        comingSoon: " Reserva Ya",
        ctaButton: "Inscríbete",
        exploreBtn: "Explorar Clases",
        pricesBtn: "Ver Precios",

        dialogTitle: "",
        credits: "créditos de regalo",
        dialogIntro:
          "Queremos conocerte mejor por favor llena el siguiente formulario.",

        nameLabel: "Tu nombre",
        namePlaceholder: "Ej: Laura Pérez",
        emailLabel: "Tu email",
        emailPlaceholder: "ejemplo@correo.com",

        generalTermsPrefix: "He leído y acepto la",
        generalTermsLink: "Política de Privacidad y los Términos Generales.",
        promoTermsPrefix: "He leído y acepto los",
        promoTermsLink: "Términos y Condiciones de la Promoción.",

        back: "Regresar",
        confirm: "Confirmar",

        successTitle: "¡Registro Exitoso! 🎉",
        successBody:
          "¡Gracias, {name}! Tus datos han sido enviados. Puedes canjear tus {credits} online en tu cuenta una vez habilitemos el sistema. ¡Te esperamos! 😊",

        errorTitle: "Error al registrar",
        errorBody: "No pudimos enviar tus datos. Por favor, intenta de nuevo.",

        videoFallback: "Tu navegador no soporta video HTML5",
        step2Validation: "Por favor, completa todos los campos para poder enviar tu solicitud.",
        next: "Siguiente paso",
        dialogStep2Intro: "Para asegurarnos de que recibas la información más relevante, completa estos campos:",
        step1Validation: "Debes completar el nombre, email y aceptar ambos términos.",
        backStep2: "Atrás",

        genderLabel: "Tu género",
        genderSelectPlaceholder: "Selecciona tu género",
        genderMale: "Masculino",
        genderFemale: "Femenino",
        genderOther: "Otro / Prefiero no decirlo",

        experienceLabel: "Nivel de experiencia",
        expSelectPlaceholder: "Selecciona tu nivel",
        expNever: "Primera vez",
        expBeginner: "Principiante",
        expIntermediate: "Intermedio",
        expAdvanced: "Avanzado",

        birthDateLabel: "Fecha de nacimiento",

        scheduleLabel: "Franja horaria ideal",
        scheduleSelectPlaceholder: "Selecciona una franja",
        schNight: "Noche (6 PM - 9 PM)",
        "daysLabel": "Días a la semana (Puedes elegir varios)",
      "daysSelectPlaceholder": "Ej: Lunes, Miércoles, Fin de semana",
      "dayMonday": "Lunes",
      "dayTuesday": "Martes",
      "dayWednesday": "Miércoles",
      "dayThursday": "Jueves",
      "dayFriday": "Viernes",
      "dayWeekend": "Fin de semana",
      
      // --- TRADUCCIONES MODIFICADAS: HORARIO ---
      // schMorning, schMidday, schAfternoon ya existían, pero ahora tienen nuevos textos
      "schFirst": "Primera hora (8:30)",
      "schMorning": "Mañana (9:30 - 13:30)",
      "schMidday": "Medio día (13:30 - 16:30)",
      "schAfternoon": "Tarde (16:30 – 20:30)",
      "schLast": "Última hora (20:30)",

      
      // --- INTERESES (NUEVO CAMPO MULTISELECCIÓN) ---
      "interestsLabel": "Intereses (Puedes elegir varios)",
      "interestsSelectPlaceholder": "Ej: Pilates, Yoga",

      // --- OPCIONES DE INTERESES (Labels de la colección) ---
      // NOTA: Los 'value' (Reformer, Suelo, etc.) no se traducen, solo los 'label'
      "intReformer": "Pilates Reformer",
      "intSuelo": "Pilates Suelo (Mat)",
      "intYoga": "Yoga",
      "intYogaKids": "Yoga Niños",
      "intPrePostParto": "Pilates Pre/Post Parto",
      "intSenior": "Grupo Senior",

      },
       welcome: {
        title: "{studio}",
        heading: "Bienvenid@ a {studio}",
        intro1:
          "Un espacio único donde el movimiento, la calma y la conexión se dan cita.",
        intro2:
          "Aquí encontrarás un refugio para cuidar tu cuerpo, tu mente y tu energía.",
        whatWeOffer: "¿Qué ofrecemos?",
        offerBody:
          "En {studio} ofrecemos clases diseñadas para diferentes niveles, edades, gustos y necesidades. Ya sea que busques relajarte, fortalecer tu cuerpo o explorar nuevas formas de moverte, aquí encontrarás una clase ideal para ti. Nuestros expertos instructores te guiarán en una experiencia transformadora.",
        cta: "Explora nuestras clases",
        pillMovement: "Movimiento",
        pillCalm: "Calma",
        pillConnection: "Conexión",
        featureBadge: "Grupos reducidos · Atención personalizada",
      },
      scroller: {
    phrase: "SIENTE CONECTA RESPIRA",
    ariaLabel: "Texto animado: siente, conecta, respira",
    repeatCount: "5" // opcional: cuántas repeticiones
  },
  classes: {
  heading: "Nuestras Clases",
  intro: "En nuestro estudio ofrecemos clases diseñadas para diferentes niveles, gustos y necesidades.",
  tabs: { pilates: "Pilates", yoga: "Yoga", mindfulness: "Otras actividades", others: "Otros" },
  category: { pilates: "Pilates", yoga: "Yoga", others: "Otras clases", eventos: "Eventos" },
  ctaMoreAbout: "Ver más sobre {title}",
  soon: "Ver más",
  pilates: {
    title: "Pilates",
    description: ""
  },
  yoga: {
    title: "Yoga",
    description: ""
  },
  mindfulness: {
    title: "Otras Clases",
    description: ""
  },
 
},
 events: {
    heading: "Eventos",
    info: "En {studio} organizamos eventos únicos e irrepetibles, cuidadosamente diseñados para expandir tu práctica, reconectar con tu esencia y compartir en comunidad.",
    body: "Desde talleres hasta ceremonias, clases especiales y encuentros guiados por profesionales, cada experiencia es una invitación a transformar cuerpo, mente y energía vital en nuestro espacio.",
    soon: "Próximamente"
  },

   parallax: {
    philosophy: {
      title: "Nuestra filosofía",
      subtitle: "Un espacio diferente para respirar, crear y compartir.",
      description:
        "Nuestro enfoque es integrador, no competitivo. {studio} es una casa donde moverse sin exigencias, sin juicios, y reconectar contigo mism@."
    },
    space: {
      title: "El espacio",
      subtitle: "Todo pensado para que tu práctica sea una experiencia sensorial completa",
      description: "Materiales naturales, luz suave y un ambiente cálido y acogedor"
    },
    connect: {
      title: "Conecta",
      subtitle: "Con tu esencia",
      description: "Reconecta contigo mismo y con lo que te rodea."
    }
  },
   contact: {
    heading: "Contáctanos",
    namePh: "Nombre",
    emailPh: "Correo electrónico",
    messagePh: "Mensaje",
    messagePh2: "¿En qué podemos ayudarte?",
    send: "Enviar",
    sendBtn: "Enviar mensaje",
    mapTitle: "Ubicación",
    locationNote: "Ven a conocernos. Si tienes dudas sobre cómo llegar, escríbenos.",
    toastOkTitle: "¡Mensaje Enviado! ✨",
    toastOkBody: "¡Gracias, {name}! Hemos recibido tu mensaje y te contactaremos a la brevedad.",
    toastErrTitle: "Error al enviar mensaje",
    toastErrBody: "No pudimos enviar tu mensaje. Por favor, intenta de nuevo.",
    locationLabel: "Ubicación",
    locationAddress: "Consulta nuestra dirección en el mapa",
    phoneLabel: "Teléfono",
    emailLabel: "Email",
    socialLabel: "Redes sociales",
    tagline: "¿Tienes alguna pregunta? Escríbenos y te responderemos lo antes posible.",
    formTitle: "Envíanos un mensaje",
    formSub: "Te responderemos lo antes posible",
    sentTitle: "¡Mensaje enviado!",
    sentBody: "Nos pondremos en contacto muy pronto.",
    namePh2: "Tu nombre",
    emailPh2: "Tu email",
  },
  footer: {
  brandBlurb: "Espacios para reconectar contigo mismo y con los ciclos naturales.",
  navTitle: "Navegación",
  nav: {
    home: "Inicio",
    events: "Eventos",
    about: "Sobre Nosotros",
    contact: "Contacto",
    

  },
  contactTitle: "Contáctanos",
  classesTitle: "Clases",
  classList: { pilates: "Pilates", yoga: "Yoga", meditation: "Meditación", dance: "Baile" },
  email: "",
  social: {
    instagram: "Instagram",
    facebook: "Facebook",
    whatsapp: "WhatsApp"
  },
  copyright: "Todos los derechos reservados.",

},
    team: {
      heading: "Nuestro Equipo",
      subtitle: "Profesionales que te acompañan con conocimiento y cercanía",
    },
    rooms: {
      heading: "Nuestras Salas",
      subtitle: "Espacios diseñados para conectar con tu práctica",
      badge: "Espacios",
      roomLabel: "Sala {n}",
      people: "{n} personas",
    },
    },

   auth: {
        loginTitle: "Bienvenido de nuevo",
        registerTitle: "Crea tu cuenta",
        googleLogin: "Iniciar sesión con Google",
        googleRegister: "Registrarse con Google",
        or: "o",
        namePlaceholder: "Nombre completo",
        emailPlaceholder: "Email",
        passwordPlaceholder: "Contraseña",
        acceptTermsPrefix: "Acepto los",
        termsLink: "Términos y Condiciones",
        loginButton: "Iniciar Sesión",
        registerButton: "Registrarme",
        noAccount: "¿No tienes cuenta?",
        hasAccount: "¿Ya tienes cuenta?",
        switchToRegister: "Regístrate aquí",
        switchToLogin: "Inicia sesión",
      nav: {
      contact: "Contacto",
      loginRegister: "Iniciar Sesion", 
    
      mySubscription: "Mi Suscripción",
      myCalendar: "Mi Calendario",
      logout: "Salir"
    
  }
    },

      "calendarView": {
      "heading": "Mi Calendario",
      "upcomingTitle": "Tus Próximas Clases",
      "noUpcoming": "¡No tienes clases reservadas!",
      "ctaBook": "Ver Horario y Reservar",
      "classConfirmed": "Clase Confirmada",
      "actionCancel": "Cancelar Clase",
      "actionExport": "Añadir a calendario",
      "exportGoogle": "Google Calendar",
      "exportApple": "Apple Calendar",
      "exportOutlook": "Outlook / .ICS",
      "exportIcal": "Exportar como .ICS (Outlook/Apple)",
      "cancelSuccess": "Clase cancelada con éxito.",
      "cancelConfirmTitle": "¿Estás seguro de cancelar esta clase?",
      "cancelConfirmBody": "Se te devolverán los créditos utilizados."
    },
    
    // === VISTA DE MI SUSCRIPCIÓN (mySubscriptionView) ===
    dashboard: {
      title: "Mi Dashboard",
      credits: "créditos",
      tabs: {
        agenda: "Mi Agenda",
        clases: "Mis Clases",
        suscripcion: "Suscripción",
        perfil: "Mi Cuenta",
      },
      agenda: {
        stats: { upcoming: "Próximas", credits: "Créditos", favorites: "Favoritas" },
        replacement: {
          title: "Clase pendiente de reemplazo",
          desc: "Elige una clase sustituta antes del {date}",
          cta: "Ver opciones",
        },
        sectionTitle: "Próximas clases",
        weekHint: "Próximos 7 días — toca una clase para ver detalles",
        weekEmpty: "Sin clases esta semana",
        noClasses: "No tienes clases reservadas próximamente.",
        exploreCta: "Explorar clases",
        historyShow: "Ver historial",
        historyHide: "Ocultar historial",
        loadMore: "Ver más",
        bookCta: "Reservar clase",
        buyCta: "Comprar créditos",
        cancelBtn: "Cancelar reserva",
        cancelSuccess: "Reserva cancelada",
        cancelError: "No se pudo cancelar.",
        statusReserved: "Reservada",
        statusAttended: "Asistida",
        statusCanceled: "Cancelada",
        statusNoShow: "No asistió",
        statusPending: "Pendiente",
        addToCalendar: "Añadir al calendario",
        cancelLocked: "No cancelable · menos de {hours} h",
        cancelTooLate: "Ya no se puede cancelar: faltan menos de {hours} horas para la clase. Si no puedes venir, contacta con el estudio.",
        monthHint: "Toca un día para ver tus clases de esa fecha",
        legendUpcoming: "Próximas",
        legendPast: "Asistidas",
        clearDay: "Ver todo",
        dayEmpty: "No tienes clases ese día.",
        saveAll: "Guardar en mi calendario",
        saveAllDone: "Descargado — ábrelo y se añadirán todas tus clases a tu calendario (Google, Apple…)",
        loadMoreError: "No se pudo cargar el historial.",
      },
      clases: {
        infoTitle: "Tus clases favoritas",
        infoBody: "Añade las clases recurrentes a las que quieres asistir cada semana. Con suscripción activa se reservan automáticamente.",
        prefTitle: "Preferencias ({count})",
        addBtn: "Añadir",
        closeBtn: "Cerrar",
        emptyText: "Aún no tienes clases favoritas.",
        emptyAddBtn: "Añadir primera clase",
        addSectionTitle: "Añadir clase recurrente",
        noSchedules: "No hay clases recurrentes disponibles.",
        addItemBtn: "+ Añadir",
        removePref: "Eliminar preferencia",
        classFallback: "Clase",
        addSuccess: "¡Clase añadida a tus favoritas!",
        addError: "Error al añadir preferencia.",
        removeSuccess: "Preferencia eliminada",
        removeError: "No se pudo eliminar.",
        needSubTitle: "La reserva automática está pausada",
        needSubDesc: "Tus clases favoritas solo se reservan solas con una suscripción activa. Actívala y no vuelvas a quedarte sin plaza.",
        needSubCta: "Ver planes",
        pastDueTitle: "Pago pendiente",
        pastDueDesc: "No pudimos procesar tu último pago, así que la reserva automática está en pausa hasta resolverlo.",
        pastDueCta: "Revisar pago",
        replacement: {
          title: "Elige tu clase de reemplazo",
          desc: "Tu clase habitual ya no está disponible. Estas alternativas son parecidas — elige una antes del {date} y ocupará su lugar.",
          choose: "Elegir",
          none: "¿Ninguna te encaja? Mira el calendario completo y reserva la que quieras.",
          calendarCta: "Ver calendario",
          success: "¡Clase de reemplazo reservada!",
          error: "No se pudo reservar el reemplazo.",
        },
      },
      subscription: {
        balanceLabel: "Saldo disponible",
        rechargeBtn: "Recargar",
        activeBadge: "ACTIVA",
        pastDueBadge: "PAGO PENDIENTE",
        pastDueTitle: "No pudimos procesar tu pago",
        pastDueDesc: "Stripe lo reintentará automáticamente en los próximos días. Comprueba que tu tarjeta esté activa o contacta con el estudio y lo resolvemos en un momento.",
        pastDueWhatsapp: "Contactar con el estudio",
        periodCurrent: "Período actual",
        periodRenewal: "Próxima renovación",
        cancelWarning: "Cancelada — activa hasta el final del período.",
        noSubTitle: "Sin suscripción activa",
        noSubDesc: "Con una suscripción mensual reservas clases automáticamente y pagas menos por crédito.",
        noSubCta: "Ver planes",
        howTitle: "¿Cómo funciona?",
        step01Title: "Elige tu plan",
        step01Desc: "Selecciona el plan mensual que mejor se adapte a tu práctica.",
        step02Title: "Recibe créditos",
        step02Desc: "Cada mes se añaden créditos automáticamente a tu cuenta.",
        step03Title: "Reserva tus favoritas",
        step03Desc: "Añade las clases semanales en \"Mis Clases\" y se reservan solas.",
        autoBookBadge: "RESERVA AUTOMÁTICA",
        autoBookActive: "Reserva automática activa",
        autoBookDesc: "Al inicio de cada mes tus {count} clase(s) favorita(s) se reservan solas con tus créditos.",
        nextWeekTitle: "Reservas próxima semana",
        autoBookNone: "Sin clases favoritas",
        autoBookNoneDesc: "Ve a «Mis Clases» y añade las clases a las que quieres asistir cada semana.",
        autoBookCta: "Gestionar clases",
        creditsGuide: "Guía de créditos",
        creditsGuideDesc: "Tu plan incluye {credits} créditos al mes. Con {perClass} créd/clase puedes asistir a un máximo de {max} clases.",
        creditsEstimate: "~{max} clases/mes con tu plan",
        creditsWeekly: "{count} clase(s)/semana configurada(s)",
        creditsMonthly: "≈{monthly} créditos/mes necesarios",
        creditsSufficient: "✓ Créditos suficientes para todas tus clases",
        creditsInsufficient: "⚠ Créditos insuficientes — faltan {missing} créd/mes",
        cancelBtn: "Cancelar suscripción",
        reactivateBtn: "Reactivar suscripción",
        cancelConfirmTitle: "¿Cancelar suscripción?",
        cancelConfirmDesc: "Tu suscripción permanecerá activa hasta el final del período actual ({date}). No se realizarán más cobros.",
        cancelConfirmBtn: "Sí, cancelar",
        cancelSuccess: "Suscripción cancelada",
        cancelSuccessDesc: "Permanecerá activa hasta {date}.",
        reactivateSuccess: "Suscripción reactivada",
        reactivateSuccessDesc: "Tu suscripción continuará normalmente.",
        cancelError: "Error al cancelar",
        reactivateError: "Error al reactivar",
      },
      perfil: {
        heroSub: "Miembro activo · {studio}",
        statsAttended: "Clases asistidas",
        statsFavorites: "Clases favoritas",
        actionsTitle: "Acciones rápidas",
        actionClasses: "Explorar clases",
        actionCalendar: "Calendario público",
        actionBuy: "Comprar créditos",
        actionPrefs: "Actualizar preferencias",
        subDetails: "Detalles",
        subLabel: "{credits} créditos/mes · activa",
      },
      dialog: {
        cancel: "Cancelar reserva",
      },
      loading: "Cargando tu dashboard…",
      loginRequired: "Acceso requerido",
      loginDesc: "Inicia sesión para ver tu dashboard de miembro.",
      loginCta: "Ir al inicio",
    },

    checkout: {
      title: "Finalizar Reserva",
      tabCredits: "Créditos de Clases",
      tabSub: "Suscripción Mensual",
      guestTitle: "Pago como invitado",
      guestStep2: "Paso 2: Pago",
      guestDataSaved: "Datos guardados. Continúa con el pago.",
      loginPrompt: "¿Ya tienes cuenta?",
      loginDesc: "Inicia sesión para usar tus créditos o comprar un paquete.",
      balanceOk: "¡Ya tienes créditos suficientes!",
      balanceOkDesc: "Balance: {balance} créd. · Reserva directamente desde el resumen.",
      choosePackTitle: "Elige tu paquete de créditos",
      noPacks: "No hay paquetes disponibles en este momento.",
      payTitle: "Pago",
      back: "← Volver",
      subTitle: "Suscripción mensual",
      subDesc: "Tus clases fijas se reservan solas cada semana. Cuota fija, más barata por clase y sin permanencia.",
      subLoginDesc: "Inicia sesión para ver los planes de suscripción.",
      subNoPlans: "No hay planes de suscripción disponibles en este momento.",
      subAlreadyActive: "Ya tienes un plan activo",
      subAlreadyDesc: "Gestiona, cambia o cancela tu suscripción desde tu cuenta. Los cambios de plan entran en vigor al inicio del siguiente período de facturación.",
      subGoAccount: "Ver mi cuenta",
      subChangePlan: "Cambiar de plan",
      subChangeDesc: "El nuevo plan entrará en vigor al inicio del siguiente período de facturación ({date}).",
      subChangeConfirmTitle: "¿Cambiar de plan?",
      subChangeConfirmDesc: "Cambiarás al plan «{name}» a partir de {date}. Tu plan actual seguirá activo hasta entonces.",
      subChangeConfirmBtn: "Confirmar cambio",
      subChangeSuccess: "Cambio de plan programado",
      subChangeSuccessDesc: "Tu nuevo plan «{name}» entrará en vigor el {date}.",
      subChangeError: "Error al cambiar de plan",
      enrollTitle: "Elige tus clases semanales",
      enrollDesc: "Tu suscripción está activa. Selecciona las clases a las que quieres asistir regularmente.",
      enrollSelect: "Selecciona las clases a las que quieres asistir automáticamente cada semana.",
      enrollCartBanner: "Hemos preseleccionado las clases de tu cesta.",
      enrollCartBannerSub: "Con tu suscripción se reservarán automáticamente cada semana.",
      enrollNone: "No hay clases recurrentes disponibles en este momento.",
      enrollInCart: "EN TU CESTA",
      enrollAddBtn: "Añadir {count} clase(s) como favoritas",
      enrollSkipBtn: "Continuar sin seleccionar",
      enrollAdded: "¡Clases favoritas añadidas!",
      enrollFailed: "{count} clase(s) no se pudieron añadir",
      doneTitle: "¡Todo listo!",
      doneDesc: "Tu suscripción está activa y tus clases están programadas.",
      doneCalendarCta: "Ver mi calendario",
      // ── Post-subscription activation flow ──────────────────────────────────
      subActivatedTitle: "¡Suscripción activada!",
      subActivatedStep1: "Suscripción mensual activa",
      subActivatedStep2: "Clases preferidas guardadas",
      subActivatedStep3: "Reserva automática configurada",
      subActivatedAutoDesc: "A partir del {date} tus clases preferidas se reservarán automáticamente cada semana.",
      subActivatedDeadline: "Tienes hasta el sábado {date} para actualizar tus preferencias.",
      subActivatedDeadlineUrgent: "Hoy es el último día para actualizar tus clases esta semana.",
      subActivatedCartTitle: "Clases en tu cesta",
      subActivatedCartDesc: "Tienes {n} clase(s) lista(s) para reservar ahora mismo con tus créditos.",
      subActivatedCartBtn: "Reservar ahora",
      subActivatedCartSkip: "Omitir, ir a mis clases semanales",
      subActivatedCartDone: "¡Clases reservadas! Ahora configura tu semana.",
      // ── Auto-booking schedule info (dashboard) ─────────────────────────────
      autoBookNextRun: "Próxima reserva automática: {date}",
      autoBookDeadlineDate: "Actualiza tus clases antes del sábado {date}",
      autoBookDeadlineToday: "Hoy es el último día para cambiar tus clases",
      autoBookWeekStart: "Semana que se reservará: {date}",
      subPayTitle: "Pago de suscripción",
      subscribeBtn: "Suscribirme",
      summaryTitle: "Resumen · {count} {class}",
      summaryClass: "clase",
      summaryClasses: "clases",
      summaryEmpty: "Tu cesta está vacía.",
      totalCredits: "Total créditos:",
      totalPrice: "Total:",
      yourBalance: "Tu balance:",
      afterBooking: "Restante tras reserva:",
      insufficientTitle: "Créditos insuficientes",
      insufficientDesc: "Necesitas {count} crédito(s) más.",
      couponLabel: "Código de oferta (opcional)",
      couponApply: "Aplicar",
      couponApplied: "{code} — descuento aplicado",
      couponPlaceholder: "Introduce tu código",
      couponRemoveLabel: "Quitar cupón",
      couponNotFound: "El cupón no existe.",
      couponError: "Error al validar el cupón.",
      couponInactive: "Este cupón está desactivado.",
      couponNotYet: "El cupón aún no está vigente.",
      couponExpired: "El cupón ha caducado.",
      couponSuccess: "¡Cupón aplicado!",
      reserveBtn: "Reservar ({credits} créd.)",
      nextBtn: "Siguiente",
      continueBtn: "Continuar · {price}",
      deleteLabel: "Eliminar",
      creditsUnit: "créd.",
      classFallback: "Clase",
      confirmQuestion: "¿Confirmas la reserva de {count} clase(s)?",
      guestAllFields: "Por favor, rellena todos los campos correctamente.",
      guestPhoneInvalid: "Introduce un teléfono válido (mínimo 7 dígitos).",
      noBalanceError: "No se pudo cargar tu balance.",
      reserveError: "Error al procesar la reserva.",
      reserveSuccess: "¡Clases reservadas con éxito!",
      reserveSuccessDesc: "Tu reserva está confirmada. Te enviamos un email con los detalles.",
      closeBtn: "Cerrar",
      goToBookings: "Ver mis reservas",
      duplicateBookingTitle: "Ya tienes esta clase reservada",
      duplicateBookingDesc: "{msg}\n\nSi quieres reservar esta clase para otra persona (familiar, amigo), cierra sesión y completa la reserva como invitado en el checkout.",
      verifyError: "Error de verificación",
      verifyErrorDesc: "Contacta soporte si te han cobrado.",
      verifying: "Verificando tu pago...",
      sessionExpiredTitle: "Tu sesión expiró durante el pago",
      sessionExpiredDesc: "Tu pago se procesó correctamente. Vuelve a iniciar sesión para ver tus créditos.",
      paySuccess: "¡Pago exitoso!",
      paySuccessDesc: "Actualizando tus créditos...",
      confirmTitle: "¡Recarga Exitosa!",
      confirmDesc: "Tus créditos ya están disponibles.",
      newBalance: "Nuevo balance:",
      bookingCost: "Coste reserva:",
      remaining: "Restante:",
      confirmBooking: "¡Confirmar Reserva!",
      guestEmail: "Email",
      guestName: "Nombre",
      guestPhone: "Teléfono",
      payConfirmedTitle: "Pago confirmado",
      payConfirmedDesc: "Tus créditos se acreditarán en breve. Te avisaremos por email.",
      paySessionError: "No se pudo crear la sesión de pago",
      payFormError: "No se pudo inicializar el formulario de pago.",
      payAuthError: "No se pudo autenticar al usuario. Por favor, inicia sesión de nuevo.",
    },

    paymentFinish: {
      successTitle: "¡Pago completado!",
      successDesc: "Tu reserva ha sido confirmada. Recibirás un email con los detalles.",
      backHome: "Volver al inicio",
      timeoutTitle: "Tu pago se está procesando",
      timeoutDesc: "Todavía no hemos podido confirmar tu reserva. Si el pago se completó, recibirás un email de confirmación en unos minutos y tus clases aparecerán en tu cuenta.",
      timeoutHint: "Si en 15 minutos no has recibido nada, contacta con nosotros antes de intentar pagar de nuevo — así evitamos un doble cobro.",
      errorTitle: "Hubo un problema",
      noSession: "No se encontró un ID de sesión. Tu pago no pudo ser verificado.",
      errorHint: "Si se realizó un cobro, contacta con soporte.",
      backCheckout: "Volver al checkout",
      processing: "Procesando tu pago...",
      dontClose: "Por favor, no cierres esta ventana.",
      processingDesc: "Esto puede tomar unos segundos mientras confirmamos tu reserva.",
    },

    updatePrefs: {
      title: "Actualizar Preferencias",
      step1Intro: "Introduce tu correo para continuar.",
      step2Intro: "Cuéntanos más sobre ti.",
      stepOf: "Paso {step}/2",
      errorLabel: "Error",
      emailLabel: "Correo Electrónico",
      emailPlaceholder: "tu-email@registrado.com",
      checkEmailBtn: "Verificar Correo y Continuar",
      interestsLabel: "Intereses (Puedes elegir varios)",
      interestsPlaceholder: "Ej: Pilates, Yoga",
      experienceLabel: "Nivel de Experiencia",
      selectPlaceholder: "Selecciona...",
      birthDateLabel: "Fecha de Nacimiento",
      daysLabel: "Días Preferidos (Puedes elegir varios)",
      daysPlaceholder: "Ej: Lunes, Fin de semana",
      scheduleLabel: "Franja Horaria Preferida",
      back: "Atrás",
      submit: "Actualizar Preferencias",
      errEmailRequired: "Por favor, introduce tu correo electrónico.",
      errEmailNotFound: "Correo electrónico no encontrado. Por favor, verifica o regístrate primero.",
      errEmailCheck: "Error al verificar el correo.",
      errNetwork: "Error de red. Inténtalo de nuevo más tarde.",
      errIncomplete: "Por favor, completa todas tus preferencias.",
      success: "¡Preferencias actualizadas con éxito!",
      errUpdate: "Error al actualizar las preferencias.",
    },

    days: {
      0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves",
      4: "Viernes", 5: "Sábado", 6: "Domingo",
    },

    plans: {
      badge: "{studio}",
      title: "Elige tu plan",
      subtitle: "Responde 3 preguntas y te decimos qué te conviene. Con un plan cada clase te sale más barata.",
      tabPacks: "Bonos de clases",
      tabSubs: "Membresía mensual",
      packFooter: "Pago único, sin renovaciones. Reservas tú cuando quieras dentro de la validez del bono.",
      subFooter: "Sin permanencia: cancela cuando quieras desde «Mi cuenta».",
      subFooterPay: "Pago seguro con Stripe.",
      noPlans: "No hay planes disponibles en este momento.",
      credits: "{n} créditos",
      perCredit: "por crédito",
      validDays: "Válidos {n}d",
      buyBtn: "Comprar",
      subBadge: "Suscripción Mensual",
      subCreditsMonth: "{n} créditos al mes",
      subMonth: "/mes",
      subFeature1: "{n} créditos cada mes",
      subFeature2: "Renovación automática mensual",
      subFeature3: "Reserva tus clases favoritas",
      subFeature4: "Cancela cuando quieras",
      subFeature5: "Sin permanencia",
      subscribeBtn: "Suscribirme",
      popular: "Más Popular",
      // --- Períodos de renovación dinámicos ---
      subRenewal_monthly: "mensual",
      subRenewal_bimonthly: "cada 2 meses",
      subRenewal_quarterly: "cada 3 meses",
      subRenewal_biannual: "cada 6 meses",
      subRenewal_annual: "anual",
      subPeriodSuffix_monthly: "/mes",
      subPeriodSuffix_bimonthly: "/2 meses",
      subPeriodSuffix_quarterly: "/trim.",
      subPeriodSuffix_biannual: "/sem.",
      subPeriodSuffix_annual: "/año",
      subBadgePeriod: "Suscripción {period}",
      subCreditsPerPeriod: "{n} créditos {period}",
      subAutoRenewal: "Renovación automática {period}",
      saving: "Ahorras {saving}",
    },

    langModal: {
      title: "Seleccionar idioma",
      nativeSection: "Idioma disponible",
      applying: "Aplicando idioma…",
      applyBtn: "Aplicar",
      cancelBtn: "Cancelar",
    },

    classDetail: {
      backToClasses: "Clases",
      backBtn: "Volver a clases",
      credit: "crédito",
      credits: "créditos",
      instructorLabel: "Instructor",
      instructorViewProfile: "Saber más",
      instructorFallback: "Instructor de la clase",
      spaceLabel: "Espacio",
      spaceFallback: "Nuestras Salas",
      spaceViewAll: "Conocer la sala",
      spacePeople: "{n} personas · ",
      mainRoom: "Sala Principal",
      priceLabel: "Precio por sesión",
      bookBtn: "Ver horarios disponibles",
      privateBtn: "Clase privada",
      disclaimer: "Reserva sin compromiso · Cancela hasta {hours} h antes",
      calendarTitle: "Selecciona tu clase",
      levelBeg: "Principiante",
      levelInt: "Intermedio",
      levelAdv: "Avanzado",
      levelAll: "Todos los niveles",
      errorNotFound: "Clase no encontrada",
      errorNoData: "Sin datos",
      errorLoad: "Error al cargar la clase.",
      errorSlug: "No se pudo encontrar el slug.",
      waMessage: "¡Hola! Me gustaría preguntar por una clase privada de: {title}",
    },

    calendarPage: {
      heading: "Horario de Clases",
      subtitle: "Selecciona un día y reserva tu clase favorita directamente.",
    },

    bottomNav: {
      book: "Reservar",
      account: "Mi cuenta",
    },
    calendar: {
      viewDetail: "Ver detalle",
      loading: "Cargando clases…",
      noClasses: "Sin clases para este día",
      classCount_one: "clase",
      classCount_other: "clases",
      statusLimited: "Pocos espacios",
      statusFull: "Completo",
      inCart: "En el carrito",
      addToCart: "Añadir al carrito",
      add: "Añadir",
      added: "Añadida ✓",
      prevWeek: "Semana anterior",
      nextWeek: "Semana siguiente",
      onlyDaysHint: "Solo aparecen los días en que se da esta clase. Elige uno y toca «Añadir».",
      noDatesThisWeek: "Esta semana no hay sesiones de esta clase.",
      nextDate: "Ir al",
      noUpcomingTitle: "Sin fechas por el momento",
      noUpcomingDesc: "Ahora mismo esta clase no está en el horario. Escríbenos y te avisamos en cuanto vuelva.",
    },

    cart: {
      title: "Tu Reserva",
      balance: "Saldo disponible:",
      creditsToUse: "Créditos a usar",
      credit: "crédito",
      credits: "créditos",
      total: "Total",
      checkout: "Proceder al Pago",
      clear: "Vaciar carrito",
      emptyTitle: "Tu reserva está vacía",
      emptyDesc: "Explora las clases y añade las que más te inspiren",
      added: "¡Añadida!",
      alreadyIn: "Ya está en el carrito",
      full: "Clase llena",
      open: "Abrir carrito",
    },

    whatsapp: {
      helpLabel: "¿Necesitas ayuda?",
      message: "soporte",
    },

    "subscriptionView": {
      "heading": "Mi Suscripción",
      "currentPlanTitle": "Tu Saldo Actual",
      "credits": "Créditos",
      "unlimited": "Ilimitado",
      "expires": "Expira el {date}",
      "renewal": "Renovación automática el {date}",
      "statusActive": "Plan Activo",
      "statusInactive": "Sin Plan Activo",
      "planNameCredits": "Paquete de {credits} Créditos",
      "planNameMonthly": "Suscripción Mensual Ilimitada",
      "creditsPerClass": "{credits} créditos por clase",
      "historyTitle": "Historial de Uso",
      "noHistory": "Aún no hay movimientos.",
      "actionDetails": "Ver detalles",
      "actionBuy": "Comprar Plan",
      "actionUpgrade": "Actualizar a Ilimitado",
      "movementUsed": "Créditos usados: {count}",
      "movementBought": "Créditos comprados: {count}",
      "movementClass": "Clase: {classTitle}",
    "month": "mes",
    "creditsRemaining": "{count} Créditos restantes",
    "usageHistory": "Historial de Uso",
    "buyPlan": "Comprar Plan",
    "buyNewPlan": "Comprar Nuevo Paquete",
    "paymentDetails": "Ver Detalles de Pago",
    "creditsLeft": "{count} Créditos restantes"
    
    }

   
  },
  en: {
    common: {
      bookNow: "Book now", back: "Back",
      prev: "Previous", next: "Next",
      slideAlt: "Studio photo {n}",
      unknownError: "Something unexpected went wrong.",
      errorTitle: "Oops! Something went wrong",
      loadClassesError: "We couldn’t load the classes.",
    },
    links: { terms: '/en/terms-conditions', promo: '/en/promotions-terms'},
    home: {
      hero: {
        h1: "Pilates, Yoga and more at {studio}",
        subtitle: "Small groups and private sessions in a space designed for you.",
      },
       heroVideo: {
        comingSoon: "Booking now",
        ctaButton: "Join",
        exploreBtn: "Explore Classes",
        pricesBtn: "View Prices",

        dialogTitle: "We have a gift for you!",
        credits: "gift credits",
        dialogIntro:
          "We want to get to know you better. Please fill out the following form.",

        nameLabel: "Your name",
        namePlaceholder: "e.g., Laura Perez",
        emailLabel: "Your email",
        emailPlaceholder: "example@email.com",

        generalTermsPrefix: "I have read and accept the",
        generalTermsLink: "Privacy Policy and General Terms.",
        promoTermsPrefix: "I have read and accept the",
        promoTermsLink: "Promotion Terms & Conditions.",

        back: "Back",
        confirm: "Confirm",

        successTitle: "Registration Successful! 🎉",
        successBody:
          "Thank you, {name}! Your details have been sent. You can redeem your {credits} online in your account once the system is enabled. We look forward to seeing you! 😊",
        errorTitle: "Registration error",
        errorBody: "We couldn’t submit your details. Please try again.",
        videoFallback: "Your browser does not support HTML5 video",
        step2Validation: "Please fill in all the fields so we can send your request.",
        next: "Next Step",
        dialogStep2Intro: "To ensure you receive the most relevant information, please fill out these fields:",
        step1Validation: "Please fill in your name, email, and accept both terms.",
        backStep2: "Back",

        genderLabel: "Your gender",
        genderSelectPlaceholder: "Select your gender",
        genderMale: "Male",
        genderFemale: "Female",
        genderOther: "Other / Prefer not to say",

        "interestsLabel": "Interests (You can choose several)",
      "interestsSelectPlaceholder": "E.g., Pilates, Yoga",

      // --- OPCIONES DE INTERESES (Labels de la colección) ---
      "intReformer": "Pilates Reformer",
      "intSuelo": "Mat Pilates",
      "intYoga": "Yoga",
      "intYogaKids": "Kids Yoga",
      "intPrePostParto": "Pre/Post Natal Pilates",
      "intSenior": "Senior Group",


        experienceLabel: "Experience level",
        expSelectPlaceholder: "Select your level",
        expNever: "Never done",
        expBeginner: "Beginner",
        expIntermediate: "Intermediate",
        expAdvanced: "Advanced",

        birthDateLabel: "Date of birth",

        "daysLabel": "Preferred Days of the Week (You can choose several)",
      "daysSelectPlaceholder": "E.g., Monday, Wednesday, Weekend",
      "dayMonday": "Monday",
      "dayTuesday": "Tuesday",
      "dayWednesday": "Wednesday",
      "dayThursday": "Thursday",
      "dayFriday": "Friday",
      "dayWeekend": "Weekend",
      
      // --- TRADUCCIONES MODIFICADAS: HORARIO ---
      "scheduleLabel": "Preferred Time Slot",
      "scheduleSelectPlaceholder": "Select...",
      "schFirst": "First Hour (8:30)",
      "schMorning": "Morning (9:30 - 1:30 PM)",
      "schMidday": "Midday (1:30 PM - 4:30 PM)",
      "schAfternoon": "Afternoon (4:30 PM – 8:30 PM)",
      "schLast": "Last Hour (8:30 PM)",
      schNight: "Evening (6 PM - 9 PM)",
      },
       welcome: {
        title: "{studio}",
        heading: "Welcome to {studio}",
        intro1:
          "A unique space where movement, calm, and connection come together.",
        intro2:
          "Here you’ll find a sanctuary to care for your body, mind, and energy.",
        whatWeOffer: "What do we offer?",
        offerBody:
          "At {studio} we offer classes designed for different levels, ages, tastes, and needs. Whether you want to relax, build strength, or explore new ways of moving, you’ll find the perfect class for you. Our expert instructors will guide you through a transformative experience.",
        cta: "Explore our classes",
        pillMovement: "Movement",
        pillCalm: "Calm",
        pillConnection: "Connection",
        featureBadge: "Small groups · Personal attention",
      },

     scroller: {
    phrase: "FEEL CONNECT BREATHE",
    ariaLabel: "Animated text: feel, connect, breathe",
    repeatCount: "5"
  },
  classes: {
  heading: "Our Classes",
  intro: "In our studio we offer classes designed for different levels, preferences and needs.",
  tabs: { pilates: "Pilates", yoga: "Yoga", mindfulness: "Other activities", others: "Other" },
  category: { pilates: "Pilates", yoga: "Yoga", others: "Other classes", eventos: "Events" },
      ctaMoreAbout: "Learn more about {title}",
    soon: "See more",
  pilates: {
    title: "Pilates",
    description: ""
  },
  yoga: {
    title: "Yoga",
    description: ""
  },
  mindfulness: {
    title: "Other Classes",
    description: ""
  },

},
  events: {
    heading: "Events",
    info: "At {studio} we curate unique, unrepeatable events—carefully designed to expand your practice, reconnect with your essence and share in community.",
    body: "From workshops to ceremonies, special classes and gatherings led by professionals, each experience invites you to transform body, mind and vital energy in our space.",
    soon: "Coming soon"
  },

  parallax: {
    philosophy: {
      title: "Our philosophy",
      subtitle: "A different space to breathe, create and share.",
      description:
        "Our approach is integrative, not competitive. {studio} is a home to move without demands or judgment, and reconnect with yourself."
    },
    space: {
      title: "The space",
      subtitle: "Everything designed for a full sensory practice",
      description: "Natural materials, soft light and a warm, welcoming atmosphere"
    },
    connect: {
      title: "Connect",
      subtitle: "With your essence",
      description: "Reconnect with yourself and everything around you."
    }
  },
  contact: {
    heading: "Contact us",
    namePh: "Name",
    emailPh: "Email",
    messagePh: "Message",
    messagePh2: "How can we help you?",
    send: "Send",
    sendBtn: "Send message",
    mapTitle: "Location",
    locationNote: "Come and meet us. If you have any questions about getting here, write to us.",
    toastOkTitle: "Message sent! ✨",
    toastOkBody: "Thank you, {name}! We’ve received your message and will get back to you shortly.",
    toastErrTitle: "Error sending message",
    toastErrBody: "We couldn’t send your message. Please try again.",
    locationLabel: "Location",
    locationAddress: "See our address on the map",
    phoneLabel: "Phone",
    emailLabel: "Email",
    socialLabel: "Social media",
    tagline: "Have a question? Write to us and we’ll get back to you as soon as possible.",
    formTitle: "Send us a message",
    formSub: "We’ll get back to you as soon as possible",
    sentTitle: "Message sent!",
    sentBody: "We’ll be in touch very soon.",
    namePh2: "Your name",
    emailPh2: "Your email",
  },
  footer: {
  brandBlurb: "Spaces to reconnect with yourself and with natural cycles.",
  navTitle: "Navigation",
  nav: {
    home: "Home",
    events: "Events",
    about: "About Us",
    contact: "Contact"
  },
  contactTitle: "Contact us",
  classesTitle: "Classes",
  classList: { pilates: "Pilates", yoga: "Yoga", meditation: "Meditation", dance: "Dance" },
  email: "",
  social: {
    instagram: "Instagram",
    facebook: "Facebook",
    whatsapp: "WhatsApp"
  },
  copyright: "All rights reserved."
},
    team: {
      heading: "Our Team",
      subtitle: "Professionals who guide you with knowledge and warmth",
    },
    rooms: {
      heading: "Our Studios",
      subtitle: "Spaces designed to connect you with your practice",
      badge: "Spaces",
      roomLabel: "Studio {n}",
      people: "{n} people",
    },
    },

  auth: {
        loginTitle: "Welcome back",
        registerTitle: "Create your account",
        googleLogin: "Sign in with Google",
        googleRegister: "Sign up with Google",
        or: "or",
        namePlaceholder: "Full name",
        emailPlaceholder: "Email",
        passwordPlaceholder: "Password",
        acceptTermsPrefix: "I accept the",
        termsLink: "Terms & Conditions",
        loginButton: "Log In",
        registerButton: "Sign Up",
        noAccount: "Don't have an account?",
        hasAccount: "Already have an account?",
        switchToRegister: "Sign up here",
        switchToLogin: "Log in",
      nav: {
        contact: "Contact",
        loginRegister: "Log in",
        mySubscription: "My Subscription",
        myCalendar: "My Calendar",
        logout: "Log out",
      },
    },

    "calendarView": {
      "heading": "My Calendar",
      "upcomingTitle": "Your Upcoming Classes",
      "noUpcoming": "You don't have any classes booked yet!",
      "ctaBook": "View Schedule & Book",
      "classConfirmed": "Class Confirmed",
      "actionCancel": "Cancel Class",
      "actionExport": "Add to calendar",
      "exportGoogle": "Google Calendar",
      "exportApple": "Apple Calendar",
      "exportOutlook": "Outlook / .ICS",
      "exportIcal": "Export as .ICS (Outlook/Apple)",
      "cancelSuccess": "Class successfully cancelled.",
      "cancelConfirmTitle": "Are you sure you want to cancel this class?",
      "cancelConfirmBody": "The credits used will be returned to your account."
    },

    // === VISTA DE MI SUSCRIPCIÓN (mySubscriptionView) ===
    "subscriptionView": {
      "heading": "My Subscription",
      "currentPlanTitle": "Your Current Balance",
      "credits": "Credits",
      "unlimited": "Unlimited",
      "expires": "Expires on {date}",
      "renewal": "Auto-renewal on {date}",
      "statusActive": "Active Plan",
      "statusInactive": "No Active Plan",
      "planNameCredits": "{credits} Credits Pack",
      "planNameMonthly": "Unlimited Monthly Subscription",
      "creditsPerClass": "{credits} credits per class",
      "historyTitle": "Usage History",
      "noHistory": "No movements yet.",
      "actionDetails": "View Details",
      "actionBuy": "Buy Plan",
      "actionUpgrade": "Upgrade to Unlimited",
      "movementUsed": "Credits used: {count}",
      "movementBought": "Credits purchased: {count}",
      "movementClass": "Class: {classTitle}",
      "month": "month",
      "creditsRemaining": "{count} Credits remaining",
      "usageHistory": "Usage History",
      "buyPlan": "Buy Plan",
      "buyNewPlan": "Buy New Package",
      "paymentDetails": "View Payment Details",
      "creditsLeft": "{count} Credits remaining"
    },

    dashboard: {
      title: "My Dashboard",
      credits: "credits",
      tabs: {
        agenda: "My Agenda",
        clases: "My Classes",
        suscripcion: "Subscription",
        perfil: "My Account",
      },
      agenda: {
        stats: { upcoming: "Upcoming", credits: "Credits", favorites: "Favorites" },
        replacement: {
          title: "Class pending replacement",
          desc: "Choose a substitute class before {date}",
          cta: "View options",
        },
        sectionTitle: "Upcoming classes",
        weekHint: "Next 7 days — tap a class for details",
        weekEmpty: "No classes this week",
        noClasses: "You have no classes booked yet.",
        exploreCta: "Explore classes",
        historyShow: "View history",
        historyHide: "Hide history",
        loadMore: "Load more",
        bookCta: "Book a class",
        buyCta: "Buy credits",
        cancelBtn: "Cancel booking",
        cancelSuccess: "Booking cancelled",
        cancelError: "Could not cancel.",
        statusReserved: "Booked",
        statusAttended: "Attended",
        statusCanceled: "Cancelled",
        statusNoShow: "No show",
        statusPending: "Pending",
        addToCalendar: "Add to calendar",
        cancelLocked: "Not cancellable · under {hours} h",
        cancelTooLate: "It’s too late to cancel: the class starts in less than {hours} hours. If you can’t make it, please contact the studio.",
        monthHint: "Tap a day to see your classes on that date",
        legendUpcoming: "Upcoming",
        legendPast: "Attended",
        clearDay: "Show all",
        dayEmpty: "No classes on that day.",
        saveAll: "Save to my calendar",
        saveAllDone: "Downloaded — open it and all your classes will be added to your calendar (Google, Apple…)",
        loadMoreError: "We couldn’t load your history.",
      },
      clases: {
        infoTitle: "Your favourite classes",
        infoBody: "Add the recurring classes you want to attend each week. With an active subscription they are reserved automatically.",
        prefTitle: "My preferences ({count})",
        addBtn: "Add",
        closeBtn: "Close",
        emptyText: "You have no favourite classes yet.",
        emptyAddBtn: "Add first class",
        addSectionTitle: "Add recurring class",
        noSchedules: "No recurring classes available.",
        addItemBtn: "+ Add",
        removePref: "Remove preference",
        classFallback: "Class",
        addSuccess: "Class added to favourites!",
        addError: "Error adding preference.",
        removeSuccess: "Preference removed",
        removeError: "Could not remove.",
        needSubTitle: "Auto-booking is paused",
        needSubDesc: "Your favourite classes only book themselves with an active subscription. Activate one and never miss your spot again.",
        needSubCta: "View plans",
        pastDueTitle: "Payment pending",
        pastDueDesc: "We could not process your last payment, so auto-booking is paused until it is resolved.",
        pastDueCta: "Review payment",
        replacement: {
          title: "Choose your replacement class",
          desc: "Your usual class is no longer available. These alternatives are similar — pick one before {date} and it will take its place.",
          choose: "Choose",
          none: "None of them work for you? Browse the full calendar and book any class you like.",
          calendarCta: "View calendar",
          success: "Replacement class booked!",
          error: "Could not book the replacement.",
        },
      },
      subscription: {
        balanceLabel: "Available balance",
        rechargeBtn: "Top up",
        activeBadge: "ACTIVE",
        pastDueBadge: "PAYMENT PENDING",
        pastDueTitle: "We could not process your payment",
        pastDueDesc: "Stripe will retry automatically over the next few days. Check that your card is active, or contact the studio and we'll sort it out.",
        pastDueWhatsapp: "Contact the studio",
        periodCurrent: "Current period",
        periodRenewal: "Next renewal",
        cancelWarning: "Cancelled — active until end of period.",
        noSubTitle: "No active subscription",
        noSubDesc: "With a monthly subscription classes are reserved automatically and you pay less per credit.",
        noSubCta: "View plans",
        howTitle: "How does it work?",
        step01Title: "Choose your plan",
        step01Desc: "Select the monthly plan that best fits your practice.",
        step02Title: "Receive credits",
        step02Desc: "Credits are added automatically to your account each month.",
        step03Title: "Book your favourites",
        step03Desc: "Add weekly classes in the \"My Classes\" tab and they are booked automatically.",
        autoBookBadge: "AUTO-BOOKING",
        autoBookActive: "Auto-booking active",
        autoBookDesc: "At the start of each month your {count} favourite class(es) are booked automatically using your credits.",
        nextWeekTitle: "Next week's bookings",
        autoBookNone: "No favourite classes",
        autoBookNoneDesc: "Go to «My Classes» and add the classes you want to attend each week.",
        autoBookCta: "Manage classes",
        creditsGuide: "Credits guide",
        creditsGuideDesc: "Your plan includes {credits} credits per month. At {perClass} cr/class you can attend up to {max} classes.",
        creditsEstimate: "~{max} classes/month with your plan",
        creditsWeekly: "{count} class(es)/week set up",
        creditsMonthly: "≈{monthly} credits/month needed",
        creditsSufficient: "✓ Enough credits for all your classes",
        creditsInsufficient: "⚠ Not enough credits — {missing} cr/month short",
        cancelBtn: "Cancel subscription",
        reactivateBtn: "Reactivate subscription",
        cancelConfirmTitle: "Cancel subscription?",
        cancelConfirmDesc: "Your subscription will remain active until the end of the current billing period ({date}). No further charges will be made.",
        cancelConfirmBtn: "Yes, cancel",
        cancelSuccess: "Subscription cancelled",
        cancelSuccessDesc: "It will remain active until {date}.",
        reactivateSuccess: "Subscription reactivated",
        reactivateSuccessDesc: "Your subscription will continue normally.",
        cancelError: "Cancellation error",
        reactivateError: "Reactivation error",
      },
      perfil: {
        heroSub: "Active member · {studio}",
        statsAttended: "Classes attended",
        statsFavorites: "Favourite classes",
        actionsTitle: "Quick actions",
        actionClasses: "Explore classes",
        actionCalendar: "Public calendar",
        actionBuy: "Buy credits",
        actionPrefs: "Update preferences",
        subDetails: "Details",
        subLabel: "{credits} credits/month · active",
      },
      dialog: {
        cancel: "Cancel booking",
      },
      loading: "Loading your dashboard…",
      loginRequired: "Login required",
      loginDesc: "Sign in to view your member dashboard.",
      loginCta: "Go to home",
    },

    checkout: {
      title: "Complete Booking",
      tabCredits: "Class Credits",
      tabSub: "Monthly Subscription",
      guestTitle: "Guest checkout",
      guestStep2: "Step 2: Payment",
      guestDataSaved: "Details saved. Continue with payment.",
      loginPrompt: "Already have an account?",
      loginDesc: "Sign in to use your credits or buy a pack.",
      balanceOk: "You have enough credits!",
      balanceOkDesc: "Balance: {balance} cr. · Book directly from the summary.",
      choosePackTitle: "Choose your credit pack",
      noPacks: "No packs available at the moment.",
      payTitle: "Payment",
      back: "← Back",
      subTitle: "Monthly subscription",
      subDesc: "Your regular classes book themselves every week. Fixed fee, cheaper per class, no commitment.",
      subLoginDesc: "Sign in to view subscription plans.",
      subNoPlans: "No subscription plans available at the moment.",
      subAlreadyActive: "You already have an active plan",
      subAlreadyDesc: "Manage, change or cancel your subscription from your account. Plan changes take effect at the start of the next billing cycle.",
      subGoAccount: "Go to my account",
      subChangePlan: "Change plan",
      subChangeDesc: "The new plan will take effect at the start of the next billing cycle ({date}).",
      subChangeConfirmTitle: "Change plan?",
      subChangeConfirmDesc: "You will switch to plan «{name}» from {date}. Your current plan remains active until then.",
      subChangeConfirmBtn: "Confirm change",
      subChangeSuccess: "Plan change scheduled",
      subChangeSuccessDesc: "Your new plan «{name}» will take effect on {date}.",
      subChangeError: "Error changing plan",
      enrollTitle: "Choose your weekly classes",
      enrollDesc: "Your subscription is active. Select the classes you want to attend regularly.",
      enrollSelect: "Select the classes you want to attend automatically each week.",
      enrollCartBanner: "We've pre-selected the classes from your cart.",
      enrollCartBannerSub: "With your subscription they'll be reserved automatically each week.",
      enrollNone: "No recurring classes available at the moment.",
      enrollInCart: "IN YOUR CART",
      enrollAddBtn: "Add {count} class(es) as favourites",
      enrollSkipBtn: "Continue without selecting",
      enrollAdded: "Favourite classes added!",
      enrollFailed: "{count} class(es) could not be added",
      doneTitle: "All set!",
      doneDesc: "Your subscription is active and your classes are scheduled.",
      doneCalendarCta: "View my calendar",
      // ── Post-subscription activation flow ──────────────────────────────────
      subActivatedTitle: "Subscription activated!",
      subActivatedStep1: "Monthly subscription active",
      subActivatedStep2: "Preferred classes saved",
      subActivatedStep3: "Auto-booking set up",
      subActivatedAutoDesc: "From {date} your preferred classes will be automatically booked every week.",
      subActivatedDeadline: "You have until Saturday {date} to update your preferences.",
      subActivatedDeadlineUrgent: "Today is the last day to update your classes this week.",
      subActivatedCartTitle: "Classes in your cart",
      subActivatedCartDesc: "You have {n} class(es) ready to book right now with your credits.",
      subActivatedCartBtn: "Book now",
      subActivatedCartSkip: "Skip, go to weekly class setup",
      subActivatedCartDone: "Classes booked! Now set up your week.",
      // ── Auto-booking schedule info (dashboard) ─────────────────────────────
      autoBookNextRun: "Next auto-booking: {date}",
      autoBookDeadlineDate: "Update your classes before Saturday {date}",
      autoBookDeadlineToday: "Today is the last day to change your classes",
      autoBookWeekStart: "Week to be booked: {date}",
      subPayTitle: "Subscription payment",
      subscribeBtn: "Subscribe",
      summaryTitle: "Summary · {count} {class}",
      summaryClass: "class",
      summaryClasses: "classes",
      summaryEmpty: "Your basket is empty.",
      totalCredits: "Total credits:",
      totalPrice: "Total:",
      yourBalance: "Your balance:",
      afterBooking: "Remaining after booking:",
      insufficientTitle: "Insufficient credits",
      insufficientDesc: "You need {count} more credit(s).",
      couponLabel: "Offer code (optional)",
      couponApply: "Apply",
      couponApplied: "{code} — discount applied",
      couponPlaceholder: "Enter your code",
      couponRemoveLabel: "Remove coupon",
      couponNotFound: "Coupon not found.",
      couponError: "Error validating coupon.",
      couponInactive: "This coupon is inactive.",
      couponNotYet: "This coupon is not yet valid.",
      couponExpired: "This coupon has expired.",
      couponSuccess: "Coupon applied!",
      reserveBtn: "Reserve ({credits} cr.)",
      nextBtn: "Next",
      continueBtn: "Continue · {price}",
      deleteLabel: "Remove",
      creditsUnit: "cr.",
      classFallback: "Class",
      confirmQuestion: "Confirm booking for {count} class(es)?",
      guestAllFields: "Please fill in all fields correctly.",
      guestPhoneInvalid: "Enter a valid phone number (min 7 digits).",
      noBalanceError: "Could not load your balance.",
      reserveError: "Error processing the booking.",
      reserveSuccess: "Classes booked successfully!",
      reserveSuccessDesc: "Your booking is confirmed. We sent you an email with the details.",
      closeBtn: "Close",
      goToBookings: "View my bookings",
      duplicateBookingTitle: "You already have this class booked",
      duplicateBookingDesc: "{msg}\n\nIf you want to book this class for someone else (family, friend), log out and complete the booking as a guest at checkout.",
      verifyError: "Verification error",
      verifyErrorDesc: "Contact support if you were charged.",
      verifying: "Verifying your payment...",
      sessionExpiredTitle: "Your session expired during checkout",
      sessionExpiredDesc: "Your payment went through. Please log in again to see your credits.",
      paySuccess: "Payment successful!",
      paySuccessDesc: "Updating your credits...",
      confirmTitle: "Recharge Successful!",
      confirmDesc: "Your credits are now available.",
      newBalance: "New balance:",
      bookingCost: "Booking cost:",
      remaining: "Remaining:",
      confirmBooking: "Confirm Booking!",
      guestEmail: "Email",
      guestName: "Name",
      guestPhone: "Phone",
      payConfirmedTitle: "Payment confirmed",
      payConfirmedDesc: "Your credits will be added shortly. We’ll let you know by email.",
      paySessionError: "We couldn’t create the payment session",
      payFormError: "We couldn’t load the payment form.",
      payAuthError: "We couldn’t verify your account. Please log in again.",
    },

    paymentFinish: {
      successTitle: "Payment complete!",
      successDesc: "Your booking is confirmed. You’ll receive an email with the details.",
      backHome: "Back to home",
      timeoutTitle: "Your payment is being processed",
      timeoutDesc: "We haven’t been able to confirm your booking yet. If the payment went through, you’ll receive a confirmation email in a few minutes and your classes will appear in your account.",
      timeoutHint: "If you haven’t received anything within 15 minutes, please contact us before trying to pay again — that way we avoid charging you twice.",
      errorTitle: "Something went wrong",
      noSession: "No session ID was found, so your payment couldn’t be verified.",
      errorHint: "If you were charged, please contact support.",
      backCheckout: "Back to checkout",
      processing: "Processing your payment...",
      dontClose: "Please don’t close this window.",
      processingDesc: "This may take a few seconds while we confirm your booking.",
    },

    updatePrefs: {
      title: "Update Preferences",
      step1Intro: "Enter your email to continue.",
      step2Intro: "Tell us a bit more about yourself.",
      stepOf: "Step {step}/2",
      errorLabel: "Error",
      emailLabel: "Email",
      emailPlaceholder: "your-registered@email.com",
      checkEmailBtn: "Check email and continue",
      interestsLabel: "Interests (you can choose several)",
      interestsPlaceholder: "E.g. Pilates, Yoga",
      experienceLabel: "Experience level",
      selectPlaceholder: "Select...",
      birthDateLabel: "Date of birth",
      daysLabel: "Preferred days (you can choose several)",
      daysPlaceholder: "E.g. Monday, Weekend",
      scheduleLabel: "Preferred time slot",
      back: "Back",
      submit: "Update preferences",
      errEmailRequired: "Please enter your email address.",
      errEmailNotFound: "Email not found. Please check it or sign up first.",
      errEmailCheck: "We couldn’t check your email.",
      errNetwork: "Network error. Please try again later.",
      errIncomplete: "Please fill in all your preferences.",
      success: "Preferences updated!",
      errUpdate: "We couldn’t update your preferences.",
    },

    days: {
      0: "Monday", 1: "Tuesday", 2: "Wednesday", 3: "Thursday",
      4: "Friday", 5: "Saturday", 6: "Sunday",
    },

    plans: {
      badge: "{studio}",
      title: "Choose your plan",
      subtitle: "Answer 3 questions and we'll tell you what suits you. With a plan every class costs less.",
      tabPacks: "Class packs",
      tabSubs: "Monthly membership",
      packFooter: "One-off payment, no renewals. Book whenever you like within the pack's validity.",
      subFooter: "No commitment: cancel anytime from \"My account\".",
      subFooterPay: "Secure payment with Stripe.",
      noPlans: "No plans available at the moment.",
      credits: "{n} credits",
      perCredit: "per credit",
      validDays: "Valid {n} days",
      buyBtn: "Buy",
      subBadge: "Monthly Subscription",
      subCreditsMonth: "{n} credits per month",
      subMonth: "/month",
      subFeature1: "{n} credits every month",
      subFeature2: "Automatic monthly renewal",
      subFeature3: "Book your favourite classes",
      subFeature4: "Cancel whenever you want",
      subFeature5: "No commitment",
      subscribeBtn: "Subscribe",
      popular: "Most Popular",
      // --- Dynamic renewal periods ---
      subRenewal_monthly: "monthly",
      subRenewal_bimonthly: "every 2 months",
      subRenewal_quarterly: "every 3 months",
      subRenewal_biannual: "every 6 months",
      subRenewal_annual: "annual",
      subPeriodSuffix_monthly: "/mo",
      subPeriodSuffix_bimonthly: "/2mo",
      subPeriodSuffix_quarterly: "/qtr",
      subPeriodSuffix_biannual: "/6mo",
      subPeriodSuffix_annual: "/yr",
      subBadgePeriod: "{period} subscription",
      subCreditsPerPeriod: "{n} credits {period}",
      subAutoRenewal: "Automatic {period} renewal",
      saving: "Save {saving}",
    },

    langModal: {
      title: "Select language",
      nativeSection: "Available language",
      applying: "Applying language…",
      applyBtn: "Apply",
      cancelBtn: "Cancel",
    },

    classDetail: {
      backToClasses: "Classes",
      backBtn: "Back to classes",
      credit: "credit",
      credits: "credits",
      instructorLabel: "Instructor",
      instructorViewProfile: "Learn more",
      instructorFallback: "Class instructor",
      spaceLabel: "Studio",
      spaceFallback: "Our Studios",
      spaceViewAll: "See the studio",
      spacePeople: "{n} people · ",
      mainRoom: "Main studio",
      priceLabel: "Price per session",
      bookBtn: "View available times",
      privateBtn: "Private class",
      disclaimer: "No commitment · Cancel up to {hours} h before",
      calendarTitle: "Select your class",
      levelBeg: "Beginner",
      levelInt: "Intermediate",
      levelAdv: "Advanced",
      levelAll: "All levels",
      errorNotFound: "Class not found",
      errorNoData: "No data",
      errorLoad: "Error loading class.",
      errorSlug: "Could not find the class slug.",
      waMessage: "Hello! I'd like to ask about a private class: {title}",
    },

    calendarPage: {
      heading: "Class Schedule",
      subtitle: "Select a day and book your favourite class directly.",
    },

    bottomNav: {
      book: "Book",
      account: "Account",
    },
    calendar: {
      viewDetail: "View detail",
      loading: "Loading classes…",
      noClasses: "No classes for this day",
      classCount_one: "class",
      classCount_other: "classes",
      statusLimited: "Few spots left",
      statusFull: "Full",
      inCart: "In cart",
      addToCart: "Add to cart",
      add: "Add",
      added: "Added ✓",
      prevWeek: "Previous week",
      nextWeek: "Next week",
      onlyDaysHint: "Only the days this class runs are shown. Pick one and tap “Add”.",
      noDatesThisWeek: "No sessions of this class this week.",
      nextDate: "Go to",
      noUpcomingTitle: "No dates right now",
      noUpcomingDesc: "This class isn't on the timetable at the moment. Message us and we'll let you know when it's back.",
    },

    cart: {
      title: "Your Booking",
      balance: "Available balance:",
      creditsToUse: "Credits to use",
      credit: "credit",
      credits: "credits",
      total: "Total",
      checkout: "Proceed to Payment",
      clear: "Clear cart",
      emptyTitle: "Your booking is empty",
      emptyDesc: "Explore the classes and add the ones that inspire you most",
      added: "Added!",
      alreadyIn: "Already in cart",
      full: "Class full",
      open: "Open cart",
    },

    whatsapp: {
      helpLabel: "Need help?",
      message: "Hi! I need some help",
    },
  },
};

// Helper solo para tipos del objeto (no runtime)
function getLangConst() { return "es" as "es" | "en"; }

// ✅ Fusiona diccionarios por idioma (añade namespace nav)
export const dict: Record<"es" | "en", Dict> = {
  es: { ...baseDict.es, nav: nav.es },
  en: { ...baseDict.en, nav: nav.en },
};

// Helpers
function get(obj: Dict, path: string) {
  return path.split(".").reduce<any>((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), obj);
}
/**
 * Sustituye {variables}. Siempre están disponibles {studio} (nombre del
 * estudio) y {city} (ciudad) de la config, para que los textos no lleven la
 * marca escrita a mano.
 */
function interpolate(str: string, params?: Params) {
  if (!str.includes('{')) return str;
  const site = getSiteClient();
  const all: Params = { studio: site.studio_name, city: site.contact.city, ...params };
  return str.replace(/\{(\w+)\}/g, (_, k) => (all[k] != null ? String(all[k]) : ""));
}

/** Locale de Intl para fechas/números según el idioma de la web. */
export function toLocale(lang: string): string {
  return lang === 'en' ? 'en-GB' : 'es-ES';
}

/**
 * Precio en la moneda del estudio (config → currency) con el formato de cada
 * idioma. Con EUR: es → "12,50 €"   ·   en → "€12.50".
 * `decimals` = 'auto' quita los decimales si el número es entero.
 */
export function formatPrice(value: number | string, lang: string, decimals: number | 'auto' = 2): string {
  const n = Number(value) || 0;
  const d = decimals === 'auto' ? (Number.isInteger(n) ? 0 : 2) : decimals;
  const currency = getSiteClient().currency || 'EUR';
  try {
    return new Intl.NumberFormat(toLocale(lang), {
      style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d,
    }).format(n);
  } catch {
    const num = n.toFixed(d);
    return lang === 'en' ? `€${num}` : `${num.replace('.', ',')} €`;
  }
}

/** Símbolo de la moneda del estudio ("€", "$", "£"…) para textos sueltos. */
export function currencySymbol(lang: string = 'es'): string {
  const currency = getSiteClient().currency || 'EUR';
  try {
    const part = new Intl.NumberFormat(toLocale(lang), { style: 'currency', currency })
      .formatToParts(0).find((p) => p.type === 'currency');
    return part?.value || currency;
  } catch {
    return '€';
  }
}

/**
 * Rutas que existen en los dos idiomas. Cualquier otra ruta es la misma para
 * ES y EN (el contenido cambia con el selector, sin recargar).
 */
const ROUTE_PAIRS: [es: string, en: string][] = [
  ['/', '/en'],
  ['/classes', '/en/classes'],
  ['/terminos-condiciones', '/en/terms-conditions'],
  ['/promociones', '/en/promotions-terms'],
];

const normPath = (p: string) => (p.replace(/\/+$/, '') || '/');

/** Ruta equivalente de `path` en `lang` (o null si no hay versión propia). */
export function localizedPath(path: string, lang: string): string | null {
  const p = normPath(path);
  const pair = ROUTE_PAIRS.find(([es, en]) => es === p || en === p);
  if (!pair) return null;
  return lang === 'en' ? pair[1] : pair[0];
}

/** Página cuyo texto está escrito en el HTML (no cambia con el selector). */
export function isStaticLangPage(path: string): boolean {
  const p = normPath(path);
  return p === '/terminos-condiciones' || p === '/promociones' || p.startsWith('/en');
}

// Hook principal
export function useT() {
  const lang = useLangStore((s) => s.lang);
  return React.useCallback(
    (key: string, params?: Params, fallback?: string) => {
      const v = get(dict[lang], key);
      if (typeof v === "string") return interpolate(v, params);
      const fb = get(dict.es, key);
      if (typeof fb === "string") return interpolate(fb, params);
      return fallback ?? key;
    },
    [lang]
  );
}


