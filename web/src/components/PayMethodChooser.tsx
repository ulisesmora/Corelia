"use client";
// «¿Cómo quieres pagar?» en el checkout y en el panel «Tu reserva»: solo las
// formas que el estudio tiene encendidas en Ajustes → Cobros («Formas de
// cobro», lib/site.ts → PaymentOptions): tarjeta ahora, en el estudio (con las
// formas de pago y la nota del estudio) o con los créditos de su cuenta.
// Grupo de radios nativos: teclado (flechas) y lectores de pantalla de serie.
import React, { useId } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { studioMethodsText, studioPayNote } from '../utils/payments';

export type PayMethod = 'credits' | 'card' | 'studio' | 'pack';

export interface PayChoice {
  key: PayMethod;
  title: string;
  desc?: string;
  /** Importe o créditos a la derecha */
  amount?: string;
}

const ICONS: Record<PayMethod, IconName> = {
  credits: 'tag',
  card: 'credit-card',
  studio: 'store',
  pack: 'bag',
};

const COPY = {
  es: {
    legend: '¿Cómo quieres pagar?',
    card: 'Pagar ahora con tarjeta',
    cardDesc: 'Pago seguro. Tu plaza queda confirmada al momento.',
    studio: 'Pagar en el estudio',
    studioDesc: 'Guardas tu plaza ahora y pagas al llegar.',
    studioHow: (m: string) => `Al llegar, en ${m}.`,
    credits: 'Usar mis créditos',
    creditsDesc: (b: string) => `Tienes ${b}.`,
    pack: 'Comprar un bono',
    packDesc: 'Compra créditos y reserva con ellos.',
  },
  en: {
    legend: 'How would you like to pay?',
    card: 'Pay now by card',
    cardDesc: 'Secure payment. Your spot is confirmed straight away.',
    studio: 'Pay at the studio',
    studioDesc: 'Save your spot now and pay when you arrive.',
    studioHow: (m: string) => `When you arrive, by ${m}.`,
    credits: 'Use my credits',
    creditsDesc: (b: string) => `You have ${b}.`,
    pack: 'Buy a class pack',
    packDesc: 'Buy credits and book with them.',
  },
};

/** Textos de cada forma de pago (título y explicación). */
export function payChoiceCopy(key: PayMethod, lang: string, extra: { balance?: string } = {}): Pick<PayChoice, 'title' | 'desc'> {
  const L = COPY[lang === 'en' ? 'en' : 'es'];
  if (key === 'card') return { title: L.card, desc: L.cardDesc };
  if (key === 'credits') return { title: L.credits, desc: extra.balance ? L.creditsDesc(extra.balance) : undefined };
  if (key === 'pack') return { title: L.pack, desc: L.packDesc };
  const methods = studioMethodsText(lang);
  const note = studioPayNote(lang);
  return { title: L.studio, desc: [methods ? L.studioHow(methods) : L.studioDesc, note].filter(Boolean).join(' ') };
}

export default function PayMethodChooser({ choices, value, onChange, lang }: {
  choices: PayChoice[];
  value: PayMethod;
  onChange: (m: PayMethod) => void;
  lang: string;
}) {
  const name = useId();
  const L = COPY[lang === 'en' ? 'en' : 'es'];
  return (
    <fieldset className="w-pay" data-testid="pay-methods">
      <legend className="w-pay-legend">{L.legend}</legend>
      {choices.map((c) => {
        const id = `${name}-${c.key}`;
        const on = c.key === value;
        return (
          <label key={c.key} htmlFor={id} className={`w-pay-opt${on ? ' is-on' : ''}`} data-method={c.key}>
            <input id={id} type="radio" name={name} value={c.key} checked={on} onChange={() => onChange(c.key)} />
            <span className="w-pay-ic" aria-hidden><Icon name={ICONS[c.key]} size={18} /></span>
            <span className="w-pay-txt">
              <b>{c.title}</b>
              {c.desc && <small>{c.desc}</small>}
            </span>
            <span className="w-pay-end">
              {c.amount && <span className="w-pay-amt">{c.amount}</span>}
              <span className="w-pay-dot" aria-hidden />
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
