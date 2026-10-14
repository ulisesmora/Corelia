"use client";
/**
 * Icon — iconos de la web con NOMBRE SEMÁNTICO y familia elegida en el panel
 * (Ajustes → Aspecto → Iconos: `theme.icons`).
 *
 *   <Icon name="calendar" size={14} color="var(--accent)" />
 *
 * Familias (todas de react-icons, mismo tamaño y posición en las tres):
 *  - line  → Lucide (`react-icons/lu`): línea fina. Valor por defecto.
 *  - soft  → Phosphor Duotone (`react-icons/pi`): redondeados, con relleno suave.
 *  - solid → FontAwesome (`react-icons/fa`): rellenos (el look de siempre).
 *
 * Los LOGOS DE MARCAS (WhatsApp, Instagram, Facebook, TikTok, YouTube, LinkedIn,
 * Google, Apple) son
 * siempre los de FontAwesome Brands, en las tres familias.
 *
 * La familia sale de `useSite()`: en el navegador es `window.__SITE__` y en el
 * servidor la misma config ya cargada por el <head>, así que el HTML del
 * servidor y el del navegador coinciden al hidratar (sin desajustes).
 *
 * Añadir un icono: una entrada en ICONS con sus tres variantes (comprueba que
 * el nombre existe en node_modules/react-icons/{fa,lu,pi}/index.d.ts).
 */
import type { IconBaseProps, IconType } from 'react-icons';
import {
  FaApple, FaArrowLeft, FaArrowRight, FaBolt, FaCalendarAlt, FaCalendarCheck, FaCalendarDay,
  FaCalendarPlus, FaCalendarWeek, FaChalkboardTeacher, FaCheck, FaCheckCircle, FaChevronDown,
  FaChevronLeft, FaChevronRight, FaClock, FaCreditCard, FaCrown, FaDoorOpen, FaDownload, FaEdit,
  FaEnvelope, FaExclamationCircle, FaExclamationTriangle, FaEye, FaEyeSlash, FaGift, FaGlobe,
  FaGooglePlusG, FaHistory, FaHome, FaInfinity, FaInstagram, FaLeaf, FaLinkedin, FaListUl, FaLock,
  FaMapMarkerAlt, FaPhone, FaPlus, FaRedo, FaRegCircle, FaShoppingBag, FaShoppingCart, FaSpa,
  FaStar, FaStore, FaTag, FaTags, FaTimes, FaTimesCircle, FaTrash, FaUser, FaUserCircle,
  FaUserFriends, FaWhatsapp, FaBars, FaFacebook, FaTiktok, FaYoutube, FaGoogle, FaCommentDots,
  FaCookieBite,
} from 'react-icons/fa';
import {
  LuArrowLeft, LuArrowRight, LuCalendar, LuCalendarCheck, LuCalendarDays, LuCalendarPlus,
  LuCalendarRange, LuCheck, LuChevronDown, LuChevronLeft, LuChevronRight, LuCircle, LuCircleAlert,
  LuCircleCheck, LuCircleUser, LuCircleX, LuClock, LuCreditCard, LuCrown, LuDoorOpen, LuDownload,
  LuEye, LuEyeOff, LuFlower2, LuGift, LuGlobe, LuHistory, LuHouse, LuInfinity, LuLeaf, LuList,
  LuLock, LuMail, LuMapPin, LuMenu, LuPhone, LuPlus, LuPresentation, LuRotateCcw, LuShoppingBag,
  LuShoppingCart, LuSparkles, LuSquarePen, LuStar, LuStore, LuTag, LuTags, LuTrash2,
  LuTriangleAlert, LuUser, LuUsers, LuX, LuPersonStanding, LuActivity, LuMessageSquareHeart, LuCookie,
} from 'react-icons/lu';
import {
  PiArrowCounterClockwiseDuotone, PiArrowLeftDuotone, PiArrowRightDuotone, PiCalendarBlankDuotone,
  PiCalendarCheckDuotone, PiCalendarDotsDuotone, PiCalendarDuotone, PiCalendarPlusDuotone,
  PiCaretDownDuotone, PiCaretLeftDuotone, PiCaretRightDuotone, PiChalkboardTeacherDuotone,
  PiCheckCircleDuotone, PiCheckDuotone, PiCircleDuotone, PiClockCounterClockwiseDuotone,
  PiClockDuotone, PiCreditCardDuotone, PiCrownDuotone, PiDoorOpenDuotone, PiDownloadSimpleDuotone,
  PiEnvelopeSimpleDuotone, PiEyeDuotone, PiEyeSlashDuotone, PiFlowerLotusDuotone, PiGiftDuotone,
  PiGlobeDuotone, PiHouseDuotone, PiInfinityDuotone, PiLeafDuotone, PiLightningDuotone,
  PiListBulletsDuotone, PiListDuotone, PiLockDuotone, PiMapPinDuotone, PiPencilSimpleDuotone,
  PiPersonArmsSpreadDuotone, PiPersonSimpleTaiChiDuotone, PiPhoneDuotone, PiPlusDuotone,
  PiShoppingBagDuotone, PiShoppingCartDuotone, PiSparkleDuotone, PiStarDuotone, PiStorefrontDuotone,
  PiTagDuotone, PiTagSimpleDuotone, PiTrashDuotone, PiUserCircleDuotone, PiUserDuotone,
  PiUsersDuotone, PiWarningCircleDuotone, PiWarningDuotone, PiXCircleDuotone, PiXDuotone,
  PiChatCircleTextDuotone, PiCookieDuotone,
} from 'react-icons/pi';
// Disciplinas: FontAwesome no tiene yoga/pilates; en "solid" se usan estos rellenos.
import { GrYoga } from 'react-icons/gr';
import { GiMeditation } from 'react-icons/gi';
import { MdSportsGymnastics } from 'react-icons/md';
import { useSite } from '../../lib/site';

export type IconFamily = 'line' | 'soft' | 'solid';

/** [line (Lucide), soft (Phosphor Duotone), solid (FontAwesome)] */
const ICONS = {
  // Navegación y acciones
  'arrow-left': [LuArrowLeft, PiArrowLeftDuotone, FaArrowLeft],
  'arrow-right': [LuArrowRight, PiArrowRightDuotone, FaArrowRight],
  'chevron-left': [LuChevronLeft, PiCaretLeftDuotone, FaChevronLeft],
  'chevron-right': [LuChevronRight, PiCaretRightDuotone, FaChevronRight],
  'chevron-down': [LuChevronDown, PiCaretDownDuotone, FaChevronDown],
  menu: [LuMenu, PiListDuotone, FaBars],
  close: [LuX, PiXDuotone, FaTimes],
  'close-circle': [LuCircleX, PiXCircleDuotone, FaTimesCircle],
  home: [LuHouse, PiHouseDuotone, FaHome],
  plus: [LuPlus, PiPlusDuotone, FaPlus],
  check: [LuCheck, PiCheckDuotone, FaCheck],
  'check-circle': [LuCircleCheck, PiCheckCircleDuotone, FaCheckCircle],
  circle: [LuCircle, PiCircleDuotone, FaRegCircle],
  edit: [LuSquarePen, PiPencilSimpleDuotone, FaEdit],
  trash: [LuTrash2, PiTrashDuotone, FaTrash],
  download: [LuDownload, PiDownloadSimpleDuotone, FaDownload],
  refresh: [LuRotateCcw, PiArrowCounterClockwiseDuotone, FaRedo],
  eye: [LuEye, PiEyeDuotone, FaEye],
  'eye-off': [LuEyeOff, PiEyeSlashDuotone, FaEyeSlash],
  list: [LuList, PiListBulletsDuotone, FaListUl],
  // Avisos
  warning: [LuTriangleAlert, PiWarningDuotone, FaExclamationTriangle],
  'alert-circle': [LuCircleAlert, PiWarningCircleDuotone, FaExclamationCircle],
  // Calendario y tiempo
  calendar: [LuCalendar, PiCalendarBlankDuotone, FaCalendarAlt],
  'calendar-plus': [LuCalendarPlus, PiCalendarPlusDuotone, FaCalendarPlus],
  'calendar-check': [LuCalendarCheck, PiCalendarCheckDuotone, FaCalendarCheck],
  'calendar-week': [LuCalendarRange, PiCalendarDuotone, FaCalendarWeek],
  'calendar-day': [LuCalendarDays, PiCalendarDotsDuotone, FaCalendarDay],
  clock: [LuClock, PiClockDuotone, FaClock],
  history: [LuHistory, PiClockCounterClockwiseDuotone, FaHistory],
  // Personas y lugares
  user: [LuUser, PiUserDuotone, FaUser],
  'user-circle': [LuCircleUser, PiUserCircleDuotone, FaUserCircle],
  users: [LuUsers, PiUsersDuotone, FaUserFriends],
  teacher: [LuPresentation, PiChalkboardTeacherDuotone, FaChalkboardTeacher],
  door: [LuDoorOpen, PiDoorOpenDuotone, FaDoorOpen],
  'map-pin': [LuMapPin, PiMapPinDuotone, FaMapMarkerAlt],
  store: [LuStore, PiStorefrontDuotone, FaStore],
  globe: [LuGlobe, PiGlobeDuotone, FaGlobe],
  // Contacto
  mail: [LuMail, PiEnvelopeSimpleDuotone, FaEnvelope],
  phone: [LuPhone, PiPhoneDuotone, FaPhone],
  /** Dejar una opinión / reseña */
  review: [LuMessageSquareHeart, PiChatCircleTextDuotone, FaCommentDots],
  /** Preferencias de cookies */
  cookie: [LuCookie, PiCookieDuotone, FaCookieBite],
  // Compra y planes
  cart: [LuShoppingCart, PiShoppingCartDuotone, FaShoppingCart],
  bag: [LuShoppingBag, PiShoppingBagDuotone, FaShoppingBag],
  'credit-card': [LuCreditCard, PiCreditCardDuotone, FaCreditCard],
  tag: [LuTag, PiTagSimpleDuotone, FaTag],
  tags: [LuTags, PiTagDuotone, FaTags],
  gift: [LuGift, PiGiftDuotone, FaGift],
  crown: [LuCrown, PiCrownDuotone, FaCrown],
  bolt: [LuSparkles, PiLightningDuotone, FaBolt],
  infinity: [LuInfinity, PiInfinityDuotone, FaInfinity],
  star: [LuStar, PiStarDuotone, FaStar],
  lock: [LuLock, PiLockDuotone, FaLock],
  // Bienestar y disciplinas
  leaf: [LuLeaf, PiLeafDuotone, FaLeaf],
  spa: [LuFlower2, PiFlowerLotusDuotone, FaSpa],
  yoga: [LuPersonStanding, PiPersonSimpleTaiChiDuotone, GrYoga],
  meditation: [LuFlower2, PiFlowerLotusDuotone, GiMeditation],
  pilates: [LuActivity, PiPersonArmsSpreadDuotone, MdSportsGymnastics],
  sparkle: [LuSparkles, PiSparkleDuotone, FaStar],
  // Logos de marcas: siempre FontAwesome Brands
  whatsapp: [FaWhatsapp, FaWhatsapp, FaWhatsapp],
  instagram: [FaInstagram, FaInstagram, FaInstagram],
  linkedin: [FaLinkedin, FaLinkedin, FaLinkedin],
  google: [FaGooglePlusG, FaGooglePlusG, FaGooglePlusG],
  /** Ficha de Google Business (logo «G») */
  'google-business': [FaGoogle, FaGoogle, FaGoogle],
  facebook: [FaFacebook, FaFacebook, FaFacebook],
  tiktok: [FaTiktok, FaTiktok, FaTiktok],
  youtube: [FaYoutube, FaYoutube, FaYoutube],
  apple: [FaApple, FaApple, FaApple],
} satisfies Record<string, readonly [IconType, IconType, IconType]>;

export type IconName = keyof typeof ICONS;

const FAMILY_INDEX: Record<IconFamily, 0 | 1 | 2> = { line: 0, soft: 1, solid: 2 };

/** Familia de iconos de la config (por defecto 'line'). */
export function useIconFamily(): IconFamily {
  const fam = useSite().theme.icons;
  return fam in FAMILY_INDEX ? fam : 'line';
}

/** Componente de react-icons para un nombre y familia (útil para `as={…}`). */
export function iconFor(name: IconName, family: IconFamily = 'line'): IconType {
  return ICONS[name][FAMILY_INDEX[family]];
}

export interface IconProps extends IconBaseProps {
  name: IconName;
}

/** Icono semántico en la familia elegida en el panel. Acepta las props de react-icons. */
export function Icon({ name, ...rest }: IconProps) {
  const Cmp = iconFor(name, useIconFamily());
  return <Cmp aria-hidden={rest.title ? undefined : true} {...rest} />;
}

export default Icon;
