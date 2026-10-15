import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, CircularProgress, Container, Link, MobileStepper, Paper, Stack, Step, StepLabel,
  Stepper, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useNotify } from '../components/guide';
import EmailSection from '../components/setup/EmailSection';
import PaymentsSection from '../components/setup/PaymentsSection';
import StudioSection from '../components/setup/StudioSection';
import StyleSection from '../components/setup/StyleSection';
import { loadSettings, saveSettings, type StudioSettings } from '../components/setup/api';
import { useSite } from '../site/SiteProvider';
import StudioIcon from '../site/StudioIcon';
import { GUIDE_PATH, useSetupProgress } from '../onboarding';

const STEPS = [
  { label: 'Tu estudio', title: 'Empecemos por tu estudio', subtitle: 'El nombre y cómo te pueden contactar.' },
  { label: 'Tu estilo', title: 'Elige el aspecto de tu web', subtitle: 'Estilo, iconos, colores y letra. Lo verás aplicado al momento.' },
  { label: 'Emails', title: 'Emails a tus clientas', subtitle: 'Opcional: puedes hacerlo ahora o más tarde desde Ajustes.' },
  { label: 'Pagos', title: 'Cobrar online', subtitle: 'Opcional: puedes empezar sin pagos online.' },
  { label: '¡Listo!', title: '¡Lo básico ya está!', subtitle: '' },
];

/**
 * Asistente de bienvenida: se abre solo la primera vez que el estudio entra
 * al panel (hasta completarlo). Cada paso se guarda al pulsar «Siguiente»,
 * así que se puede cerrar y seguir otro día. Al terminar sigue la guía de
 * puesta en marcha (salas, profesores, clases, horario, precios… y publicar
 * la web); el asistente ya NO publica la web (setup_completed).
 */
export default function Setup() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('sm'));
  const navigate = useNavigate();
  const notify = useNotify();
  const site = useSite();
  const guide = useSetupProgress();
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadSettings().then(setSettings).catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

  if (loadError) {
    return <Container sx={{ py: 6 }}><Alert severity="error">No se han podido cargar los ajustes. {loadError}</Alert></Container>;
  }
  if (!settings) {
    return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}><CircularProgress /></Box>;
  }

  const update = (patch: Partial<StudioSettings>) => setSettings((s) => (s ? { ...s, ...patch } : s));

  const persist = async (patch: Partial<StudioSettings>) => {
    setSaving(true);
    try {
      const saved = await saveSettings(patch);
      setSettings(saved);
      await site.refresh?.();
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (step === 0) {
      if (!settings.studio_name.trim()) {
        notify('Escribe el nombre de tu estudio.', 'error');
        return;
      }
      const { studio_name, tagline, logo_url, icon_url, phone, whatsapp, contact_email, instagram, address, city, postal_code, area_served, maps_url, country, currency } = settings;
      if (!(await persist({ studio_name: studio_name.trim(), tagline, logo_url, icon_url, phone, whatsapp, contact_email, instagram, address, city, postal_code, area_served, maps_url, country, currency }))) return;
    }
    if (step === 1) {
      const { style_preset, icon_style, color_primary, color_secondary, color_dark, color_background, font_heading, font_body } = settings;
      if (!(await persist({ style_preset, icon_style, color_primary, color_secondary, color_dark, color_background, font_heading, font_body }))) return;
      // «Tu estilo» queda hecho en la guía aunque se dejen los colores por defecto
      await guide.setStatus('style', 'done').catch(() => {});
    }
    if (step === STEPS.length - 2) {
      // Asistente terminado: la guía sigue desde aquí (y crea «Sala principal»)
      await guide.setStatus('welcome', 'done').catch(() => {});
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const back = () => setStep((s) => Math.max(0, s - 1));
  const current = STEPS[step];
  const optional = step === 2 || step === 3;
  const last = step === STEPS.length - 1;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: { xs: 12, sm: 6 } }}>
      <Container maxWidth="md" sx={{ pt: { xs: 2, sm: 5 } }}>
        {!narrow && (
          <Stepper activeStep={step} alternativeLabel sx={{ mb: 4 }}>
            {STEPS.map((s) => <Step key={s.label}><StepLabel>{s.label}</StepLabel></Step>)}
          </Stepper>
        )}
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 5 }, borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
          {narrow && (
            <Typography variant="overline" color="text.secondary">Paso {step + 1} de {STEPS.length}</Typography>
          )}
          <Typography variant="h4" component="h1" sx={{ mb: 1 }}>{current.title}</Typography>
          {current.subtitle && <Typography color="text.secondary" sx={{ mb: 4 }}>{current.subtitle}</Typography>}

          {step === 0 && <StudioSection value={settings} onChange={update} onBusyChange={setUploading} />}
          {step === 1 && <StyleSection value={settings} onChange={update} />}
          {step === 2 && <EmailSection value={settings} onSaved={setSettings} />}
          {step === 3 && <PaymentsSection value={settings} onSaved={setSettings} />}
          {last && <Done settings={settings} />}

          {!narrow && (
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 5 }}>
              <Button onClick={back} disabled={step === 0 || saving} size="large">Atrás</Button>
              {last ? (
                <Stack direction="row" spacing={1.5}>
                  <Button size="large" onClick={() => navigate('/')}>Ir a mi panel</Button>
                  <Button variant="contained" size="large" onClick={() => navigate(GUIDE_PATH)}>Seguir paso a paso</Button>
                </Stack>
              ) : (
                <Button variant="contained" size="large" onClick={next} disabled={saving || uploading}
                  startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}>
                  {optional ? (step === 2 && settings.email_ready) || (step === 3 && settings.has_stripe) ? 'Siguiente' : 'Lo haré más tarde' : 'Siguiente'}
                </Button>
              )}
            </Stack>
          )}
        </Paper>
      </Container>

      {narrow && (
        <MobileStepper
          variant="dots" steps={STEPS.length} position="bottom" activeStep={step}
          sx={{ pb: 'calc(8px + env(safe-area-inset-bottom))', borderTop: '1px solid', borderColor: 'divider' }}
          backButton={<Button onClick={back} disabled={step === 0 || saving}>Atrás</Button>}
          nextButton={last
            ? <Button variant="contained" onClick={() => navigate(GUIDE_PATH)}>Seguir</Button>
            : <Button variant="contained" onClick={next} disabled={saving || uploading}>
                {optional && !((step === 2 && settings.email_ready) || (step === 3 && settings.has_stripe)) ? 'Más tarde' : 'Siguiente'}
              </Button>}
        />
      )}
    </Box>
  );
}

function Done({ settings }: { settings: StudioSettings }) {
  const items = [
    { done: true, text: 'Tu estudio y tu estilo están guardados.' },
    { done: settings.email_ready, text: settings.email_ready ? 'Los emails están activados.' : 'Emails: sin activar (lo verás en la guía, cuando quieras).' },
    { done: settings.has_stripe, text: settings.has_stripe ? 'Pagos online con Stripe activados.' : 'Pagos: de momento vendes los bonos en el estudio (puedes activar Stripe más tarde).' },
  ];
  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} alignItems="center">
        <StudioIcon name="celebrate" color="primary" sx={{ fontSize: 48 }} />
        <Typography>Ahora vamos paso a paso con lo que tus clientas van a reservar.</Typography>
      </Stack>
      <Box component="ul" sx={{ pl: 3, m: 0, '& li': { mb: 1 } }}>
        {items.map((i) => <li key={i.text}>{i.done ? '✅ ' : '◻️ '}{i.text}</li>)}
      </Box>
      <Alert severity="info">
        <b>Siguientes pasos, en este orden:</b> tus <b>salas</b> (ya hemos creado «Sala principal»), quién da las clases,
        tus <b>tipos de clase</b> (con plantillas listas), el <b>horario semanal</b> y tus <b>bonos y precios</b>. Cuando los
        tengas, haces una reserva de prueba y <b>publicas tu web</b> para que salga en Google.
      </Alert>
      {settings.web_url && (
        <Typography variant="body2" color="text.secondary">
          Tu web (aún sin publicar en Google): <Link href={settings.web_url} target="_blank" rel="noopener">{settings.web_url}</Link>
        </Typography>
      )}
    </Stack>
  );
}
