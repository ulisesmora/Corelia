import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Tab } from '@mui/material';
import { PageIntro, SectionTabs, useNotify } from '../components/guide';
import ContentSection from '../components/setup/ContentSection';
import DomainSection from '../components/setup/DomainSection';
import PushSection from '../components/setup/PushSection';
import EmailSection from '../components/setup/EmailSection';
import FaqEditor from '../components/setup/FaqEditor';
import GoogleSection from '../components/setup/GoogleSection';
import HeroSection from '../components/setup/HeroSection';
import MarketingSection, { MARKETING_FIELDS } from '../components/setup/MarketingSection';
import TestimonialEditor from '../components/setup/TestimonialEditor';
import PaymentsSection from '../components/setup/PaymentsSection';
import StudioSection from '../components/setup/StudioSection';
import StyleSection from '../components/setup/StyleSection';
import { loadSettings, saveSettings, type StudioSettings as Settings } from '../components/setup/api';
import { useSite } from '../site/SiteProvider';

// Pestañas: 0 Mi estudio · 1 Aspecto · 2 Portada · 3 Textos · 4 Preguntas · 5 Opiniones · 6 Google y anuncios · 7 Emails · 8 Avisos al móvil · 9 Pagos · 10 Acceso con Google · 11 Dominio
const STUDIO_FIELDS = [
  'studio_name', 'logo_url', 'icon_url', 'phone', 'whatsapp', 'contact_email', 'instagram',
  'address', 'city', 'postal_code', 'area_served', 'maps_url', 'country', 'currency', 'legal_name', 'tax_id',
] as const;
const STYLE_FIELDS = ['style_preset', 'icon_style', 'color_primary', 'color_secondary', 'color_dark', 'color_background', 'font_heading', 'font_body'] as const;
const HERO_FIELDS = ['hero_mode', 'hero_image_url', 'hero_video_url', 'hero_illustration'] as const;
const CONTENT_FIELDS = [
  'hero_title', 'hero_title_en', 'hero_subtitle', 'hero_subtitle_en', 'about_title', 'about_title_en',
  'about_text', 'about_text_en', 'about_image_url', 'description', 'description_en', 'tagline', 'tagline_en',
] as const;
const FORM_TABS: Record<number, readonly string[]> = { 0: STUDIO_FIELDS, 1: STYLE_FIELDS, 2: HERO_FIELDS, 3: CONTENT_FIELDS, 6: MARKETING_FIELDS };

/** Ajustes del estudio: lo mismo que el asistente de bienvenida, en pestañas. */
export default function StudioSettings() {
  const notify = useNotify();
  const site = useSite();
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => { setSettings(s); setSaved(s); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <Alert severity="error">No se han podido cargar los ajustes. {error}</Alert>;
  if (!settings || !saved) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><CircularProgress /></Box>;

  const fields = (FORM_TABS[tab] || []) as readonly (keyof Settings)[];
  const isForm = tab in FORM_TABS;
  const dirty = isForm && fields.some((k) => settings[k] !== saved[k]);

  const save = async () => {
    setSaving(true);
    try {
      const patch = Object.fromEntries(fields.map((k) => [k, settings[k]]));
      const s = await saveSettings(patch);
      setSettings(s);
      setSaved(s);
      await site.refresh?.();
      notify('Guardado ✓ Tu web ya muestra los cambios.');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onSaved = (s: Settings) => { setSettings(s); setSaved(s); site.refresh?.(); };

  return (
    <Box>
      <PageIntro
        pageKey="studio-settings"
        title="Ajustes del estudio"
        subtitle="El nombre, el aspecto, la portada y los textos de tu web, tu ficha de Google y tus anuncios, los emails, los pagos online y el acceso con Google."
      />
      <SectionTabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Mi estudio" />
        <Tab label="Aspecto" />
        <Tab label="Portada" />
        <Tab label="Textos de la web" />
        <Tab label="Preguntas frecuentes" />
        <Tab label="Opiniones" />
        <Tab label="Google y anuncios" />
        <Tab label="Emails" />
        <Tab label="Avisos al móvil" />
        <Tab label="Pagos online" />
        <Tab label="Acceso con Google" />
        <Tab label="Tu dominio" />
      </SectionTabs>
      <Paper elevation={0} sx={{ p: { xs: 2, sm: 4 }, mt: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
        {tab === 0 && <StudioSection value={settings} onChange={(p) => setSettings({ ...settings, ...p })} onBusyChange={setUploading} showLegal />}
        {tab === 1 && <StyleSection value={settings} onChange={(p) => setSettings({ ...settings, ...p })} />}
        {tab === 2 && <HeroSection value={settings} onChange={(p) => setSettings({ ...settings, ...p })} onBusyChange={setUploading} />}
        {tab === 3 && <ContentSection value={settings} onChange={(p) => setSettings({ ...settings, ...p })} onBusyChange={setUploading} />}
        {tab === 4 && <FaqEditor />}
        {tab === 5 && <TestimonialEditor />}
        {tab === 6 && <MarketingSection value={settings} onChange={(p) => setSettings({ ...settings, ...p })} />}
        {tab === 7 && <EmailSection value={settings} onSaved={onSaved} />}
        {tab === 8 && <PushSection value={settings} />}
        {tab === 9 && <PaymentsSection value={settings} onSaved={onSaved} />}
        {tab === 10 && <GoogleSection value={settings} onSaved={onSaved} />}
        {tab === 11 && <DomainSection value={settings} onSaved={onSaved} />}
        {isForm && (
          <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
            <Button variant="contained" size="large" onClick={save} disabled={!dirty || saving || uploading}
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>
              Guardar cambios
            </Button>
            {dirty && <Button size="large" onClick={() => setSettings(saved)}>Deshacer</Button>}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
