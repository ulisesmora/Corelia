# Checklist antes de publicar el repositorio

## 1. Seguridad (obligatorio)

Los repos originales de DOM (`hom-api`, `hom`, `hom-crm`) llevan secretos reales en
el código **y en su historial de git**. Este monorepo se creó copiando el código sin
historial y sin esos secretos, pero conviene igualmente:

- [ ] **Rotar los secretos de DOM** (aunque los repos sean privados, cualquier persona
      con acceso los tiene):
  - Stripe: claves `sk_live`/`pk_live` y el secreto del webhook → dashboard.stripe.com/apikeys
  - AWS: el par de claves de acceso del bucket `hom-costadelsol` → IAM
  - Firebase: borrar la cuenta de servicio de `hom.json` y crear otra → Google Cloud IAM
  - Contraseñas de Postgres y Redis de Railway (regenerar desde Railway)
  - Resend, Twilio, SendGrid (si siguen activos), claves VAPID
  - `SECRET_KEY` de Django y la clave de firma de los JWT (cambiarla cierra las sesiones)
- [ ] Antes del primer commit del monorepo, comprobar que no se ha colado nada:
  ```bash
  grep -rnE "sk_live|sk_test_|pk_live|AKIA|re_[A-Za-z0-9]{20}|whsec_|SG\.|BEGIN PRIVATE KEY|railway\.internal|rlwy\.net" \
    --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=dist .
  ```
- [ ] Crear el repositorio público **nuevo** (no hacer público ninguno de los antiguos).

## 2. Licencia

- [x] Licencia **AGPL-3.0** (`LICENSE`): quien lo ofrezca como servicio debe publicar sus
      cambios; protege el modelo «código abierto + instalación gestionada de pago».

## 3. Plantilla de Railway

- [ ] Crear la plantilla siguiendo `docs/RAILWAY_TEMPLATE.md`.
- [ ] Poner su URL en el botón del `README.md`.

## 4. Prueba completa en una cuenta limpia

- [ ] Botón «Deploy on Railway» → rellenar email y contraseña → desplegar.
- [ ] Entrar al panel → completar el asistente con OTRA marca (otro nombre, logo y colores).
- [ ] Abrir la web: nombre, logo, colores, fuentes y contacto son los nuevos; ninguna mención a DOM.
- [ ] Registrarse como clienta en la web, recibir créditos desde el panel y reservar una clase.
- [ ] Sin email ni Stripe configurados: todo lo anterior funciona y la web no ofrece pago con tarjeta.
- [ ] Activar Gmail en el asistente → llega el email de prueba → reservar → llega la confirmación.
- [ ] Conectar Stripe en modo prueba (`sk_test`/`pk_test`) → comprar un bono con la tarjeta
      `4242 4242 4242 4242` → los créditos aparecen solos.
- [ ] Instalar la web en el móvil y recibir un aviso push.
