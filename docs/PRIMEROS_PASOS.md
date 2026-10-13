# Primeros pasos

Guía para la persona que gestiona el estudio. No hace falta saber de informática.

## 1. Entra en tu panel

Abre la dirección de tu panel (el dominio del servicio **api** en Railway, algo como
`https://api-production-xxxx.up.railway.app`) y entra con el email y la contraseña
que pusiste al desplegar.

> Truco: en el móvil, el panel te ofrece **instalarlo como app**. Así lo tienes a
> mano con su icono.

## 2. El asistente de bienvenida (5 minutos)

La primera vez se abre solo. Cinco pasos:

1. **Tu estudio**: nombre, logo y cómo te contactan (teléfono, WhatsApp, Instagram, dirección).
2. **Tu estilo**: elige una paleta de colores y una tipografía. Lo ves aplicado al momento.
3. **Emails** *(opcional)*: para que tus clientas reciban confirmaciones y avisos.
   Con Gmail son 3 pasos y el panel te enseña dónde pulsar.
4. **Pagos** *(opcional)*: conecta Stripe para cobrar con tarjeta. Si no, vendes los
   bonos en el estudio.
5. **¡Listo!**

Todo se puede cambiar después en **Ajustes**.

## 3. Crea tus clases

Si cargaste los datos de ejemplo, ya verás unas clases en la web. Cámbialas por las tuyas:

1. **Horarios → Añadir una clase**: el tipo de clase (Pilates Mat, Yoga…), la sala, el día, la hora y las plazas.
2. **Bonos y membresías**: tus precios. Cada clase gasta 1 crédito (puedes cambiarlo).
3. **Instructores** y **Salas**: con su foto y descripción.

## 4. Tus clientas

- Se registran solas en la web, o las das de alta tú en **Clientas** (incluso sin email).
- Si pagan en el estudio, añádeles los créditos en **Créditos**.
- En **Reservas** ves quién viene a cada clase y puedes apuntar o cancelar a cualquiera.

## 5. Tu propio dominio (opcional)

Para que tu web sea `www.tuestudio.com`: en el panel → **Ajustes → Tu dominio** tienes el
paso a paso y un botón para comprobar que ya funciona. Más detalle en
[DESPLIEGUE.md](DESPLIEGUE.md#4-tu-propio-dominio-opcional).

## ¿Algo no funciona?

- **No llegan los emails**: Ajustes → Emails → «Enviarme un email de prueba». Si falla,
  el mensaje te dice por qué (casi siempre es la contraseña de aplicación de Gmail).
- **La web no muestra mis cambios**: espera un minuto y recarga (la web guarda los
  ajustes un ratito para ir más rápida).
- **He olvidado la contraseña del panel**: en Railway → servicio **api** → *Variables*,
  cambia `ADMIN_PASSWORD`… solo funciona si no hay ninguna cuenta; si ya la hay, pide
  ayuda a quien te lo instaló (comando `python manage.py changepassword tu@email.com`).
