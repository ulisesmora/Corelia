// Comprobación E2E de la reserva en la web (no se ejecuta en el build):
//   - invitada sin cuenta en un estudio sin pagos online: varias clases en el
//     panel «Tu reserva», quitar una, «Continuar al pago» y pagar en el estudio;
//   - invitada con tarjeta (pagos simulados en el navegador: no llama a Stripe);
//   - clienta registrada que reserva con créditos (CLIENT_JSON={"id","access"});
//   - eventos sueltos («E_…»): invitada que paga en el estudio y clienta con
//     créditos (EVENT_TITLE=título de un evento futuro con plazas).
//
// Uso (con la web y el API de PRUEBA arrancados y datos de ejemplo, SEED_DEMO=1):
//   npm i --no-save playwright-core && npx playwright install chromium
//   node scripts/e2e-booking.mjs http://127.0.0.1:4321 /tmp/capturas [all|guest|card|client|event]
// CHROME_PATH=… para usar otro Chromium. Reserva de verdad en ese API: nunca en producción.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const exe = process.env.CHROME_PATH || undefined;
const BASE = process.argv[2] || 'http://127.0.0.1:18601';
const OUT = process.argv[3] || '.';
const only = process.argv[4] || 'all';
const browser = await chromium.launch({ executablePath: exe });
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };

async function newPage(width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, isMobile: width < 768, hasTouch: width < 768 });
  if (opts.cardPayments) {
    await ctx.addInitScript(() => {
      let v;
      Object.defineProperty(window, '__SITE__', { configurable: true,
        get() { return v; }, set(x) { v = { ...x, payments_enabled: true, stripe_publishable_key: 'pk_test_mock' }; } });
    });
  }
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.url().includes('/checkout/') && r.request().method() === 'POST' && r.status() >= 400) r.text().then((t) => console.log('  API', r.status(), t.slice(0, 300))).catch(() => {}); });
  page.on('pageerror', (e) => console.log('  pageerror:', e.message.slice(0, 200)));
  return { ctx, page };
}

async function bookFromCalendar(page, n) {
  // Reservar n sesiones distintas desde el horario (salta días si hace falta)
  let booked = 0;
  for (let guard = 0; guard < 10 && booked < n; guard++) {
    const btns = page.locator('.w-cal-row button.sk-btn:has-text("Reservar")');
    const count = await btns.count();
    if (count === 0) {
      const next = page.locator('.w-cal-day:not(:disabled):not(.is-on)').filter({ has: page.locator('i.has') }).first();
      await next.click(); await page.waitForTimeout(600); continue;
    }
    await btns.first().click();
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 5000 });
    booked++;
    if (booked < n) { await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' }); }
  }
  return booked;
}

// ── A) Invitada, estudio sin pagos online: varias clases, quitar, pagar en el estudio ──
if (only === 'all' || only === 'guest') {
  const { ctx, page } = await newPage(390);
  await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.w-cal-row');
  const b1 = await bookFromCalendar(page, 1);
  const dlg = page.getByRole('dialog');
  ok(b1 === 1 && await dlg.isVisible(), 'A1 al pulsar «Reservar» se abre el panel «Tu reserva» (no salta al checkout)');
  ok(page.url().endsWith('/calendar'), 'A1b sigue en el horario');
  ok(await dlg.locator('.w-cart-item').count() === 1, 'A2 el panel muestra 1 clase');
  ok(/14/.test(await dlg.locator('.w-cart-price').first().innerText()), 'A3 precio por clase en la moneda del estudio');
  await page.screenshot({ path: `${OUT}/after-e2e-390-panel-1.png` });
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'hidden' });
  ok(!(await dlg.isVisible()), 'A4 ESC cierra el panel');
  const bar = page.locator('.w-bar button');
  ok(/Ver mi reserva \(1\)/.test(await bar.innerText()), 'A5 barra fija móvil «Ver mi reserva (1)»');
  // segunda clase
  await bookFromCalendar(page, 1).catch(() => 0);
  let items = await dlg.locator('.w-cart-item').count();
  if (items < 2) { // misma sesión ya elegida: probar otro día
    await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'hidden' });
    await page.locator('.w-cal-day:not(:disabled):not(.is-on)').filter({ has: page.locator('i.has') }).nth(1).click();
    await page.waitForTimeout(700);
    await bookFromCalendar(page, 1);
    items = await dlg.locator('.w-cart-item').count();
  }
  ok(items === 2, `A6 carrito con varias clases (${items})`);
  ok(/28/.test(await dlg.locator('.w-cart-total').innerText()), 'A7 total de las 2 clases');
  await page.screenshot({ path: `${OUT}/after-e2e-390-panel-2.png` });
  // foco atrapado: Tab varias veces no sale del diálogo
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'A8 el foco se queda dentro del panel');
  // quitar una
  await dlg.locator('.w-cart-rm').first().click();
  await page.waitForTimeout(300);
  ok(await dlg.locator('.w-cart-item').count() === 1, 'A9 «Quitar» elimina la clase del carrito');
  ok(/quitada/.test(await dlg.locator('[role="status"]').first().innerText()), 'A9b aviso para lectores de pantalla al quitar');
  await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'hidden' });
  await bookFromCalendar(page, 1);
  items = await dlg.locator('.w-cart-item').count();
  if (items < 2) {
    await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'hidden' });
    await page.locator('.w-cal-day:not(:disabled):not(.is-on)').filter({ has: page.locator('i.has') }).nth(2).click();
    await page.waitForTimeout(700);
    await bookFromCalendar(page, 1);
  }
  // bolsa de la cabecera
  await page.keyboard.press('Escape'); await dlg.waitFor({ state: 'hidden' });
  await page.locator('.w-hd-bag').click();
  await dlg.waitFor({ state: 'visible' });
  ok(await dlg.isVisible() && /2/.test(await page.locator('.w-hd-badge').innerText()), 'A10 la bolsa (con número) abre el panel');
  const panelTotal = (await dlg.locator('.w-cart-total strong').innerText()).replace(/[^\d]/g, '');  // «39 €» → «39»
  await dlg.getByRole('link', { name: /Continuar al pago/ }).click();
  await page.waitForURL('**/checkout');
  await page.waitForSelector('input[name="email"]', { timeout: 15000 });
  ok(true, 'A11 «Continuar al pago» lleva al checkout con el formulario de invitada');
  await page.screenshot({ path: `${OUT}/after-e2e-390-checkout-guest.png`, fullPage: true });
  await page.fill('input[name="email"]', 'invitada.e2e@example.com');
  await page.fill('input[name="name"]', 'Inés E2E');
  await page.locator('input[name="phone"]').click(); await page.locator('input[name="phone"]').pressSequentially('600123456');
  await page.getByRole('button', { name: /Reservar y pagar en el estudio/ }).click();
  await page.waitForSelector('[data-testid="guest-studio-done"]', { timeout: 15000 }).catch(async (e) => {
    console.log('  alert:', await page.locator('[data-status="error"]').allInnerTexts()); throw e; });
  const done = await page.locator('[data-testid="guest-studio-done"]').innerText();
  ok(/Plaza reservada/.test(done) && done.replace(/[^\d]/g, '').includes(panelTotal), 'A12 reserva de invitada confirmada (pagar en el estudio)');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('site-cart-storage') || '{}')?.state?.items?.length === 0), 'A13 carrito vacío tras reservar');
  await page.screenshot({ path: `${OUT}/after-e2e-390-guest-done.png`, fullPage: true });
  await ctx.close();
}

// ── B) Invitada con tarjeta (pagos online simulados: sin Stripe real) ──
if (only === 'all' || only === 'card') {
  const { ctx, page } = await newPage(1280, { cardPayments: true });
  let payload = null;
  await page.route('**/api/v1/checkout/create-session/', async (route) => {
    payload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ clientSecret: 'cs_test_mock_secret_123' }) });
  });
  await page.route('https://js.stripe.com/**', (r) => r.abort());
  await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.w-cal-row');
  await bookFromCalendar(page, 1);
  const dlg = page.getByRole('dialog');
  ok(await dlg.isVisible(), 'B1 escritorio: panel lateral abierto al elegir clase');
  await page.screenshot({ path: `${OUT}/after-e2e-1280-panel.png` });
  await dlg.getByRole('link', { name: /Continuar al pago/ }).click();
  await page.waitForURL('**/checkout');
  await page.waitForSelector('form input[type="email"]', { timeout: 15000 });
  await page.fill('form input[type="email"]', 'tarjeta.e2e@example.com');
  await page.locator('form input[type="text"]').first().fill('Tina Tarjeta');
  await page.locator('form input[type="tel"]').click(); await page.locator('form input[type="tel"]').pressSequentially('611222333');
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.waitForTimeout(1500);
  ok(payload && payload.email === 'tarjeta.e2e@example.com' && payload.name === 'Tina Tarjeta'
     && Array.isArray(payload.cart_items) && payload.cart_items.length === 1 && payload.cart_items[0].id_source > 0
     && /Z$/.test(payload.cart_items[0].sessionDate), 'B2 la web pide la sesión de pago con los datos de la invitada y el carrito');
  // vuelta de Stripe
  await page.route('**/api/v1/checkout/verify-checkout/', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'success', amount_total: '14.00', currency: 'EUR' }) }));
  await page.goto(BASE + '/checkout/success?session_id=cs_test_mock', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('site-cart-storage') || '{}')?.state?.items?.length === 0), 'B3 tras pagar, el carrito se vacía y se ve la confirmación');
  await page.screenshot({ path: `${OUT}/after-e2e-1280-card-success.png` });
  await ctx.close();
}

// ── C) Clienta registrada con créditos ──
if ((only === 'all' && process.env.CLIENT_JSON) || only === 'client') {
  const creds = JSON.parse(fs.readFileSync(process.env.CLIENT_JSON, 'utf8'));
  const { ctx, page } = await newPage(390);
  await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
  await page.evaluate((c) => { localStorage.clear(); localStorage.setItem('storageVersion', 'v1.1'); localStorage.setItem('accessToken', c.access); localStorage.setItem('iduser', String(c.id)); localStorage.setItem('sessionTimestamp', String(Date.now())); }, creds);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.w-cal-row');
  await bookFromCalendar(page, 1);
  const dlg = page.getByRole('dialog');
  ok(/crédito/.test(await dlg.locator('.w-cart-total').innerText()), 'C1 con cuenta, el panel muestra el coste en créditos');
  await page.screenshot({ path: `${OUT}/after-e2e-390-panel-client.png` });
  await dlg.getByRole('link', { name: /Continuar al pago/ }).click();
  await page.waitForURL('**/checkout');
  const btn = page.getByRole('button', { name: /Reservar|Confirmar/ }).last();
  await btn.waitFor({ timeout: 15000 });
  await btn.click();
  // diálogo de confirmación
  const confirm = page.getByRole('button', { name: /Confirmar|Sí, reservar|Reservar ahora/ }).last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(2500);
  const txt = await page.locator('body').innerText();
  ok(/Reserva (completada|confirmada)|reservada|¡Reserva/i.test(txt), 'C2 reserva con créditos completada');
  await page.screenshot({ path: `${OUT}/after-e2e-390-client-done.png` });
  await ctx.close();
}

// ── D) Evento suelto: invitada (pagar en el estudio) y clienta con créditos ──
async function bookEvent(page, title) {
  // Busca el día del evento en el horario y pulsa su «Reservar»
  for (let i = 0; i < 8; i++) {
    const row = page.locator('.w-cal-row', { hasText: title });
    if (await row.count()) {
      await row.locator('button.sk-btn:has-text("Reservar")').click();
      await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 5000 });
      return true;
    }
    const days = page.locator('.w-cal-day:not(:disabled)').filter({ has: page.locator('i.has') });
    if (i >= await days.count()) return false;
    await days.nth(i).click(); await page.waitForTimeout(600);
  }
  return false;
}
const EVENT_TITLE = process.env.EVENT_TITLE;
if ((only === 'all' || only === 'event') && EVENT_TITLE) {
  const { ctx, page } = await newPage(390);
  await page.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.w-cal-row');
  ok(await bookEvent(page, EVENT_TITLE), 'D1 el evento sale en el horario y «Reservar» lo añade al panel');
  const dlg = page.getByRole('dialog');
  ok((await dlg.locator('.w-cart-item').innerText()).includes(EVENT_TITLE), 'D2 el panel muestra el evento con su precio');
  await page.screenshot({ path: `${OUT}/after-e2e-390-event-panel.png` });
  await dlg.getByRole('link', { name: /Continuar al pago/ }).click();
  await page.waitForURL('**/checkout');
  await page.waitForSelector('input[name="email"]', { timeout: 15000 });
  await page.fill('input[name="email"]', 'evento.e2e@example.com');
  await page.fill('input[name="name"]', 'Eva Evento');
  await page.locator('input[name="phone"]').click(); await page.locator('input[name="phone"]').pressSequentially('600987654');
  await page.getByRole('button', { name: /Reservar y pagar en el estudio/ }).click();
  await page.waitForSelector('[data-testid="guest-studio-done"]', { timeout: 15000 });
  ok((await page.locator('[data-testid="guest-studio-done"]').innerText()).includes(EVENT_TITLE), 'D3 invitada: evento reservado para pagar en el estudio');
  await page.screenshot({ path: `${OUT}/after-e2e-390-event-guest-done.png`, fullPage: true });
  await ctx.close();

  if (process.env.CLIENT_JSON) {
    const creds = JSON.parse(fs.readFileSync(process.env.CLIENT_JSON, 'utf8'));
    const { ctx: c2, page: p2 } = await newPage(390);
    await p2.goto(BASE + '/calendar', { waitUntil: 'networkidle' });
    await p2.evaluate((c) => { localStorage.clear(); localStorage.setItem('storageVersion', 'v1.1'); localStorage.setItem('accessToken', c.access); localStorage.setItem('iduser', String(c.id)); localStorage.setItem('sessionTimestamp', String(Date.now())); }, creds);
    await p2.reload({ waitUntil: 'networkidle' });
    await p2.waitForSelector('.w-cal-row');
    await bookEvent(p2, EVENT_TITLE);
    ok(/2 créditos/.test(await p2.getByRole('dialog').locator('.w-cart-total').innerText()), 'D4 con cuenta, el evento cuesta sus créditos');
    await p2.getByRole('dialog').getByRole('link', { name: /Continuar al pago/ }).click();
    await p2.waitForURL('**/checkout');
    let reserveRes = null;
    p2.on('response', (r) => { if (r.url().includes('/checkout/reserve/')) r.json().then((j) => { reserveRes = j; }).catch(() => {}); });
    const btn = p2.getByRole('button', { name: /Reservar|Confirmar/ }).last();
    await btn.waitFor({ timeout: 15000 });
    await btn.click();
    const confirm = p2.getByRole('button', { name: /Confirmar|Sí, reservar|Reservar ahora/ }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await p2.waitForTimeout(2500);
    ok(reserveRes && reserveRes.status === 'success' && Number(reserveRes.credits_spent) === 2, 'D5 clienta: evento reservado con 2 créditos');
    await p2.screenshot({ path: `${OUT}/after-e2e-390-event-client-done.png` });
    await c2.close();
  }
}

await browser.close();
console.log(failures ? `\n${failures} FALLOS` : '\nTODO OK');
process.exit(failures ? 1 : 0);
