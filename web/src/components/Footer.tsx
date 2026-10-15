'use client';
// Pie de la web (todas las páginas): marca y redes · Explora (los 5 enlaces
// principales) · Visítanos (dirección y contacto) · Más (FAQ, promociones,
// cuenta, legales). Zona profunda del estilo (.sk-deep) y estilos .w-ft en
// styles/site.css. Lo que el estudio no ha rellenado no se pinta.
import { useMemo } from 'react';
import { Icon, type IconName } from './ui/Icon';
import { useT } from '../i18n';
import { useLangStore, withSsrLang } from './stores/lang.store';
import {
  addressLine, instagramHandle, instagramUrl, mapsUrl, phoneHref, socialProfiles, useSite, whatsappUrl,
} from '../lib/site';

function FooterInner() {
  const t = useT();
  const site = useSite();
  const lang = useLangStore((st) => st.lang);
  const en = lang === 'en';
  const year = useMemo(() => new Date().getFullYear(), []);

  const wa = whatsappUrl(site);
  const tel = phoneHref(site);
  const ig = instagramUrl(site);
  const address = addressLine(site);
  const social = [
    ...socialProfiles(site).map((p) => ({ icon: p.network as IconName, href: p.url, label: p.label })),
    wa ? { icon: 'whatsapp' as IconName, href: wa, label: 'WhatsApp' } : null,
  ].filter(Boolean) as { icon: IconName; href: string; label: string }[];

  const explore = (['classes', 'calendar', 'prices', 'studio', 'contact'] as const)
    .map((k) => ({ label: t(`nav.items.${k}.label`), href: t(`nav.items.${k}.href`) }));
  const more = [
    { label: t('nav.items.faq.label'), href: t('nav.items.faq.href') },
    { label: t('nav.items.promos.label'), href: t('nav.items.promos.href') },
    { label: t('nav.cta.account'), href: '/dashboard' },
    { label: t('nav.items.terms.label'), href: t('nav.items.terms.href') },
  ];
  const contact = [
    address && { icon: 'map-pin' as IconName, text: address, href: mapsUrl(site) },
    (wa || tel) && site.contact.phone && { icon: (wa ? 'whatsapp' : 'phone') as IconName, text: site.contact.phone, href: wa || tel },
    site.contact.email && { icon: 'mail' as IconName, text: site.contact.email, href: `mailto:${site.contact.email}` },
    ig && !social.some((s) => s.icon === 'instagram') && { icon: 'instagram' as IconName, text: `@${instagramHandle(site)}`, href: ig },
  ].filter(Boolean) as { icon: IconName; text: string; href: string }[];
  const tagline = (en ? site.tagline_en || site.tagline : site.tagline) || site.contact.city;

  return (
    <footer className="sk-deep">
      <div className="w-wrap w-ft">
        <div className="w-ft-top">
          <div className="w-ft-brand">
            <p className="w-ft-name">{site.studio_name}</p>
            {tagline && <p>{tagline}</p>}
            {social.length > 0 && (
              <div className="w-ft-social">
                {social.map((s) => (
                  <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
                    <Icon name={s.icon} aria-hidden />
                  </a>
                ))}
              </div>
            )}
          </div>

          <nav aria-label={en ? 'Explore' : 'Explora'}>
            <h3>{en ? 'Explore' : 'Explora'}</h3>
            <ul>{explore.map((l) => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}</ul>
          </nav>

          {contact.length > 0 && (
            <div>
              <h3>{en ? 'Visit us' : 'Visítanos'}</h3>
              <ul>
                {contact.map((c) => (
                  <li key={c.text}>
                    <a href={c.href} target={c.href.startsWith('http') ? '_blank' : undefined} rel={c.href.startsWith('http') ? 'noopener noreferrer' : undefined}>
                      <Icon name={c.icon} aria-hidden size={14} />{c.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <nav aria-label={en ? 'More' : 'Más'}>
            <h3>{en ? 'More' : 'Más'}</h3>
            <ul>
              {more.map((l) => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}
              {/* «Cookies»: abre las preferencias si el estudio usa analítica (lib/cookie-consent.ts) */}
              <li><a href={t('nav.items.cookies.href')} data-cookie-settings="">{t('nav.items.cookies.label')}</a></li>
            </ul>
          </nav>
        </div>

        <div className="w-ft-bottom">
          <span>© {year} {site.legal.name || site.studio_name}. {en ? 'All rights reserved.' : 'Todos los derechos reservados.'}</span>
          <a href={t('nav.items.calendar.href')}>{t('nav.cta.book')} →</a>
        </div>
      </div>
    </footer>
  );
}

export default withSsrLang(FooterInner);
