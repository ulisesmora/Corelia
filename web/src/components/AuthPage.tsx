"use client";

/**
 * Acceso y registro de clientes (modal del Navbar y página /login).
 *
 * - Textos en ES/EN con un diccionario local (idioma de useLangStore).
 * - Los errores del backend llegan en español: se traducen por código HTTP y
 *   campo (ver mapLoginError / mapSignupError), nunca se muestran tal cual.
 * - Tras entrar se guarda la sesión en localStorage (accessToken, refreshToken,
 *   iduser, username, sessionTimestamp) y se recarga/redirige.
 * - Tras registrarse la cuenta ya está activa (verificación suave) y se pide el
 *   código de 6 dígitos (EmailVerifyCard), con "Lo haré luego".
 *
 * También exporta las piezas de formulario (TextField, PrimaryButton,
 * FormAlert, …) que reutilizan RecoverPassword y VerifiAccount.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import { Icon } from "./ui/Icon";
import Chakra from "./ChakraProvider";
import GoogleAuthButton, { useGoogleLoginEnabled } from "./GoogleSignIn";
import { Toaster } from "./ui/toaster";
import EmailVerifyCard, { suggestEmailFix } from "./EmailVerifyCard";
import { useLangStore } from "./stores/lang.store";
import { API_ROOT } from '../config';
import BrandLogo from './BrandLogo';
import { useSite } from '../lib/site';
import { track } from '../lib/tracking';
import Turnstile from './Turnstile';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes compartidas
// ─────────────────────────────────────────────────────────────────────────────

/** Base de la API terminada en "/api/". */
export const AUTH_API = `${API_ROOT}/`;

/** Mínimo que exige el backend (SignUpClientView / ResetPasswordView). */
export const MIN_PASSWORD = 6;

/** Paleta del acceso: solo tokens del estilo visual (presets.css), así se lee
 *  igual en estilos claros y oscuros (energy, neon). */
export const AUTH_C = {
  brand: "var(--accent)",             // solo decorativo (iconos)
  brandDark: "var(--accent-text)",    // texto/enlaces de acento (contraste garantizado)
  brown: "var(--page-text)",          // texto principal
  heading: "var(--heading-color)",    // títulos
  muted: "var(--text-muted)",         // texto secundario
  subtle: "var(--text-subtle)",       // placeholder
  cream: "var(--page-bg)",            // fondo de página
  sand: "var(--accent-soft)",         // relleno suave de acento
  line: "var(--border-neutral)",      // separadores y bordes
  inputBorder: "var(--input-border)",
  err: "var(--danger)",
  errBg: "var(--danger-soft)",
  ok: "var(--success)",
  okBg: "var(--success-soft)",
  font: 'var(--font-body)',
};
const C = AUTH_C;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

// ─────────────────────────────────────────────────────────────────────────────
// Textos
// ─────────────────────────────────────────────────────────────────────────────

const COPY = {
  es: {
    tabsLabel: "Entrar o crear cuenta",
    tabLogin: "Entrar",
    tabRegister: "Crear cuenta",
    loginHeading: "Hola de nuevo",
    loginSub: "Entra para reservar y ver tus clases.",
    registerHeading: "Crea tu cuenta",
    registerSub: "En un minuto podrás reservar tus clases.",
    resetHeading: "Recupera tu contraseña",
    resetSub: "Escribe el email de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.",
    orEmail: "o con tu email",
    nameLabel: "Nombre y apellido",
    namePh: "Ej. Ana López",
    emailLabel: "Email",
    emailPh: "nombre@email.com",
    passwordLabel: "Contraseña",
    newPasswordLabel: "Contraseña",
    newPasswordPh: `Mínimo ${MIN_PASSWORD} caracteres`,
    confirmLabel: "Repite la contraseña",
    confirmPh: "Escríbela otra vez",
    forgot: "¿Has olvidado tu contraseña?",
    show: "Mostrar contraseña",
    hide: "Ocultar contraseña",
    capsLock: "Bloq Mayús está activado",
    reqLength: `Al menos ${MIN_PASSWORD} caracteres`,
    matchOk: "Las contraseñas coinciden",
    termsPrefix: "He leído y acepto los",
    termsLink: "términos y condiciones",
    termsNewTab: "(se abre en otra pestaña)",
    submitLogin: "Entrar",
    submittingLogin: "Entrando…",
    submitRegister: "Crear cuenta",
    submittingRegister: "Creando cuenta…",
    submitReset: "Enviar enlace",
    submittingReset: "Enviando…",
    backToLogin: "Volver a entrar",
    didYouMean: "¿Querías decir",
    tapToFix: "Toca para corregir.",
    noAccount: "¿Aún no tienes cuenta?",
    hasAccount: "¿Ya tienes cuenta?",
    // Éxito
    loginOkTitle: (name?: string) => (name ? `¡Hola, ${name}!` : "¡Hola de nuevo!"),
    loginOkText: "Has entrado correctamente. Un momento…",
    registerOkTitle: "¡Cuenta creada!",
    registerOkText: "Ya puedes reservar. Solo falta confirmar tu email para recibir tus avisos.",
    continue: "Continuar",
    resetSentTitle: "Revisa tu correo",
    resetSentText: (email: string) =>
      `Si hay una cuenta con ${email}, te hemos enviado un enlace para crear una contraseña nueva.`,
    resetSentHint: "¿No te llega en unos minutos? Mira en spam o promociones.",
    resetAgain: "Enviar a otro email",
    // Errores
    errNameRequired: "Escribe tu nombre.",
    errEmailRequired: "Escribe tu email.",
    errEmailInvalid: "Revisa el email: parece incompleto (ej. nombre@gmail.com).",
    errPasswordRequired: "Escribe tu contraseña.",
    errPasswordShort: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
    errConfirmRequired: "Repite la contraseña.",
    errMismatch: "Las contraseñas no coinciden.",
    errTerms: "Para crear la cuenta tienes que aceptar los términos.",
    errBadCredentials: "El email o la contraseña no son correctos.",
    errEmailExists: "Ya hay una cuenta con este email.",
    goLogin: "Entrar con este email",
    goReset: "Recuperar contraseña",
    errNetwork: "No hay conexión. Revisa tu internet e inténtalo de nuevo.",
    errServer: "Algo ha fallado por nuestra parte. Inténtalo en unos minutos.",
    errTooMany: "Demasiados intentos. Espera un momento y vuelve a probar.",
    errLocked: "Por seguridad hemos bloqueado el acceso con este email unos minutos (la contraseña se ha escrito mal varias veces). Espera un poco o crea una contraseña nueva con «¿Has olvidado tu contraseña?».",
    errCaptcha: "Marca la casilla de seguridad y vuelve a intentarlo.",
    errGeneric: "No hemos podido completarlo. Inténtalo de nuevo.",
    errFixFields: "Revisa los campos marcados.",
    // Panel de marca (página /login)
    brandClaim: "Transforma tu cuerpo. Transforma tu vida.",
    brandSub: "",
    logoAlt: "",
  },
  en: {
    tabsLabel: "Log in or create an account",
    tabLogin: "Log in",
    tabRegister: "Create account",
    loginHeading: "Welcome back",
    loginSub: "Log in to book and see your classes.",
    registerHeading: "Create your account",
    registerSub: "You'll be able to book your classes in a minute.",
    resetHeading: "Reset your password",
    resetSub: "Enter your account email and we'll send you a link to create a new password.",
    orEmail: "or with your email",
    nameLabel: "Full name",
    namePh: "e.g. Anna Smith",
    emailLabel: "Email",
    emailPh: "name@email.com",
    passwordLabel: "Password",
    newPasswordLabel: "Password",
    newPasswordPh: `At least ${MIN_PASSWORD} characters`,
    confirmLabel: "Repeat password",
    confirmPh: "Type it again",
    forgot: "Forgot your password?",
    show: "Show password",
    hide: "Hide password",
    capsLock: "Caps Lock is on",
    reqLength: `At least ${MIN_PASSWORD} characters`,
    matchOk: "Passwords match",
    termsPrefix: "I have read and accept the",
    termsLink: "terms and conditions",
    termsNewTab: "(opens in a new tab)",
    submitLogin: "Log in",
    submittingLogin: "Logging in…",
    submitRegister: "Create account",
    submittingRegister: "Creating account…",
    submitReset: "Send link",
    submittingReset: "Sending…",
    backToLogin: "Back to log in",
    didYouMean: "Did you mean",
    tapToFix: "Tap to fix.",
    noAccount: "Don't have an account yet?",
    hasAccount: "Already have an account?",
    loginOkTitle: (name?: string) => (name ? `Hi, ${name}!` : "Welcome back!"),
    loginOkText: "You're logged in. One moment…",
    registerOkTitle: "Account created!",
    registerOkText: "You can book now. Just confirm your email to receive your notifications.",
    continue: "Continue",
    resetSentTitle: "Check your inbox",
    resetSentText: (email: string) =>
      `If there's an account for ${email}, we've sent you a link to create a new password.`,
    resetSentHint: "Nothing after a few minutes? Check spam or promotions.",
    resetAgain: "Use a different email",
    errNameRequired: "Enter your name.",
    errEmailRequired: "Enter your email.",
    errEmailInvalid: "Check your email — it looks incomplete (e.g. name@gmail.com).",
    errPasswordRequired: "Enter your password.",
    errPasswordShort: `Your password must be at least ${MIN_PASSWORD} characters.`,
    errConfirmRequired: "Repeat your password.",
    errMismatch: "Passwords don't match.",
    errTerms: "Please accept the terms to create your account.",
    errBadCredentials: "The email or password is incorrect.",
    errEmailExists: "There's already an account with this email.",
    goLogin: "Log in with this email",
    goReset: "Reset password",
    errNetwork: "No connection. Check your internet and try again.",
    errServer: "Something went wrong on our side. Please try again in a few minutes.",
    errTooMany: "Too many attempts. Please wait a moment and try again.",
    errLocked: "For your security, sign-in with this email is blocked for a few minutes (the password was wrong several times). Please wait or create a new password with “Forgot your password?”.",
    errCaptcha: "Please complete the security check and try again.",
    errGeneric: "We couldn't complete that. Please try again.",
    errFixFields: "Please check the highlighted fields.",
    brandClaim: "Transform your body. Transform your life.",
    brandSub: "",
    logoAlt: "",
  },
};
export type AuthCopy = typeof COPY.es;

export function useAuthLang() {
  const lang = useLangStore((s) => s.lang);
  return lang === "en" ? "en" : "es";
}
export function useAuthCopy(): AuthCopy {
  return COPY[useAuthLang()];
}

// ─────────────────────────────────────────────────────────────────────────────
// Red y sesión
// ─────────────────────────────────────────────────────────────────────────────

export type ApiResult = { ok: boolean; status: number; data: any; network: boolean };

/** POST JSON tolerante: nunca lanza; status 0 + network=true si no hubo respuesta. */
export async function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<ApiResult> {
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 25000) : null;
  try {
    const r = await fetch(`${AUTH_API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body ?? {}),
      signal: ctrl?.signal,
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data, network: false };
  } catch {
    return { ok: false, status: 0, data: {}, network: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Errores comunes a cualquier llamada (red, 429, 5xx). null si no aplica. */
export function commonError(res: ApiResult, t: AuthCopy): string | null {
  if (res.network) return t.errNetwork;
  if (res.status === 429) return res.data?.code === "account_locked" ? t.errLocked : t.errTooMany;
  // Casilla de seguridad (Turnstile) que falta o no ha valido
  if (res.status === 400 && res.data?.captcha_required) return t.errCaptcha;
  if (res.status >= 500) return t.errServer;
  return null;
}

/** Guarda la sesión con las mismas claves que usa el resto de la web. */
export function saveSession(data: any) {
  try {
    if (data?.access) localStorage.setItem("accessToken", data.access);
    if (data?.refresh) localStorage.setItem("refreshToken", data.refresh);
    // BUG FIX previo: sin guard se guardaba la cadena "undefined" y luego se
    // pedía /users/undefined/. El login con Google devuelve user_id; este, userid.
    const uid = data?.userid ?? data?.user_id;
    if (uid != null) localStorage.setItem("iduser", String(uid));
    const name = data?.username || data?.name;
    if (name) localStorage.setItem("username", String(name));
    localStorage.setItem("sessionTimestamp", Date.now().toString());
  } catch {
    /* localStorage no disponible (modo privado estricto) */
  }
}

/** Primer mensaje de un campo de un error DRF ({campo: ["msg"]}). */
function firstMsg(obj: any, key: string): string | null {
  const v = obj?.[key];
  if (Array.isArray(v) && v.length) return String(v[0]);
  if (typeof v === "string") return v;
  return null;
}

/** Destino tras entrar desde /login: ?next=/ruta (solo rutas internas). */
function safeNext(): string {
  try {
    const n = new URLSearchParams(window.location.search).get("next") || "";
    if (n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\")) return n;
  } catch { /* noop */ }
  return "/";
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas de formulario (exportadas)
// ─────────────────────────────────────────────────────────────────────────────

const focusRing = { outline: "none", borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-soft)" };

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  type?: "text" | "email" | "password";
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  icon?: React.ReactNode;
  error?: string | null;
  /** Ids extra para aria-describedby (p. ej. lista de requisitos). */
  describedBy?: string;
  labelAside?: React.ReactNode;
  children?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
  maxLength?: number;
  autoCapitalize?: string;
  name?: string;
}

/** Campo con etiqueta visible, error asociado y (si es contraseña) mostrar/ocultar + aviso de Bloq Mayús. */
export function TextField({
  id, label, value, onChange, onBlur, type = "text", autoComplete, inputMode, placeholder, icon,
  error, describedBy, labelAside, children, inputRef, maxLength, autoCapitalize, name,
}: TextFieldProps) {
  const t = useAuthCopy();
  const isPassword = type === "password";
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const errId = `${id}-error`;
  const capsId = `${id}-caps`;

  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isPassword || typeof e.getModifierState !== "function") return;
    setCaps(e.getModifierState("CapsLock"));
  };

  const describedByIds = [describedBy, error ? errId : null, isPassword && caps ? capsId : null]
    .filter(Boolean).join(" ") || undefined;

  return (
    <Box w="full">
      <Flex justify="space-between" align="baseline" gap={2} mb={1.5}>
        <chakra.label htmlFor={id} fontWeight={700} fontSize="sm" color={C.brown} fontFamily={C.font}>
          {label}
        </chakra.label>
        {labelAside}
      </Flex>
      <Box position="relative">
        {icon && (
          <Flex aria-hidden position="absolute" left="16px" top="0" h="52px" align="center"
            color={error ? C.err : C.brand} pointerEvents="none" fontSize="15px">
            {icon}
          </Flex>
        )}
        <chakra.input
          ref={inputRef}
          id={id}
          name={name || id}
          type={isPassword ? (shown ? "text" : "password") : type}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          onBlur={() => { setCaps(false); onBlur?.(); }}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholder}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize ?? (type === "email" || isPassword ? "none" : undefined)}
          autoCorrect={type === "email" || isPassword ? "off" : undefined}
          spellCheck={type === "email" || isPassword ? false : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedByIds}
          w="full"
          h="52px"
          pl={icon ? "44px" : "16px"}
          pr={isPassword ? "56px" : "16px"}
          bg="var(--input-bg)"
          color={C.brown}
          fontFamily={C.font}
          fontWeight={600}
          fontSize="16px" /* 16px evita el zoom automático de iOS */
          borderRadius="var(--radius-input)"
          borderWidth="1.5px"
          borderStyle="solid"
          borderColor={error ? C.err : C.inputBorder}
          transition="border-color .15s, box-shadow .15s"
          _placeholder={{ color: C.subtle, fontWeight: 500 }}
          _hover={{ borderColor: error ? C.err : "var(--accent)" }}
          _focusVisible={error ? { ...focusRing, borderColor: C.err, boxShadow: "0 0 0 3px var(--danger-soft)" } : focusRing}
        />
        {isPassword && (
          <chakra.button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? t.hide : t.show}
            aria-pressed={shown}
            aria-controls={id}
            title={shown ? t.hide : t.show}
            position="absolute" right="4px" top="4px" w="44px" h="44px"
            display="flex" alignItems="center" justifyContent="center"
            borderRadius="var(--radius-button)" color={C.brandDark} bg="transparent" cursor="pointer" fontSize="18px"
            _hover={{ bg: C.sand }}
            _focusVisible={{ outline: `2px solid ${C.brandDark}`, outlineOffset: "1px" }}
          >
            {shown ? <Icon name="eye-off" aria-hidden /> : <Icon name="eye" aria-hidden />}
          </chakra.button>
        )}
      </Box>
      {isPassword && caps && (
        <Flex id={capsId} align="center" gap={1.5} mt={1.5} fontSize="13px" fontWeight={600} color="var(--warning)" fontFamily={C.font}>
          <Icon name="alert-circle" aria-hidden /> {t.capsLock}
        </Flex>
      )}
      {children}
      <Box aria-live="polite">
        {error && (
          <Flex id={errId} align="flex-start" gap={1.5} mt={1.5} fontSize="13px" fontWeight={600} color={C.err} fontFamily={C.font} lineHeight="1.4">
            <Box as="span" mt="2px" flexShrink={0}><Icon name="alert-circle" aria-hidden /></Box>
            <span>{error}</span>
          </Flex>
        )}
      </Box>
    </Box>
  );
}

/** Línea de requisito (✓ cumplido / ○ pendiente), no depende solo del color. */
export function Requirement({ id, met, children }: { id?: string; met: boolean; children: React.ReactNode }) {
  return (
    <Flex id={id} align="center" gap={1.5} mt={1.5} fontSize="13px" fontWeight={600} fontFamily={C.font}
      color={met ? C.ok : C.muted}>
      {met ? <Icon name="check-circle" aria-hidden /> : <Icon name="circle" aria-hidden />}
      <span>{children}</span>
    </Flex>
  );
}

export function PrimaryButton({
  children, loading, loadingText, type = "submit", onClick, disabled,
}: {
  children: React.ReactNode; loading?: boolean; loadingText?: string; type?: "submit" | "button";
  onClick?: () => void; disabled?: boolean;
}) {
  return (
    // Acabado (fondo, texto, borde, radio, sombra, peso) de la clase sk-btn
    <chakra.button
      className="sk-btn"
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      w="full" minH="52px" px={5}
      display="flex" alignItems="center" justifyContent="center" gap={2}
      fontFamily={C.font} fontSize="16px"
      cursor={loading ? "progress" : "pointer"}
      _active={{ transform: "scale(0.99)" }}
      _disabled={{ cursor: loading ? "progress" : "not-allowed" }}
      _focusVisible={{ outline: `3px solid ${C.brand}`, outlineOffset: "2px" }}
    >
      {loading && <ButtonSpinner />}
      <span>{loading && loadingText ? loadingText : children}</span>
    </chakra.button>
  );
}

function ButtonSpinner() {
  return (
    <Box as="span" aria-hidden w="18px" h="18px" borderRadius="full" border="2.5px solid color-mix(in srgb, currentColor 35%, transparent)"
      borderTopColor="currentColor" animation="spin 0.8s linear infinite" display="inline-block" />
  );
}

export function LinkButton({ children, onClick, align = "center" }: {
  children: React.ReactNode; onClick: () => void; align?: "center" | "left";
}) {
  return (
    <chakra.button
      type="button" onClick={onClick}
      minH="44px" px={1} bg="transparent" color={C.brandDark}
      fontFamily={C.font} fontWeight={700} fontSize="14px" textAlign={align}
      textDecoration="underline" textUnderlineOffset="3px" textDecorationColor="var(--accent-border)"
      cursor="pointer" _hover={{ color: C.brown, textDecorationColor: C.brown }}
      _focusVisible={{ outline: `2px solid ${C.brandDark}`, outlineOffset: "2px", borderRadius: "6px" }}
    >
      {children}
    </chakra.button>
  );
}

export function FormAlert({ tone = "error", children, id }: { tone?: "error" | "ok"; children: React.ReactNode; id?: string }) {
  const isErr = tone === "error";
  return (
    <Flex id={id} role={isErr ? "alert" : "status"} w="full" gap={2.5} align="flex-start" p="12px 14px" borderRadius="var(--radius-input)"
      bg={isErr ? C.errBg : C.okBg} border="1px solid" borderColor={isErr ? "color-mix(in srgb, var(--danger) 30%, transparent)" : "color-mix(in srgb, var(--success) 30%, transparent)"}
      color={isErr ? C.err : C.ok} fontFamily={C.font} fontSize="14px" fontWeight={600} lineHeight="1.45">
      <Box as="span" mt="2px" flexShrink={0}>{isErr ? <Icon name="alert-circle" aria-hidden /> : <Icon name="check-circle" aria-hidden />}</Box>
      <Box flex="1">{children}</Box>
    </Flex>
  );
}

/** Vista de estado (éxito / aviso) con icono, título enfocable y texto. */
export function StatusView({
  icon, title, children, headingRef, tone = "ok",
}: {
  icon?: React.ReactNode; title: string; children?: React.ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>; tone?: "ok" | "warn";
}) {
  return (
    <Flex direction="column" align="center" textAlign="center" gap={3} w="full" py={4}>
      <Flex w="64px" h="64px" borderRadius="full" align="center" justify="center" fontSize="28px"
        bg={tone === "ok" ? C.sand : C.errBg} color={tone === "ok" ? C.brandDark : C.err} aria-hidden>
        {icon ?? <Icon name="check-circle" />}
      </Flex>
      <chakra.h2 ref={headingRef} tabIndex={-1} fontFamily={C.font} fontWeight={700} fontSize="24px" color={C.heading}
        lineHeight="1.2" outline="none">
        {title}
      </chakra.h2>
      {children}
    </Flex>
  );
}

/** Marca "o con tu email" entre Google y el formulario. */
function OrDivider({ label }: { label: string }) {
  return (
    <Flex w="full" align="center" gap={3} my={1} aria-hidden>
      <Box flex="1" h="1px" bg={C.line} />
      <Text fontSize="13px" fontWeight={600} color={C.muted} fontFamily={C.font}>{label}</Text>
      <Box flex="1" h="1px" bg={C.line} />
    </Flex>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

type Mode = "login" | "register" | "reset" | "resetSent" | "loginSuccess" | "registerSuccess";
type FieldKey = "name" | "email" | "password" | "confirm" | "terms";
type FormError = { text: string; kind?: "exists" };

interface AuthPageProps {
  isInModal?: boolean;
  initialMode?: "login" | "register" | "reset";
  initialEmail?: string;
}

export default function AuthPage({ isInModal = false, initialMode = "login", initialEmail = "" }: AuthPageProps) {
  const t = useAuthCopy();
  const lang = useAuthLang();
  // Acceso con Google solo si el estudio lo ha configurado (google_client_id)
  const googleEnabled = useGoogleLoginEnabled();
  const site = useSite();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<FormError | null>(null);
  const [serverFieldErr, setServerFieldErr] = useState<Partial<Record<FieldKey, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | undefined>();
  const [sentTo, setSentTo] = useState("");
  // Casilla de seguridad (Turnstile): al crear cuenta, al recuperar la
  // contraseña y al entrar solo si el servidor la pide tras varios fallos.
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaReset, setCaptchaReset] = useState(0);
  const [loginCaptcha, setLoginCaptcha] = useState(false);
  const captchaKey = site.turnstile_site_key;
  const showCaptcha = !!captchaKey && (mode === "register" || mode === "reset" || (mode === "login" && loginCaptcha));
  /** Cuerpo extra con el token (cada token vale una vez: se pide otro). */
  const takeCaptchaToken = (): Record<string, string> => {
    if (!showCaptcha || !captchaToken) return {};
    const token = captchaToken;
    setCaptchaToken("");
    setCaptchaReset((n) => n + 1);
    return { turnstile_token: token };
  };

  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
    terms: useRef<HTMLInputElement>(null),
  };
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Al cambiar de vista (salvo pestañas, que conservan el foco): foco al título
  // para que el lector de pantalla anuncie el nuevo contexto.
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (mode === "reset" || mode === "resetSent" || mode === "loginSuccess" || mode === "registerSuccess") {
      setTimeout(() => headingRef.current?.focus(), 30);
    }
  }, [mode]);

  // ── Validación en el cliente ──────────────────────────────────────────────
  const validate = useCallback((m: Mode): Partial<Record<FieldKey, string>> => {
    const e: Partial<Record<FieldKey, string>> = {};
    const em = email.trim();
    if (!em) e.email = t.errEmailRequired;
    else if (!isValidEmail(em)) e.email = t.errEmailInvalid;
    if (m === "login") {
      if (!password) e.password = t.errPasswordRequired;
    }
    if (m === "register") {
      if (!name.trim()) e.name = t.errNameRequired;
      if (!password) e.password = t.errPasswordRequired;
      else if (password.length < MIN_PASSWORD) e.password = t.errPasswordShort;
      if (!confirmPassword) e.confirm = t.errConfirmRequired;
      else if (password !== confirmPassword) e.confirm = t.errMismatch;
      if (!acceptTerms) e.terms = t.errTerms;
    }
    return e;
  }, [email, password, confirmPassword, name, acceptTerms, t]);

  const clientErrors = validate(mode);
  const errorFor = (k: FieldKey): string | null => {
    if (serverFieldErr[k]) return serverFieldErr[k]!;
    if (!(submitted || touched[k])) return null;
    return clientErrors[k] ?? null;
  };
  // Aviso en vivo de coincidencia: en cuanto la repetición alcanza la longitud
  const confirmLive = mode === "register" && confirmPassword.length > 0 &&
    (touched.confirm || confirmPassword.length >= password.length);
  const confirmError = errorFor("confirm") ?? (confirmLive && password !== confirmPassword ? t.errMismatch : null);
  const confirmOk = confirmLive && password.length > 0 && password === confirmPassword;

  const touch = (k: FieldKey) => () => setTouched((s) => ({ ...s, [k]: true }));
  const clearServer = (k: FieldKey) => {
    if (serverFieldErr[k]) setServerFieldErr((s) => ({ ...s, [k]: undefined }));
    if (formError) setFormError(null);
  };

  const switchMode = (next: Mode) => {
    setCaptchaToken("");
    setFormError(null);
    setServerFieldErr({});
    setTouched({});
    setSubmitted(false);
    setMode(next);
  };

  const finishLogin = (data: any) => {
    saveSession(data);
    setWelcomeName((data?.username || data?.name || "").split(" ")[0] || undefined);
    setMode("loginSuccess");
    setTimeout(() => {
      if (isInModal) window.location.reload();
      else window.location.href = safeNext();
    }, 1200);
  };

  // ── Envío ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    setFormError(null);
    setServerFieldErr({});

    const errs = validate(mode);
    const order: FieldKey[] = ["name", "email", "password", "confirm", "terms"];
    const firstBad = order.find((k) => errs[k]);
    if (firstBad) {
      refs[firstBad].current?.focus();
      return;
    }

    if (showCaptcha && !captchaToken) {
      setFormError({ text: t.errCaptcha });
      return;
    }

    const cleanEmail = email.trim();
    setIsSubmitting(true);
    try {
      if (mode === "reset") {
        const res = await postJson("request-reset-password/", { email: cleanEmail, ...takeCaptchaToken() });
        const common = commonError(res, t);
        if (common) { setFormError({ text: common }); return; }
        // El backend responde igual exista o no la cuenta: mensaje genérico.
        setSentTo(cleanEmail);
        switchMode("resetSent");
        return;
      }

      if (mode === "login") {
        const withCaptcha = showCaptcha;
        let res = await postJson("signinClient/", { email: cleanEmail, password, ...takeCaptchaToken() });
        // El backend compara el email distinguiendo mayúsculas: si el móvil puso
        // "Ana@…" y falla, reintentamos en minúsculas.
        if (res.status === 401 && !withCaptcha && cleanEmail !== cleanEmail.toLowerCase()) {
          res = await postJson("signinClient/", { email: cleanEmail.toLowerCase(), password });
        }
        if (res.ok) { finishLogin(res.data); return; }
        // Tras varios fallos el servidor pide la casilla de seguridad
        if (res.data?.captcha_required) setLoginCaptcha(true);
        const common = commonError(res, t);
        if (common) { setFormError({ text: common }); return; }
        if (res.status === 400) {
          const fe: Partial<Record<FieldKey, string>> = {};
          if (firstMsg(res.data, "email")) fe.email = t.errEmailInvalid;
          if (firstMsg(res.data, "password")) fe.password = t.errPasswordRequired;
          if (Object.keys(fe).length) { setServerFieldErr(fe); return; }
        }
        // 401: credenciales incorrectas (o cuenta de staff): mismo mensaje
        setFormError({ text: res.status === 401 ? t.errBadCredentials : t.errGeneric });
        refs.password.current?.focus();
        refs.password.current?.select();
        return;
      }

      // register
      const res = await postJson("signupClient/", {
        email: cleanEmail.toLowerCase(),
        password,
        first_name: name.trim(),
        username: cleanEmail.toLowerCase(),
        ...takeCaptchaToken(),
      });
      if (res.ok) {
        if (res.data?.access) saveSession(res.data);
        // Conversión de registro (solo con consentimiento: lib/tracking.ts)
        track("sign_up", { method: "email" });
        setPassword("");
        setConfirmPassword("");
        setAcceptTerms(false);
        switchMode("registerSuccess");
        return;
      }
      const common = commonError(res, t);
      if (common) { setFormError({ text: common }); return; }
      const ue = res.data?.user_errors || res.data || {};
      const emailMsg = firstMsg(ue, "email") || "";
      const userMsg = firstMsg(ue, "username") || "";
      if (/ya hay una cuenta|already exists|ya existe/i.test(emailMsg + " " + userMsg)) {
        setFormError({ text: t.errEmailExists, kind: "exists" });
        return;
      }
      const fe: Partial<Record<FieldKey, string>> = {};
      if (emailMsg) fe.email = /escribe/i.test(emailMsg) ? t.errEmailRequired : t.errEmailInvalid;
      if (firstMsg(ue, "password")) fe.password = t.errPasswordShort;
      if (firstMsg(ue, "first_name")) fe.name = t.errNameRequired;
      if (Object.keys(fe).length) {
        setServerFieldErr(fe);
        const k = order.find((x) => fe[x]);
        if (k) refs[k].current?.focus();
        return;
      }
      setFormError({ text: t.errGeneric });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Pestañas (Entrar / Crear cuenta) ─────────────────────────────────────
  const tabLoginRef = useRef<HTMLButtonElement>(null);
  const tabRegisterRef = useRef<HTMLButtonElement>(null);
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const goRegister = e.key === "ArrowRight" || e.key === "End";
    switchMode(goRegister ? "register" : "login");
    (goRegister ? tabRegisterRef : tabLoginRef).current?.focus();
  };
  // Función de render (no componente): así los botones no se remontan en cada
  // render y el foco del teclado no se pierde al cambiar de pestaña.
  const renderTab = (value: "login" | "register", label: string, r: React.RefObject<HTMLButtonElement | null>) => {
    const selected = mode === value;
    return (
      <chakra.button
        ref={r}
        type="button"
        role="tab"
        id={`auth-tab-${value}`}
        aria-selected={selected}
        aria-controls="auth-panel"
        tabIndex={selected ? 0 : -1}
        onClick={() => { if (!selected) switchMode(value); }}
        onKeyDown={onTabKey}
        flex="1" minH="44px" borderRadius="var(--radius-input)"
        fontFamily={C.font} fontWeight={700} fontSize="15px"
        bg={selected ? "var(--surface-strong)" : "transparent"}
        color={selected ? C.brown : C.muted}
        boxShadow={selected ? "var(--shadow-card)" : "none"}
        cursor={selected ? "default" : "pointer"}
        transition="background .15s, color .15s"
        _hover={selected ? undefined : { color: C.brown }}
        _focusVisible={{ outline: `2px solid ${C.brandDark}`, outlineOffset: "2px" }}
      >
        {label}
      </chakra.button>
    );
  };

  const emailFix = suggestEmailFix(email);
  const isForm = mode === "login" || mode === "register" || mode === "reset";
  const termsHref = lang === "en" ? "/en/terms-conditions" : "/terminos-condiciones";

  // ── Contenido ─────────────────────────────────────────────────────────────
  let content: React.ReactNode;

  if (mode === "loginSuccess") {
    content = (
      <StatusView title={t.loginOkTitle(welcomeName)} headingRef={headingRef}>
        <Text role="status" fontSize="15px" color={C.muted} fontFamily={C.font} fontWeight={500}>{t.loginOkText}</Text>
        <Box mt={2} w="28px" h="28px" borderRadius="full" border={`3px solid ${C.line}`} borderTopColor={C.brandDark}
          animation="spin 0.8s linear infinite" aria-hidden />
      </StatusView>
    );
  } else if (mode === "registerSuccess") {
    const goOn = () => { if (isInModal) window.location.reload(); else window.location.href = safeNext(); };
    content = (
      <Flex direction="column" gap={4} w="full">
        <StatusView title={t.registerOkTitle} headingRef={headingRef}>
          <Text fontSize="15px" color={C.muted} fontFamily={C.font} fontWeight={500} lineHeight="1.5">
            {t.registerOkText}
          </Text>
        </StatusView>
        <EmailVerifyCard
          email={email.trim().toLowerCase()}
          justRegistered
          onVerified={() => setTimeout(goOn, 1200)}
          onLater={goOn}
        />
      </Flex>
    );
  } else if (mode === "resetSent") {
    content = (
      <StatusView title={t.resetSentTitle} headingRef={headingRef} icon={<Icon name="mail" />}>
        <Text role="status" fontSize="15px" color={C.brown} fontFamily={C.font} fontWeight={500} lineHeight="1.5">
          {t.resetSentText(sentTo)}
        </Text>
        <Text fontSize="14px" color={C.muted} fontFamily={C.font}>{t.resetSentHint}</Text>
        <Box w="full" mt={3}>
          <PrimaryButton type="button" onClick={() => switchMode("login")}>{t.backToLogin}</PrimaryButton>
        </Box>
        <LinkButton onClick={() => switchMode("reset")}>{t.resetAgain}</LinkButton>
      </StatusView>
    );
  } else {
    const heading = mode === "login" ? t.loginHeading : mode === "register" ? t.registerHeading : t.resetHeading;
    const sub = mode === "login" ? t.loginSub : mode === "register" ? t.registerSub : t.resetSub;

    content = (
      <Flex direction="column" gap={4} w="full">
        {mode !== "reset" ? (
          <Flex role="tablist" aria-label={t.tabsLabel} bg={C.sand} p="4px" borderRadius="var(--radius-input)" gap={1}>
            {renderTab("login", t.tabLogin, tabLoginRef)}
            {renderTab("register", t.tabRegister, tabRegisterRef)}
          </Flex>
        ) : (
          <Box>
            <chakra.button type="button" onClick={() => switchMode("login")}
              display="inline-flex" alignItems="center" gap={2} minH="44px" px={1} ml={-1}
              bg="transparent" color={C.brandDark} fontFamily={C.font} fontWeight={700} fontSize="14px" cursor="pointer"
              _hover={{ color: C.brown }} _focusVisible={{ outline: `2px solid ${C.brandDark}`, borderRadius: "6px" }}>
              <Icon name="arrow-left" aria-hidden /> {t.backToLogin}
            </chakra.button>
          </Box>
        )}

        <Box
          id="auth-panel"
          role={mode !== "reset" ? "tabpanel" : undefined}
          aria-labelledby={mode !== "reset" ? `auth-tab-${mode}` : undefined}
        >
          <Box mb={4}>
            <chakra.h2 ref={headingRef} tabIndex={-1} outline="none" fontFamily={C.font} fontWeight={700}
              fontSize={{ base: "24px", md: "26px" }} color={C.heading} lineHeight="1.2">
              {heading}
            </chakra.h2>
            <Text mt={1.5} fontSize="15px" color={C.muted} fontFamily={C.font} fontWeight={500} lineHeight="1.5">{sub}</Text>
          </Box>

          {mode !== "reset" && googleEnabled && (
            <Flex direction="column" gap={3} mb={4}>
              <GoogleAuthButton
                onSuccess={finishLogin}
                onError={(msg) => setFormError({ text: msg })}
              />
              <OrDivider label={t.orEmail} />
            </Flex>
          )}

          <chakra.form noValidate onSubmit={handleSubmit} display="flex" flexDirection="column" gap={4} w="full"
            aria-describedby={formError ? "auth-form-error" : undefined}>
            {mode === "register" && (
              <TextField
                id="auth-name" label={t.nameLabel} value={name} placeholder={t.namePh}
                onChange={(v) => { setName(v); clearServer("name"); }} onBlur={touch("name")}
                autoComplete="name" autoCapitalize="words" icon={<Icon name="user" />} error={errorFor("name")}
                inputRef={refs.name} maxLength={80}
              />
            )}

            <TextField
              id="auth-email" label={t.emailLabel} type="email" value={email} placeholder={t.emailPh}
              onChange={(v) => { setEmail(v); clearServer("email"); }} onBlur={touch("email")}
              autoComplete="email" inputMode="email" icon={<Icon name="mail" />}
              error={errorFor("email")} inputRef={refs.email} name="email" maxLength={254}
              describedBy={emailFix ? "auth-email-fix" : undefined}
            >
              {emailFix && (
                <chakra.button id="auth-email-fix" type="button" onClick={() => { setEmail(emailFix); refs.email.current?.focus(); }}
                  mt={1.5} minH="36px" textAlign="left" bg="transparent" color={C.brandDark} fontFamily={C.font}
                  fontSize="14px" fontWeight={500} cursor="pointer" _hover={{ color: C.brown }}
                  _focusVisible={{ outline: `2px solid ${C.brandDark}`, borderRadius: "6px" }}>
                  {t.didYouMean} <b>{emailFix}</b>? <u>{t.tapToFix}</u>
                </chakra.button>
              )}
            </TextField>

            {mode === "login" && (
              <TextField
                id="auth-password" label={t.passwordLabel} type="password" value={password}
                onChange={(v) => { setPassword(v); clearServer("password"); }} onBlur={touch("password")}
                autoComplete="current-password" icon={<Icon name="lock" />} error={errorFor("password")} inputRef={refs.password}
                name="password"
                labelAside={
                  <chakra.button type="button" onClick={() => switchMode("reset")}
                    bg="transparent" color={C.brandDark} fontFamily={C.font} fontWeight={700} fontSize="13px"
                    minH="32px" px={1} cursor="pointer" textDecoration="underline" textUnderlineOffset="3px"
                    textDecorationColor="var(--accent-border)" _hover={{ color: C.brown }}
                    _focusVisible={{ outline: `2px solid ${C.brandDark}`, borderRadius: "6px" }}>
                    {t.forgot}
                  </chakra.button>
                }
              />
            )}

            {mode === "register" && (
              <>
                <TextField
                  id="auth-new-password" label={t.newPasswordLabel} type="password" value={password}
                  placeholder={t.newPasswordPh}
                  onChange={(v) => { setPassword(v); clearServer("password"); }} onBlur={touch("password")}
                  autoComplete="new-password" icon={<Icon name="lock" />} error={errorFor("password")} inputRef={refs.password}
                  name="new-password" describedBy="auth-req-length"
                >
                  <Requirement id="auth-req-length" met={password.length >= MIN_PASSWORD}>{t.reqLength}</Requirement>
                </TextField>

                <TextField
                  id="auth-confirm-password" label={t.confirmLabel} type="password" value={confirmPassword}
                  placeholder={t.confirmPh}
                  onChange={(v) => { setConfirmPassword(v); clearServer("confirm"); }} onBlur={touch("confirm")}
                  autoComplete="new-password" icon={<Icon name="lock" />} error={confirmError} inputRef={refs.confirm}
                  name="confirm-password" describedBy={confirmOk ? "auth-confirm-ok" : undefined}
                >
                  {confirmOk && !confirmError && <Requirement id="auth-confirm-ok" met>{t.matchOk}</Requirement>}
                </TextField>

                <Box>
                  <chakra.label display="flex" alignItems="flex-start" gap={3} minH="44px" py={1} cursor="pointer"
                    fontFamily={C.font} fontSize="14px" fontWeight={500} color={C.brown} lineHeight="1.45">
                    <chakra.input
                      ref={refs.terms}
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setAcceptTerms(e.target.checked); setTouched((s) => ({ ...s, terms: true })); }}
                      aria-invalid={errorFor("terms") ? true : undefined}
                      aria-describedby={errorFor("terms") ? "auth-terms-error" : undefined}
                      w="22px" h="22px" mt="1px" flexShrink={0} cursor="pointer" accentColor="var(--accent)"
                      _focusVisible={{ outline: `2px solid ${C.brandDark}`, outlineOffset: "2px" }}
                    />
                    <span>
                      {t.termsPrefix}{" "}
                      <chakra.a href={termsHref} target="_blank" rel="noopener" color={C.brandDark} fontWeight={700}
                        fontFamily={C.font} textTransform="none" fontSize="14px"
                        textDecoration="underline" textUnderlineOffset="3px" _hover={{ color: C.brown }}>
                        {t.termsLink}
                        <chakra.span srOnly> {t.termsNewTab}</chakra.span>
                      </chakra.a>
                    </span>
                  </chakra.label>
                  <Box aria-live="polite">
                    {errorFor("terms") && (
                      <Flex id="auth-terms-error" align="center" gap={1.5} mt={1} fontSize="13px" fontWeight={600} color={C.err} fontFamily={C.font}>
                        <Icon name="alert-circle" aria-hidden /> <span>{errorFor("terms")}</span>
                      </Flex>
                    )}
                  </Box>
                </Box>
              </>
            )}

            {showCaptcha && (
              <Turnstile siteKey={captchaKey} lang={lang} onToken={setCaptchaToken} resetKey={captchaReset} />
            )}

            {formError && (
              <FormAlert id="auth-form-error">
                <span>{formError.text}</span>
                {formError.kind === "exists" && (
                  <Flex gap={3} mt={1} wrap="wrap">
                    <LinkButton align="left" onClick={() => { setPassword(""); setConfirmPassword(""); switchMode("login"); }}>{t.goLogin}</LinkButton>
                    <LinkButton align="left" onClick={() => switchMode("reset")}>{t.goReset}</LinkButton>
                  </Flex>
                )}
              </FormAlert>
            )}

            <Box mt={1}>
              <PrimaryButton
                loading={isSubmitting}
                loadingText={mode === "login" ? t.submittingLogin : mode === "register" ? t.submittingRegister : t.submittingReset}
              >
                {mode === "login" ? t.submitLogin : mode === "register" ? t.submitRegister : t.submitReset}
              </PrimaryButton>
            </Box>

            {mode !== "reset" && (
              <Text textAlign="center" fontSize="14px" color={C.muted} fontFamily={C.font} fontWeight={500}>
                {mode === "login" ? t.noAccount : t.hasAccount}{" "}
                <LinkButton onClick={() => switchMode(mode === "login" ? "register" : "login")}>
                  {mode === "login" ? t.tabRegister : t.tabLogin}
                </LinkButton>
              </Text>
            )}
          </chakra.form>
        </Box>
      </Flex>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  // translate="no": el traductor del navegador reescribía nodos que React
  // controla (errores removeChild). Ya damos los textos en ES/EN.
  const body = (
    <Box w="full" maxW="420px" mx="auto" key={isForm ? "form" : mode}>
      {content}
    </Box>
  );

  if (isInModal) {
    return (
      <Chakra>
        <Toaster />
        <Box translate="no" className="notranslate" fontFamily={C.font} px={{ base: 5, md: 8 }} pt={{ base: 5, md: 6 }} pb={{ base: 8, md: 8 }}>
          {body}
        </Box>
      </Chakra>
    );
  }

  return (
    <Chakra>
      <Toaster />
      {/* Sin alto mínimo en móvil (dejaba media pantalla vacía bajo el formulario);
          la cabecera es fija (sticky), así que tampoco hace falta el hueco de arriba. */}
      <Flex translate="no" className="notranslate" w="full" minH={{ base: 'auto', md: 'calc(100dvh - var(--w-header-h, 68px))' }} bg={C.cream} fontFamily={C.font}>
        {/* Panel de marca (solo escritorio) */}
        <Box display={{ base: "none", md: "block" }} position="relative" w="50%" minH="calc(100dvh - var(--w-header-h, 68px))" overflow="hidden">
          {/* Fondo con los colores de la marca (antes, vídeo del estudio) */}
          <Box position="absolute" inset={0}
            bg="linear-gradient(135deg, var(--brand-dark) 0%, var(--brand-secondary) 55%, var(--brand-primary) 100%)" />
          <Box position="absolute" inset={0} bg="linear-gradient(180deg, color-mix(in srgb, var(--brand-dark) 25%, transparent) 0%, color-mix(in srgb, var(--brand-dark) 65%, transparent) 100%)" />
          <Flex position="absolute" inset={0} direction="column" align="center" justify="center" gap={4} px={8} textAlign="center">
            <BrandLogo variant="light" width={160} maxHeight={110} />
            <Text fontSize="2xl" fontWeight={700} color="white" maxW="360px" lineHeight="1.3" textShadow="0 2px 12px rgba(0,0,0,0.3)">
              {t.brandClaim}
            </Text>
            {(site.tagline || site.contact.city) && (
              <Text fontSize="md" color="rgba(255,255,255,0.9)" fontWeight={500}>{site.tagline || site.contact.city}</Text>
            )}
          </Flex>
        </Box>

        {/* Formulario */}
        <Flex w={{ base: "full", md: "50%" }} justify="center" align={{ base: "flex-start", md: "center" }}
          px={{ base: 4, md: 10 }} py={{ base: 6, md: 12 }}>
          <Box className="sk-card" w="full" maxW="480px" px={{ base: 5, md: 8 }} py={{ base: 6, md: 8 }}>
            <chakra.h1 srOnly>{`${site.studio_name} · ${t.tabsLabel}`}</chakra.h1>
            {body}
          </Box>
        </Flex>
      </Flex>
    </Chakra>
  );
}
