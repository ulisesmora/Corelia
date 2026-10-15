"use client";
// «Mis listas de espera» en Mi cuenta: las clases completas en las que está
// apuntada, su puesto y un botón para borrarse. Si ya le han ofrecido plaza,
// «Aceptar plaza» lleva a /lista-espera?token=… No se pinta si no hay ninguna.
// Datos: GET /api/v1/waitlist/ y POST /api/v1/waitlist/<id>/leave/.
import { useCallback, useEffect, useState } from 'react';
import { useLangStore } from './stores/lang.store';
import { leaveWaitlist, myWaitlist, type WaitlistEntry } from '../lib/booking';

const TX = {
  es: {
    title: 'Mis listas de espera',
    hint: 'Si se libera una plaza te avisamos por email y en el móvil.',
    pos: (n: number | null) => (n ? `Eres la nº ${n} de la lista` : 'En la lista'),
    offered: (h: string) => `¡Tienes plaza! Acéptala antes de las ${h}`,
    claim: 'Aceptar plaza',
    leave: 'Salir de la lista',
    leaving: 'Saliendo…',
    left: 'Ya no estás en esa lista.',
    error: 'No se ha podido. Inténtalo otra vez.',
  },
  en: {
    title: 'My waitlists',
    hint: "If a spot opens up we'll let you know by email and on your phone.",
    pos: (n: number | null) => (n ? `You're #${n} on the list` : 'On the list'),
    offered: (h: string) => `A spot is yours! Accept it before ${h}`,
    claim: 'Accept spot',
    leave: 'Leave the list',
    leaving: 'Leaving…',
    left: "You're no longer on that list.",
    error: "That didn't work. Please try again.",
  },
};

function when(iso: string, lang: 'es' | 'en') {
  // Hora del estudio sin zona («AAAA-MM-DDTHH:MM»): se muestra tal cual
  const [d, t] = iso.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, day || 1);
  const label = date.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return `${label} · ${(t || '').slice(0, 5)}`;
}

export default function MyWaitlists() {
  const lang = useLangStore((s) => s.lang) === 'en' ? 'en' : 'es';
  const tx = TX[lang];
  const [items, setItems] = useState<WaitlistEntry[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const list = await myWaitlist();
    if (list) setItems(list);
  }, []);
  useEffect(() => { load(); }, [load]);

  const leave = async (e: WaitlistEntry) => {
    setBusy(e.id);
    setMsg('');
    const ok = await leaveWaitlist(e.id);
    setBusy(null);
    if (ok) {
      setItems((list) => list.filter((x) => x.id !== e.id));
      setMsg(tx.left);
    } else {
      setMsg(tx.error);
    }
  };

  if (!items.length && !msg) return null;

  return (
    <section className="w-card w-wl" aria-labelledby="wl-title">
      <h2 id="wl-title" className="w-wl-title">{tx.title}</h2>
      <p className="w-wl-hint">{tx.hint}</p>
      {items.length > 0 && (
        <ul className="w-wl-list">
          {items.map((e) => {
            const offered = e.status === 'offered' && !!e.claim_token;
            return (
              <li key={e.id} className={`w-wl-row${offered ? ' is-offered' : ''}`}>
                <div className="w-wl-info">
                  <b>{e.class_title}</b>
                  <span>{when(e.start_datetime, lang)}</span>
                  <span className={`w-chip ${offered ? 'w-chip--ok' : ''}`}>
                    {offered ? tx.offered((e.offer_expires_at || '').slice(11, 16)) : tx.pos(e.position)}
                  </span>
                </div>
                <div className="w-wl-act">
                  {offered && (
                    <a className="w-btn w-btn--sm sk-btn" href={`${lang === 'en' ? '/en/waitlist' : '/lista-espera'}?token=${e.claim_token}`}>
                      {tx.claim}
                    </a>
                  )}
                  <button type="button" className="w-btn w-btn--sm sk-btn-ghost" disabled={busy === e.id}
                    aria-busy={busy === e.id} onClick={() => leave(e)} aria-label={`${tx.leave}: ${e.class_title}, ${when(e.start_datetime, lang)}`}>
                    {busy === e.id ? tx.leaving : tx.leave}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {msg && <p className="w-wl-msg" role="status">{msg}</p>}
    </section>
  );
}
