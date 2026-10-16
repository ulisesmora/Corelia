"use client";
// Panel «Tu reserva»: las clases elegidas, cuándo son, lo que cuesta cada una
// (créditos o dinero en la moneda del estudio), el total y «Continuar al pago».
//  - Escritorio: cajón a la derecha. Móvil: hoja que sube desde abajo.
//  - Se abre al elegir una clase (lib/booking.ts → addToCart) y desde la bolsa
//    de la cabecera o la barra «Ver mi reserva (n)» del móvil (Navbar.tsx).
//  - Accesible: diálogo modal (foco atrapado, ESC y clic fuera cierran, el foco
//    vuelve a donde estaba), título y botones con nombre, aviso al quitar.
// Estilos: .w-cart-* en styles/site.css (solo tokens de presets.css).
import React, { useEffect, useMemo, useState } from 'react';
import { Drawer, Portal, CloseButton } from '@chakra-ui/react';
import { Icon } from './ui/Icon';
import { useCartStore, type CartItem } from './stores/car.store';
import { useT, formatPrice } from '../i18n';
import { useLangStore } from './stores/lang.store';
import { fmtDate, fmtTime } from '../utils/formatDate';
import { tr } from '../utils/localized';
import { paymentOptions, studioMethodsText, studioPayNote } from '../utils/payments';

const MOBILE = '(max-width: 767px)';

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(MOBILE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(MOBILE);
    if (!mq) return undefined;
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return mobile;
}

function hasSession(): boolean {
  try { return !!localStorage.getItem('accessToken'); } catch { return false; }
}

const num = (v: unknown) => Number(v) || 0;

/** «1 crédito», «2 créditos». */
function creditsLabel(n: number, t: ReturnType<typeof useT>): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${v} ${n === 1 ? t('cart.credit') : t('cart.credits')}`;
}

function ItemRow({ item, preferCredits, onRemove }: { item: CartItem; preferCredits: boolean; onRemove: () => void }) {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const locale = lang === 'en' ? 'en-GB' : 'es-ES';
  const title = tr(item, 'title', lang) || item.title;
  const credits = num(item.credits);
  const price = num(item.price);
  const showCredits = credits > 0 && (preferCredits || price <= 0);
  const main = showCredits ? creditsLabel(credits, t) : price > 0 ? formatPrice(price, lang, 'auto') : '';
  const alt = showCredits && price > 0 ? t('cart.orPrice', { price: formatPrice(price, lang, 'auto') })
    : !showCredits && credits > 0 ? t('cart.orPrice', { price: creditsLabel(credits, t) }) : '';
  const start = new Date(item.sessionDate);
  const end = item.sessionDateEnd ? new Date(item.sessionDateEnd) : null;
  const hm = { hour: '2-digit', minute: '2-digit' } as const;

  return (
    <li className="w-cart-item">
      <div className="w-cart-when" aria-hidden>
        <small>{fmtDate(start, locale, { weekday: 'short' }).replace('.', '')}</small>
        <b>{fmtDate(start, locale, { day: 'numeric' })}</b>
      </div>
      <div className="w-cart-info">
        <b>{title}</b>
        <span className="w-cart-date">
          {fmtDate(start, locale, { weekday: 'long', day: 'numeric', month: 'short' })}
          {' · '}
          {fmtTime(start, locale, hm)}{end ? `–${fmtTime(end, locale, hm)}` : ''}
        </span>
        {main && (
          <span className="w-cart-price">
            <strong>{main}</strong>{alt && <em> {alt}</em>}
          </span>
        )}
      </div>
      <button type="button" className="w-cart-rm" onClick={onRemove} aria-label={t('cart.remove', { title })}>
        <Icon name="trash" size={16} aria-hidden />
      </button>
    </li>
  );
}

export function CartDrawer() {
  const t = useT();
  const lang = useLangStore((s) => s.lang);
  const items = useCartStore((s) => s.items);
  const open = useCartStore((s) => s.panelOpen);
  const closePanel = useCartStore((s) => s.closePanel);
  const removeItem = useCartStore((s) => s.removeItem);
  const mobile = useIsMobile();
  const [loggedIn, setLoggedIn] = useState(false);
  const [live, setLive] = useState('');
  const [onCalendar, setOnCalendar] = useState(false);

  // Hay panel en esta página: «Reservar» lo abre en vez de ir al checkout
  useEffect(() => {
    const w = window as Window & { __skCartPanel?: boolean };
    w.__skCartPanel = true;
    setOnCalendar(/^\/calendar\/?$/.test(window.location.pathname));
    setLoggedIn(hasSession());
    // Las clases que ya han empezado no se pueden reservar: fuera del carrito
    const now = Date.now();
    const current = useCartStore.getState().items;
    const future = current.filter((i) => new Date(i.sessionDate).getTime() >= now);
    if (future.length < current.length) useCartStore.setState({ items: future });
    return () => { w.__skCartPanel = false; };
  }, []);

  useEffect(() => { if (open) { setLoggedIn(hasSession()); setLive(''); } }, [open]);

  const totalCredits = useMemo(() => items.reduce((a, i) => a + num(i.credits), 0), [items]);
  const totalPrice = useMemo(() => items.reduce((a, i) => a + num(i.price), 0), [items]);
  // Con cuenta se paga con créditos; sin cuenta, con dinero (tarjeta o en el estudio)
  const preferCredits = loggedIn ? totalCredits > 0 : totalPrice <= 0;
  const mainTotal = preferCredits ? creditsLabel(totalCredits, t) : formatPrice(totalPrice, lang, 'auto');
  const altTotal = preferCredits
    ? (totalPrice > 0 ? t('cart.orPrice', { price: formatPrice(totalPrice, lang, 'auto') }) : '')
    : (totalCredits > 0 ? t('cart.orPrice', { price: creditsLabel(totalCredits, t) }) : '');
  const count = items.length;
  const classes = count === 1 ? t('cart.classOne') : t('cart.classMany', { count });
  const calendarHref = t('nav.items.calendar.href') || '/calendar';

  // Cómo podrá pagar, según «Formas de cobro» del estudio (la elección se hace en el pago)
  const en = lang === 'en';
  const o = paymentOptions();
  const ways: { key: string; icon: 'tag' | 'credit-card' | 'store' | 'user-circle'; label: string }[] = [];
  if (loggedIn && totalCredits > 0) ways.push({ key: 'credits', icon: 'tag', label: en ? 'Your credits' : 'Tus créditos' });
  if (totalPrice > 0 && o.drop_in_online && (loggedIn || o.guest_booking)) ways.push({ key: 'card', icon: 'credit-card', label: en ? 'Card now' : 'Tarjeta ahora' });
  if (loggedIn ? o.pay_at_studio.clients : o.pay_at_studio.guests) ways.push({ key: 'studio', icon: 'store', label: en ? 'At the studio' : 'En el estudio' });
  if (!loggedIn && !ways.length) ways.push({ key: 'account', icon: 'user-circle', label: en ? 'With your account' : 'Con tu cuenta' });
  const studioWay = ways.some((w) => w.key === 'studio');
  const studioMethods = studioWay ? studioMethodsText(lang) : '';
  const studioNote = studioWay ? studioPayNote(lang) : '';

  const remove = (item: CartItem) => {
    removeItem(item.id);
    setLive(t('cart.removedLive', { title: tr(item, 'title', lang) || item.title }));
  };

  return (
    <Drawer.Root
      open={open}
      onOpenChange={({ open: o }) => { if (!o) closePanel(); }}
      placement={mobile ? 'bottom' : 'end'}
      size={mobile ? 'full' : 'sm'}
    >
      <Portal>
        <Drawer.Backdrop bg="var(--overlay)" />
        <Drawer.Positioner>
          <Drawer.Content
            className="w-cart"
            aria-label={t('cart.dialogLabel')}
            // Fondo opaco de la página (algunos estilos tienen superficies translúcidas)
            bg="var(--page-bg)"
            color="var(--page-text)"
            boxShadow="var(--shadow-float)"
            maxW={mobile ? '100%' : '420px'}
            h={mobile ? 'auto' : '100%'}
            maxH={mobile ? '88dvh' : '100%'}
            borderTopRadius={mobile ? 'min(var(--radius-card-lg), 24px)' : 0}
            borderBottomRadius={0}
            fontFamily="var(--font-body)"
          >
            {mobile && <span className="w-cart-grip" aria-hidden />}
            <Drawer.Header className="w-cart-head">
              <Drawer.Title className="w-cart-title">
                {t('cart.title')}
                {count > 0 && <span className="w-cart-count" aria-label={classes}>{count}</span>}
              </Drawer.Title>
              <Drawer.CloseTrigger asChild position="static">
                <CloseButton size="md" aria-label={t('cart.close')} />
              </Drawer.CloseTrigger>
            </Drawer.Header>

            <Drawer.Body className="w-cart-body">
              <p className="w-sr" role="status" aria-live="polite">{live}</p>
              {count === 0 ? (
                <div className="w-cart-empty">
                  <span className="w-cart-empty-ic"><Icon name="bag" size={22} aria-hidden /></span>
                  <b>{t('cart.emptyTitle')}</b>
                  <p>{t('cart.emptyDesc')}</p>
                  {onCalendar
                    ? <button type="button" className="w-btn sk-btn" onClick={closePanel}>{t('cart.seeTimetable')}</button>
                    : <a className="w-btn sk-btn" href={calendarHref}>{t('cart.seeTimetable')}</a>}
                </div>
              ) : (
                <ul className="w-cart-list">
                  {items.map((item) => (
                    <ItemRow key={item.id} item={item} preferCredits={preferCredits} onRemove={() => remove(item)} />
                  ))}
                </ul>
              )}
            </Drawer.Body>

            {count > 0 && (
              <Drawer.Footer className="w-cart-foot">
                <div className="w-cart-total">
                  <span>{t('cart.total')} · {classes}</span>
                  <span><strong>{mainTotal}</strong>{altTotal && <em> {altTotal}</em>}</span>
                </div>
                <ul className="w-cart-pay" aria-label={en ? 'How you can pay' : 'Cómo puedes pagar'} data-testid="cart-pay-ways">
                  {ways.map((w) => (
                    <li key={w.key} data-way={w.key}><Icon name={w.icon} size={13} aria-hidden /> {w.label}</li>
                  ))}
                </ul>
                {(studioMethods || studioNote) && (
                  <p className="w-cart-pay-note">
                    {en ? 'At the studio' : 'En el estudio'}{studioMethods ? `: ${studioMethods}.` : '.'}{studioNote ? ` ${studioNote}` : ''}
                  </p>
                )}
                <a className="w-btn w-btn--lg w-btn--block sk-btn" href="/checkout">
                  {t('cart.checkout')} <Icon name="arrow-right" size={16} aria-hidden />
                </a>
                {onCalendar ? (
                  <button type="button" className="w-btn w-btn--block sk-btn-ghost" onClick={closePanel}>
                    <Icon name="plus" size={14} aria-hidden /> {t('cart.addMore')}
                  </button>
                ) : (
                  <a className="w-btn w-btn--block sk-btn-ghost" href={calendarHref}>
                    <Icon name="plus" size={14} aria-hidden /> {t('cart.addMore')}
                  </a>
                )}
              </Drawer.Footer>
            )}
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}

export default CartDrawer;
