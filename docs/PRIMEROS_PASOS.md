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
2. **Tu estilo**: el estilo de la web, la tipografía y la paleta de colores. Lo ves aplicado al momento.
3. **Emails** *(opcional)*: para que tus clientas reciban confirmaciones y avisos.
   Con Gmail son 3 pasos y el panel te enseña dónde pulsar.
4. **Pagos** *(opcional)*: conecta Stripe para cobrar con tarjeta. Si no, vendes los
   bonos en el estudio.
5. **¡Listo!** Te lleva a la guía de puesta en marcha.

Todo se puede cambiar después en **Ajustes**.

## 3. La guía de puesta en marcha (paso a paso, hasta publicar)

En el menú, **Puesta en marcha** (y en Inicio, la tarjeta «N de 11 pasos» con el botón
**Siguiente paso**). Los pasos van en el orden en que se necesitan las cosas: así, cuando
llegas al horario y a los precios, ya tienes todo lo que hace falta.

1. **Tu estudio** y 2. **Tu estilo** (lo del asistente).
3. **Salas**: ya te creamos «Sala principal» con 10 plazas; cámbiala si quieres.
4. **Profesores**: quién da las clases (si eres tú, añádete).
5. **Tipos de clase**: elige de una lista de plantillas (Reformer, Mat, Barre, Yoga, Hatha,
   Vinyasa, Funcional…) con su descripción en español e inglés, y cámbialas a tu gusto.
6. **Horario semanal**: qué clase se da cada día y a qué hora.
7. **Bonos y cuotas**: tus precios.
8. **Pagos y emails**, 9. **Contenido de la web** (fotos, textos, preguntas, opiniones) y
   10. **Que te encuentren en Google** (ficha de Google Maps, Search Console, dominio): opcionales.
11. **Prueba y lanzamiento**: haz una reserva de prueba, da de alta a tus clientas y pulsa
    **Publicar mi web**.

Cada pantalla del panel te enseña arriba su paso: qué es, por qué importa, un ejemplo y
«Siguiente: …» cuando lo terminas. En el ordenador ves al lado cómo queda tu web.

> **Tu web funciona desde el primer día** (puedes reservar y compartirla), pero **no sale
> en Google hasta que la publicas**: así no se indexan datos a medio hacer. «Publicar mi
> web» se activa cuando tienes lo imprescindible (pasos 1 a 7).

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
