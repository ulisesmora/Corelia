# «Conectar pagos» con Stripe Connect

Por defecto cada estudio cobra con **sus propias claves de Stripe**: las pega en el panel
(Ajustes → Pagos online) y el aviso de pagos (webhook) se crea solo. Así sigue funcionando
si no configuras nada de esta página.

«Conectar pagos» es la alternativa para quien instala Corelia **para otros** (una agencia,
un gestor con varios estudios…): tú tienes una **plataforma de Stripe Connect** y el estudio
solo pulsa un botón. Stripe le abre **su propia cuenta**, le pide sus datos y su banco, y a
partir de ahí:

- el dinero de cada pago va **directo al banco del estudio**;
- **la plataforma no cobra nada** (sin `application_fee`: 0 %);
- **Stripe le cobra al estudio su comisión** por pago y responde de devoluciones y
  contracargos con el estudio, no contigo;
- el estudio tiene **su panel de Stripe completo** (pagos, reembolsos, transferencias,
  facturas…), igual que si se hubiera dado de alta por su cuenta.

A ti, como plataforma, no te cuesta nada («Stripe gestiona los precios»).

## Cómo funciona por dentro

| | |
|---|---|
| Cuenta del estudio | **Accounts v2** (`POST /v2/core/accounts`): `dashboard: full`, `defaults.responsibilities.fees_collector: stripe` y `losses_collector: stripe`, capacidad `card_payments`. Se crea una sola vez (`api/utils/stripe_connect.py → create_account`). |
| Alta | **Account Links** alojados por Stripe (`POST /v2/core/account_links`). Corelia construye las direcciones de vuelta en el servidor (solo pantallas del panel). |
| Estado | Siempre `GET /v1/accounts/{id}`: al volver de Stripe, con «Comprobar» y con cada aviso `account.updated`. |
| Cobros | **Cargos directos** en la cuenta del estudio: el API usa la clave de la plataforma con la cabecera `Stripe-Account` y la web carga Stripe.js con `loadStripe(pk_plataforma, {stripeAccount})`. |
| Apple Pay / Google Pay | Al activarse la cuenta, Corelia registra los dominios de la web (y su versión con/sin `www`) y del panel en la cuenta del estudio; otra vez si cambias de dominio en el panel. |
| Avisos | Un endpoint «Connect» de tu plataforma → `https://TU_API/api/v1/webhooks/connect/`. |

El estudio ve en **Ajustes → Pagos online** (y en el asistente de bienvenida) una tarjeta
«Conectar pagos» según el estado de su cuenta:

| Estado | Qué ve |
|---|---|
| sin cuenta | ventajas, país de su negocio (no se puede cambiar después) y **Conectar pagos** |
| alta a medias | **Continuar en Stripe** |
| Stripe revisando | «Stripe está revisando tus datos…» y **Comprobar** |
| faltan datos | **Completar datos en Stripe** |
| activa | «Pagos conectados», etiqueta «Modo prueba» si es de prueba, **Abrir mi Stripe** y **Desconectar** |

Las claves de siempre quedan en «Avanzado: usar mis propias claves de Stripe». La guía de
puesta en marcha marca «Pagos con tarjeta» hecho cuando la cuenta puede cobrar.

## 1. En Stripe (empieza en modo prueba)

Hazlo primero con el interruptor **Modo de prueba** activado; luego repite en real.

1. **Activa Connect**: [dashboard.stripe.com/connect](https://dashboard.stripe.com/connect)
   → empezar. Tipo de plataforma: **software (SaaS)**: los estudios venden a sus clientas y
   la plataforma les da el software.
2. **Perfil de la plataforma y precios**: cuando Stripe pregunte quién paga las comisiones
   y quién responde de las pérdidas, elige **Stripe** («Stripe gestiona los precios» /
   *Stripe handles pricing*): las cuentas conectadas pagan sus comisiones a Stripe y tú no
   pagas nada por ellas. Que las cuentas tengan **acceso completo al Dashboard de Stripe**.
3. **Marca**: [Ajustes → Connect → Marca](https://dashboard.stripe.com/settings/connect)
   (nombre, icono y color): es lo que el estudio ve en el alta.
4. **Métodos de pago de las cuentas conectadas**:
   [Ajustes → Métodos de pago → Cuentas conectadas](https://dashboard.stripe.com/settings/payment_methods/connected_accounts).
   Deja activas tarjetas, Apple Pay, Google Pay y Link y añade los de cada país que te
   interesen (Bizum en España, MB WAY en Portugal, OXXO en México…). Es la configuración
   «padre»: cada estudio la hereda y puede ajustarla en su panel de Stripe.
   - **Reservas sin métodos asíncronos** (recomendado si activas OXXO, Multibanco,
     transferencias, Boleto…): crea una **segunda configuración** («Reservas»), sin esos
     métodos, y copia su id (`pmc_…`) en `STRIPE_CONNECT_BOOKING_PMC`. Corelia la usa solo
     en el pago de reservas de clase: un pago que tarda días en confirmarse no debe dejar la
     plaza retenida. Bonos y membresías usan la configuración por defecto.
5. **Aviso de pagos (webhook) de Connect**:
   [Workbench → Webhooks → Añadir destino](https://dashboard.stripe.com/workbench/webhooks):
   - **Eventos de**: **Cuentas conectadas** (*Connected accounts*).
   - **Versión de la API**: la misma que usa Corelia, `2026-09-30.endive` (compruébalo con
     `cd api && uv run python -c "import stripe; print(stripe.api_version)"`).
   - **Eventos**: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `invoice.paid`,
     `customer.subscription.updated`, `customer.subscription.deleted`, `account.updated`,
     `account.application.deauthorized` (la lista está en
     `api/utils/payments.py → CONNECT_WEBHOOK_EVENTS`).
   - **URL**: `https://TU_API/api/v1/webhooks/connect/`, con la dirección **fija** del
     servidor del API (la de Railway o tu `API_URL`), no un dominio que el estudio pueda
     cambiar desde el panel.
   - Copia el **secreto de firma** (`whsec_…`).
6. **Claves de la plataforma**: [Desarrolladores → Claves de API](https://dashboard.stripe.com/apikeys):
   la secreta (`sk_test_…`) y la publicable (`pk_test_…`).

## 2. Variables de entorno (servicio **api**)

| Variable | Qué es |
|---|---|
| `STRIPE_CONNECT_PLATFORM_KEY` | Clave secreta de la plataforma (`sk_test_…` / `sk_live_…`). |
| `STRIPE_CONNECT_PUBLISHABLE_KEY` | Clave publicable de la plataforma, **del mismo modo** (`pk_test_…` / `pk_live_…`). |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `whsec_…` del endpoint de Connect del paso 5. |
| `STRIPE_CONNECT_BOOKING_PMC` | Opcional: `pmc_…` de la configuración «Reservas» del paso 4. |
| `STRIPE_CONNECT_COUNTRIES` | Opcional: países donde se ofrece, ISO-2 separados por comas. Por defecto los de Corelia donde Stripe abre cuentas: `ES,PT,FR,DE,IT,NL,BE,AT,LU,FI,GR,IE,GB,CH,LI,US,CA,MX,BR` ([stripe.com/global](https://stripe.com/global)). |
| `STRIPE_CONNECT_AVAILABILITY_CHECK` | Opcional: ruta a una función `f(site_config) -> bool` que decide si a este estudio se le ofrece «Conectar pagos» (para activarlo poco a poco). Solo decide si se puede **empezar**: una cuenta ya conectada sigue cobrando. |
| `PANEL_URL` | Opcional: dirección del panel a la que se vuelve desde Stripe. Por defecto la del API (donde se sirve el panel) o el dominio propio del panel. En desarrollo con Vite: `http://localhost:5173`. |

«Conectar pagos» solo aparece si están la clave secreta **y** la publicable y son del mismo
modo. Sin ellas, el panel y la web son exactamente los de siempre.

## 3. Probar (modo prueba)

1. Panel → Ajustes → Pagos online → **Conectar pagos** → elige el país → en Stripe, usa los
   datos de prueba que ofrece el propio formulario (el botón de rellenar con datos de prueba).
2. Al volver, la tarjeta pasa a «Stripe está revisando…» o directamente a «Pagos
   conectados · Modo prueba».
3. En la web: compra un bono con `4242 4242 4242 4242`, una reserva como invitada, prueba
   3D Secure (`4000 0027 6000 3184`), un reembolso (cancela la clase desde el panel) y una
   membresía (con un *test clock* para ver la renovación).
4. Avisos en local: `stripe listen --forward-connect-to localhost:8000/api/v1/webhooks/connect/`
   (usa el `whsec_` que imprime como `STRIPE_CONNECT_WEBHOOK_SECRET`).
5. Desautoriza la plataforma desde el panel de Stripe del estudio: Corelia la desenlaza
   sola (`account.application.deauthorized`) y la web deja de ofrecer el pago con tarjeta.

## 4. Pasar a real

Repite los pasos 1-6 de Stripe **con el modo de prueba desactivado** (en real el endpoint
de Connect, las configuraciones `pmc_…` y las claves son otras) y cambia las variables.
Las cuentas creadas en prueba no existen en real: el estudio verá «Tu cuenta conectada es
de otro modo de Stripe» y tendrá que **Desconectar** y volver a **Conectar pagos**.

## 5. Estudios que ya cobraban con sus claves

Pulsar «Conectar pagos» **crea una cuenta de Stripe nueva** para el estudio (no enlaza la
que ya tenía). Lo que pasa en la transición:

- Mientras la cuenta nueva no está activa, la web sigue cobrando con las claves.
- Cuando se activa, los cobros nuevos van a la cuenta nueva. **No borres las claves** del
  panel mientras queden cosas en la cuenta antigua: las **membresías** creadas con las
  claves siguen renovándose allí (y su aviso sigue llegando al webhook de las claves), y
  los **reembolsos** de pagos antiguos se hacen en la cuenta donde se cobraron
  (`Payment.stripe_account`: vacío = la de las claves).
- Las membresías no se mudan solas de cuenta: o se dejan terminar, o la clienta se vuelve
  a suscribir, o el estudio pide a Stripe una migración de datos entre sus dos cuentas.
- Clientes (`cus_…`) y precios (`price_…`) son de cada cuenta: Corelia crea clientes
  nuevos en la cuenta conectada y, si un plan tenía un `stripe_price_id` de la cuenta
  antigua, cobra con el importe del plan.
- Durante un tiempo el estudio tendrá saldo, transferencias e informes en dos cuentas.
- Si vuelve a conectar claves en «Avanzado», la web vuelve a cobrar con ellas.

Más adelante se podría añadir el alta por OAuth para enlazar la cuenta que el estudio ya
tiene; hoy no está.

## 6. Desconectar

**Desconectar** en el panel solo hace que Corelia deje de usar la cuenta: sigue siendo del
estudio en Stripe, con su dinero y su panel, y sigue enlazada a tu plataforma. Si vuelve a
pulsar «Conectar pagos», se reutiliza la misma cuenta (sin repetir el alta). Si el estudio
desautoriza tu plataforma desde Stripe, Corelia la desenlaza sola.

Los avisos de Connect llegan de **todas** las cuentas de tu plataforma: cada instalación
procesa solo los de su cuenta y del mismo modo (prueba / real) y responde 200 al resto.

## 7. Para integradores

`api/utils/stripe_connect.py` envía dos señales de Django (con `send()`, no
`send_robust()`: si un receptor falla, el error no se calla):

- `stripe_account_linked(site_config, account_id)`: cuenta creada o reutilizada. Se envía
  dentro de la transacción: si un receptor lanza una excepción, el enlace no se guarda.
- `stripe_payments_changed(site_config, account_id, status, reason)`: cambió si se puede
  cobrar o el estado de la cuenta, y al desconectarla (`reason`: `webhook`, `panel`,
  `relinked`, `disconnected`, `deauthorized`).

Endpoints del panel (solo administración), en `api/views_payments.py`:
`GET /api/v1/site-config/stripe/connect/status/` y `POST …/start/`, `…/sync/`,
`…/disconnect/`.
