// pages/Login.tsx
// Entrada al panel en dos pasos cuando la persona tiene activada la
// verificación en dos pasos: 1) email y contraseña, 2) código de 6 cifras de
// su app (o un código de recuperación). Si el API lo pide tras varios
// intentos fallidos, aparece además la casilla de seguridad (Turnstile).
import { useState, KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  TextField,
  Typography,
  CssBaseline,
  Container,
  CircularProgress,
  InputAdornment,
  Link,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { friendlyError } from '../utils/errors';
import { API_BASE_URL } from '../config';
import StudioLogo from '../site/StudioLogo';
import { useSite } from '../site/SiteProvider';
import Turnstile from '../components/Turnstile';

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

type ApiData = {
  error?: string;
  detail?: string;
  code?: string;
  captcha_required?: boolean;
  two_factor_required?: boolean;
  two_factor_token?: string;
  two_factor_setup_required?: boolean;
  recovery_codes_left?: number;
  access?: string;
  name?: string;
  email?: string;
};

async function postJson(path: string, body: unknown): Promise<{ status: number; ok: boolean; data: ApiData }> {
  const res = await fetch(API_BASE_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: ApiData = {};
  try { data = await res.json(); } catch { /* sin JSON */ }
  return { status: res.status, ok: res.ok, data };
}

const apiMessage = (d: ApiData) => (typeof d.error === 'string' && d.error) || (typeof d.detail === 'string' && d.detail) || '';

const Login = () => {
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [touched, setTouched] = useState(false);
  // Segundo paso
  const [pendingToken, setPendingToken] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  // Casilla de seguridad (solo si el API la pide)
  const [captchaNeeded, setCaptchaNeeded] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { config } = useSite();
  const siteKey = config.turnstile_site_key;

  const email = username.trim();
  const emailError = touched && email && !validEmail(email)
    ? 'El email no parece correcto: revisa la @ y el punto (ej.: nombre@gmail.com).'
    : '';

  const checkCaps = (e: KeyboardEvent) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

  // Cada respuesta de la casilla sirve una sola vez: tras enviarla, otra nueva
  const captchaBody = () => {
    if (!captchaNeeded || !captchaToken) return {};
    const body = { turnstile_token: captchaToken };
    setCaptchaToken('');
    setCaptchaReset((n) => n + 1);
    return body;
  };

  const askCaptcha = (d: ApiData) => {
    if (d.captcha_required) setCaptchaNeeded(true);
  };

  const enter = (data: ApiData) => {
    login({ ...data, name: data.name || '', email: data.email || email }, String(data.access || ''));
    if (data.two_factor_setup_required) {
      navigate('/seguridad', { replace: true });
      return;
    }
    // Si venía de un enlace (p. ej. /credits?accion=anadir), vuelve a él
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from.startsWith('/') && !from.startsWith('/login') ? from : '/', { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError('');
    setInfo('');
    if (!email || !password) {
      setError('Escribe tu email y tu contraseña.');
      return;
    }
    if (!validEmail(email)) return;
    if (captchaNeeded && siteKey && !captchaToken) {
      setError('Marca primero la casilla de seguridad («Verifica que eres una persona»).');
      return;
    }
    setLoading(true);

    try {
      const { status, ok, data } = await postJson('signin/', { email, password, ...captchaBody() });
      if (ok && data.two_factor_required) {
        setPendingToken(String(data.two_factor_token || ''));
        setCode('');
        setUseRecovery(false);
        setStep('code');
        return;
      }
      if (ok) { enter(data); return; }
      askCaptcha(data);
      if (status === 401) {
        setError(
          'El email o la contraseña no son correctos. Revisa que estén bien escritos (las mayúsculas cuentan). ' +
          'Solo pueden entrar las personas con acceso de administración.',
        );
        return;
      }
      // 429 (bloqueo o demasiados intentos) y 400 (casilla de seguridad) traen su propio mensaje
      setError(apiMessage(data) || 'No se ha podido entrar. Vuelve a intentarlo.');
    } catch (err) {
      setError(await friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const value = code.trim();
    if (!value) {
      setError(useRecovery ? 'Escribe uno de tus códigos de recuperación.' : 'Escribe el código de 6 cifras de tu app.');
      return;
    }
    setLoading(true);
    try {
      const body = useRecovery ? { token: pendingToken, recovery_code: value } : { token: pendingToken, code: value };
      const { ok, data } = await postJson('v1/auth/2fa/verify/', body);
      if (ok) {
        if (typeof data.recovery_codes_left === 'number' && data.recovery_codes_left <= 3) {
          try { sessionStorage.setItem('recoveryCodesLow', String(data.recovery_codes_left)); } catch { /* sin storage */ }
        }
        enter(data);
        return;
      }
      if (data.code === 'two_factor_expired') {
        setStep('password');
        setPassword('');
      }
      setCode('');
      setError(apiMessage(data) || 'El código no es correcto. Vuelve a intentarlo.');
    } catch (err) {
      setError(await friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  // Envía el enlace para crear una contraseña nueva (sirve también para administradores)
  const handleForgot = async () => {
    setTouched(true);
    setError('');
    setInfo('');
    if (!email || !validEmail(email)) {
      setError('Escribe primero tu email arriba y vuelve a pulsar «¿Has olvidado tu contraseña?».');
      return;
    }
    if (captchaNeeded && siteKey && !captchaToken) {
      setError('Marca primero la casilla de seguridad y vuelve a pulsar «¿Has olvidado tu contraseña?».');
      return;
    }
    setSendingReset(true);
    try {
      const { ok, data } = await postJson('request-reset-password/', { email, ...captchaBody() });
      if (!ok) {
        askCaptcha(data);
        setError(data.captcha_required && !captchaToken
          ? 'Por seguridad, marca la casilla de abajo y vuelve a pulsar «¿Has olvidado tu contraseña?».'
          : apiMessage(data) || 'No se ha podido enviar el correo. Vuelve a intentarlo.');
        return;
      }
      setInfo(
        `Si ${email} tiene acceso, en unos minutos te llegará un correo con un enlace. Ábrelo, elige una contraseña nueva ` +
        'y vuelve aquí para entrar con ella. Mira también en la carpeta de correo no deseado.',
      );
    } catch (err) {
      setError(await friendlyError(err));
    } finally {
      setSendingReset(false);
    }
  };

  const messages = (
    <>
      {error && (
        <Alert severity="error" role="alert" sx={{ mt: 1, fontSize: '0.95rem' }}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="success" role="status" sx={{ mt: 1, fontSize: '0.95rem' }}>
          {info}
        </Alert>
      )}
    </>
  );

  const submitSx = { mt: 2.5, mb: 2, minHeight: 54, borderRadius: 2, fontSize: '1.1rem', textTransform: 'none' } as const;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, var(--studio-bg) 0%, var(--studio-primary-pale) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        py: 4,
      }}
    >
      <CssBaseline />
      <Container maxWidth="xs">
        <Box
          sx={{
            backgroundColor: '#fff',
            borderRadius: 4,
            p: { xs: 3, sm: 4 },
            boxShadow: '0 20px 50px rgb(var(--studio-dark-rgb) / 0.15)',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <StudioLogo height={96} fontSize="2rem" sx={{ mx: 'auto', maxWidth: '70%' }} />
            <Typography component="h1" sx={{ fontFamily: 'var(--studio-font-heading)', fontSize: '1.7rem', fontWeight: 600, color: 'var(--studio-dark)', mt: 1.5 }}>
              {step === 'code' ? 'Último paso' : 'Entrar en el panel'}
            </Typography>
            <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '1rem', mt: 0.5 }}>
              {step === 'code'
                ? (useRecovery
                  ? 'Escribe uno de los códigos de recuperación que guardaste.'
                  : 'Abre tu app de verificación (Google Authenticator, 1Password…) y escribe el código de 6 cifras.')
                : 'Escribe tu email y tu contraseña.'}
            </Typography>
          </Box>

          {step === 'code' ? (
            <Box component="form" onSubmit={handleCode} noValidate>
              <TextField
                key={useRecovery ? 'recovery' : 'totp'}
                margin="normal"
                required
                fullWidth
                autoFocus
                label={useRecovery ? 'Código de recuperación' : 'Código de 6 cifras'}
                placeholder={useRecovery ? 'abcde-12345' : '123456'}
                value={code}
                onChange={(e) => setCode(useRecovery ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="one-time-code"
                helperText={useRecovery ? 'Cada código de recuperación sirve una sola vez.' : 'El código cambia cada 30 segundos.'}
                slotProps={{
                  htmlInput: useRecovery
                    ? { autoCapitalize: 'none', spellCheck: false, maxLength: 20 }
                    : { inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6, style: { fontSize: '1.6rem', letterSpacing: '0.4em', textAlign: 'center' } },
                }}
              />
              {messages}
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : undefined}
                sx={submitSx}
              >
                {loading ? 'Comprobando…' : 'Entrar'}
              </Button>
              <Box sx={{ textAlign: 'center', display: 'grid', gap: 0.5 }}>
                <Link
                  component="button"
                  type="button"
                  onClick={() => { setUseRecovery((v) => !v); setCode(''); setError(''); }}
                  sx={{ fontSize: '0.98rem', minHeight: 44, px: 1 }}
                >
                  {useRecovery ? 'Usar el código de la app' : '¿No tienes el móvil? Usa un código de recuperación'}
                </Link>
                <Link
                  component="button"
                  type="button"
                  onClick={() => { setStep('password'); setPassword(''); setCode(''); setError(''); }}
                  sx={{ fontSize: '0.95rem', minHeight: 44, px: 1, color: 'text.secondary' }}
                >
                  Volver
                </Link>
              </Box>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <TextField
                margin="normal"
                required
                fullWidth
                label="Tu email"
                type="email"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => setTouched(true)}
                error={Boolean(emailError)}
                helperText={emailError || 'Ej.: nombre@gmail.com'}
                slotProps={{ htmlInput: { inputMode: 'email', autoCapitalize: 'none', spellCheck: false } }}
              />
              <TextField
                margin="normal"
                required
                fullWidth
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={checkCaps}
                onKeyDown={checkCaps}
                helperText={capsLock ? 'Ojo: tienes las MAYÚSCULAS activadas (tecla Bloq Mayús).' : ' '}
                slotProps={{
                  formHelperText: { sx: capsLock ? { color: '#8A5A00', fontWeight: 600 } : undefined },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Button
                          size="small"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-pressed={showPassword}
                          sx={{ minHeight: 40, textTransform: 'none' }}
                        >
                          {showPassword ? 'Ocultar' : 'Mostrar'}
                        </Button>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              {captchaNeeded && siteKey && (
                <Turnstile siteKey={siteKey} onToken={setCaptchaToken} resetKey={captchaReset} />
              )}

              {messages}

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : undefined}
                sx={submitSx}
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </Button>

              <Box sx={{ textAlign: 'center' }}>
                <Link
                  component="button"
                  type="button"
                  onClick={handleForgot}
                  disabled={sendingReset}
                  sx={{ fontSize: '0.98rem', minHeight: 44, px: 1 }}
                >
                  {sendingReset ? 'Enviando el correo…' : '¿Has olvidado tu contraseña?'}
                </Link>
              </Box>
            </Box>
          )}
        </Box>
      </Container>
    </Box>
  );
};

export default Login;
