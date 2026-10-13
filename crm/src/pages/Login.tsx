// pages/Login.tsx
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

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [touched, setTouched] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const email = username.trim();
  const emailError = touched && email && !validEmail(email)
    ? 'El email no parece correcto: revisa la @ y el punto (ej.: nombre@gmail.com).'
    : '';

  const checkCaps = (e: KeyboardEvent) => setCapsLock(e.getModifierState?.('CapsLock') ?? false);

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
    setLoading(true);

    try {
      const response = await fetch(API_BASE_URL + 'signin/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (response.status === 401) {
        throw new Error(
          'El email o la contraseña no son correctos. Revisa que estén bien escritos (las mayúsculas cuentan). ' +
          'Solo pueden entrar las personas con acceso de administración.',
        );
      }
      if (!response.ok) throw new Error(await friendlyError(response));

      const data = await response.json();

      // La API devuelve el token en "access" (antes se leía access_token, que no existe)
      login(data, data.access);
      // Si venía de un enlace (p. ej. /credits?accion=anadir), vuelve a él
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith('/') && !from.startsWith('/login') ? from : '/', { replace: true });
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
    setSendingReset(true);
    try {
      const res = await fetch(API_BASE_URL + 'request-reset-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw res;
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
              Entrar en el panel
            </Typography>
            <Typography sx={{ color: 'var(--studio-text-strong)', fontSize: '1rem', mt: 0.5 }}>
              Escribe tu email y tu contraseña.
            </Typography>
          </Box>

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

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : undefined}
              sx={{ mt: 2.5, mb: 2, minHeight: 54, borderRadius: 2, fontSize: '1.1rem', textTransform: 'none' }}
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
        </Box>
      </Container>
    </Box>
  );
};

export default Login;
