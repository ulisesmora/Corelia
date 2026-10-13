import { useState, ReactNode } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  AppBar,
  Toolbar,
  Typography,
  Divider,
  Avatar,
  Stack,
  Tooltip,
  Paper,
  BottomNavigation,
  BottomNavigationAction,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import PeopleIcon from '@mui/icons-material/People';
import NotificationsIcon from '@mui/icons-material/Notifications';
import LogoutIcon from '@mui/icons-material/Logout';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import ClassIcon from '@mui/icons-material/Class';
import InsertInvitationIcon from '@mui/icons-material/InsertInvitation';
import PaymentsIcon from '@mui/icons-material/Payments';
import MarkunreadMailboxIcon from '@mui/icons-material/MarkunreadMailbox';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SchoolIcon from '@mui/icons-material/School';
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom';
import CategoryIcon from '@mui/icons-material/Category';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import SubscriptionsIcon from '@mui/icons-material/Subscriptions';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import HomeIcon from '@mui/icons-material/Home';
import TuneIcon from '@mui/icons-material/Tune';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import Button from '@mui/material/Button';
import { OPEN_GUIDE_EVENT } from './guide';
import InstallCrmApp, { canInstallCrm, openInstallHelp } from './InstallCrmApp';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../site/SiteProvider';
import StudioLogo from '../site/StudioLogo';

const DRAWER_WIDTH = 290;
// Menú encogido (solo iconos) en ordenador
const MINI_WIDTH = 84;
const MINI_KEY = 'crmSidebarMini';
// Alto de la barra inferior del móvil (sin contar la zona del gesto de inicio)
const BOTTOM_NAV_HEIGHT = 68;

// Lo más usado, siempre a mano abajo en el móvil ("Más" abre el menú completo)
const BOTTOM_ITEMS = [
  { label: 'Inicio', icon: <HomeIcon />, path: '/' },
  { label: 'Reservas', icon: <MenuBookIcon />, path: '/bookings' },
  { label: 'Clientas', icon: <PeopleIcon />, path: '/clients' },
  { label: 'Horarios', icon: <InsertInvitationIcon />, path: '/calendar' },
];

function readMini(): boolean {
  try {
    return localStorage.getItem(MINI_KEY) === '1';
  } catch {
    return false;
  }
}

interface MenuItem {
  text: string;
  /** Una línea que explica para qué sirve */
  hint: string;
  icon: ReactNode;
  path: string;
}

const MENU_SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: '',
    items: [{ text: 'Inicio', hint: 'Lo más usado, en un clic', icon: <HomeIcon />, path: '/' }],
  },
  {
    title: 'Día a día',
    items: [
      { text: 'Reservas', hint: 'Quién viene a cada clase', icon: <MenuBookIcon />, path: '/bookings' },
      { text: 'Clientas', hint: 'Buscar, dar de alta, ver fichas', icon: <PeopleIcon />, path: '/clients' },
      { text: 'Créditos', hint: 'Añadir o quitar clases a alguien', icon: <AccountBalanceWalletIcon />, path: '/credits' },
      { text: 'Avisos a clientas', hint: 'Enviar un mensaje a todas', icon: <NotificationsIcon />, path: '/mails' },
    ],
  },
  {
    title: 'Clases y horarios',
    items: [
      { text: 'Mis clases y horarios', hint: 'Horario, cambios y cierres', icon: <InsertInvitationIcon />, path: '/calendar' },
      { text: 'Clases fijas de clientas', hint: 'Plaza guardada cada semana', icon: <AssignmentIcon />, path: '/assign-classes' },
      { text: 'Tipos de clase', hint: 'Pilates, yoga… y su descripción', icon: <ClassIcon />, path: '/classes' },
      { text: 'Instructores', hint: 'Quién da las clases', icon: <SchoolIcon />, path: '/instructors' },
    ],
  },
  {
    title: 'Ventas y precios',
    items: [
      { text: 'Pagos', hint: 'Lo que se ha cobrado', icon: <PaymentsIcon />, path: '/payments' },
      { text: 'Membresías', hint: 'Quién paga cada mes', icon: <SubscriptionsIcon />, path: '/subscriptions' },
      { text: 'Candidatas a membresía', hint: 'Vienen cada semana sin membresía', icon: <WorkspacePremiumIcon />, path: '/membership-candidates' },
      { text: 'Bonos y precios', hint: 'Lo que se vende en la web', icon: <CardMembershipIcon />, path: '/plans' },
      { text: 'Cupones de descuento', hint: 'Códigos con descuento', icon: <MarkunreadMailboxIcon />, path: '/cuopon' },
    ],
  },
  {
    title: 'Ajustes (se usan poco)',
    items: [
      { text: 'Mi estudio y mi web', hint: 'Nombre, aspecto, textos, emails y pagos', icon: <TuneIcon />, path: '/ajustes' },
      { text: 'Salas', hint: 'Espacios del estudio', icon: <MeetingRoomIcon />, path: '/rooms' },
      { text: 'Categorías', hint: 'Grupos de clases en la web', icon: <CategoryIcon />, path: '/categories' },
      { text: 'Fotos de la web', hint: 'Imágenes de tu web', icon: <PhotoLibraryIcon />, path: '/site-images' },
      { text: 'Administradores', hint: 'Quién puede entrar aquí', icon: <AdminPanelSettingsIcon />, path: '/admins' },
    ],
  },
];

export default function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mini, setMini] = useState(readMini);
  const toggleMini = () => {
    setMini((m) => {
      try { localStorage.setItem(MINI_KEY, m ? '0' : '1'); } catch { /* sin almacenamiento */ }
      return !m;
    });
  };
  const drawerWidth = mini ? MINI_WIDTH : DRAWER_WIDTH;
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { config } = useSite();

  const drawerContent = (compact: boolean, showMiniToggle = false) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo del estudio (o su nombre, si no ha subido logo) */}
      <Box sx={{ px: compact ? 0 : 3, pt: 3.5, pb: 2.5, textAlign: compact ? 'center' : 'left' }}>
        <StudioLogo compact={compact} height={56} fontSize={compact ? '2rem' : '1.6rem'} />
        {!compact && config.tagline && <Typography
          sx={{
            fontFamily: 'var(--studio-font-body)',
            fontWeight: 300,
            fontSize: '0.7rem',
            color: 'var(--studio-primary)',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            mt: 0.6,
          }}
        >
          {config.tagline}
        </Typography>}
      </Box>

      <Divider sx={{ mx: 2.5 }} />

      <Box sx={{ flexGrow: 1, overflowY: 'auto', py: 1.5 }}>
        {MENU_SECTIONS.map((section) => (
          <Box key={section.title} sx={{ mb: 1 }}>
            {compact && section.title && <Divider sx={{ mx: 2, my: 1 }} />}
            {!compact && section.title && <Typography
              sx={{
                px: 3,
                pt: 2,
                pb: 0.8,
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--studio-primary-shade)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {section.title}
            </Typography>}
            <List sx={{ p: 0 }}>
              {section.items.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <ListItem key={item.path} disablePadding>
                    <Tooltip
                      title={compact ? <><b>{item.text}</b><br />{item.hint}</> : ''}
                      placement="right"
                      disableInteractive
                    >
                    <ListItemButton
                      onClick={() => { navigate(item.path); setMobileOpen(false); }}
                      aria-current={active ? 'page' : undefined}
                      aria-label={compact ? item.text : undefined}
                      sx={{
                        justifyContent: compact ? 'center' : 'flex-start',
                        mx: 1.5,
                        my: 0.3,
                        borderRadius: 2.5,
                        minHeight: 52,
                        backgroundColor: active ? 'rgb(var(--studio-primary-rgb) / 0.1)' : 'transparent',
                        '&:hover': {
                          backgroundColor: active
                            ? 'rgb(var(--studio-primary-rgb) / 0.15)'
                            : 'rgb(var(--studio-primary-rgb) / 0.05)',
                        },
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      {active && (
                        <Box
                          sx={{
                            position: 'absolute',
                            left: 0,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: 3,
                            height: 22,
                            borderRadius: '0 4px 4px 0',
                            backgroundColor: 'var(--studio-primary)',
                          }}
                        />
                      )}
                      <ListItemIcon
                        sx={{
                          minWidth: compact ? 0 : 36,
                          color: active ? 'var(--studio-primary)' : 'var(--studio-text-hint)',
                          transition: 'color 0.25s',
                        }}
                      >
                        {item.icon}
                      </ListItemIcon>
                      {!compact && <ListItemText
                        primary={item.text}
                        secondary={item.hint}
                        slotProps={{
                          primary: {
                            sx: {
                              fontSize: '0.95rem',
                              fontWeight: active ? 600 : 500,
                              color: active ? 'var(--studio-dark)' : 'var(--studio-text-strong)',
                              transition: 'color 0.25s',
                              lineHeight: 1.3,
                            },
                          },
                          secondary: {
                            sx: { fontSize: '0.78rem', color: 'var(--studio-text-hint)', lineHeight: 1.3, mt: 0.2 },
                          },
                        }}
                      />}
                    </ListItemButton>
                    </Tooltip>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      <Divider sx={{ mx: 2.5 }} />

      <Box sx={{ p: compact ? 1 : 2 }}>
        {canInstallCrm() && (
          <ListItem disablePadding>
            <ListItemButton
              onClick={() => { setMobileOpen(false); openInstallHelp(); }}
              sx={{ mx: 0.5, borderRadius: 2.5, minHeight: 52, color: 'var(--studio-primary-dark)' }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'var(--studio-primary)' }}>
                <InstallMobileIcon />
              </ListItemIcon>
              <ListItemText
                primary="Instalar en el móvil"
                secondary="Como una app, con su icono"
                slotProps={{
                  primary: { sx: { fontSize: '0.95rem', fontWeight: 600 } },
                  secondary: { sx: { fontSize: '0.78rem', color: 'var(--studio-text-hint)' } },
                }}
              />
            </ListItemButton>
          </ListItem>
        )}
        {showMiniToggle && (
          <ListItem disablePadding>
            <Tooltip title={compact ? 'Mostrar el menú completo' : ''} placement="right" disableInteractive>
              <ListItemButton
                onClick={toggleMini}
                aria-label={compact ? 'Mostrar el menú completo' : undefined}
                sx={{ mx: 0.5, borderRadius: 2.5, minHeight: 48, justifyContent: compact ? 'center' : 'flex-start', color: 'var(--studio-text-muted)' }}
              >
                <ListItemIcon sx={{ minWidth: compact ? 0 : 36, color: 'var(--studio-text-hint)' }}>
                  {compact ? <KeyboardDoubleArrowRightIcon /> : <KeyboardDoubleArrowLeftIcon />}
                </ListItemIcon>
                {!compact && (
                  <ListItemText
                    primary="Encoger el menú"
                    slotProps={{ primary: { sx: { fontSize: '0.9rem', fontWeight: 500 } } }}
                  />
                )}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        )}
        <ListItem disablePadding>
          <Tooltip title={compact ? 'Salir del programa' : ''} placement="right" disableInteractive>
          <ListItemButton
            onClick={logout}
            aria-label={compact ? 'Salir del programa' : undefined}
            sx={{
              justifyContent: compact ? 'center' : 'flex-start',
              mx: 0.5,
              borderRadius: 2.5,
              color: '#C2857A',
              '&:hover': { backgroundColor: 'rgba(194,133,122,0.08)' },
            }}
          >
            <ListItemIcon sx={{ minWidth: compact ? 0 : 36, color: '#C2857A' }}>
              <LogoutIcon />
            </ListItemIcon>
            {!compact && <ListItemText
              primary="Salir del programa"
              slotProps={{ primary: { sx: { fontSize: '0.95rem', fontWeight: 500 } } }}
            />}
          </ListItemButton>
          </Tooltip>
        </ListItem>
      </Box>
    </Box>
  );

  // Sección activa de la barra inferior (también en sus subpantallas)
  const bottomValue = BOTTOM_ITEMS.find((b) => b.path === location.pathname)?.path ?? 'menu';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          transition: 'width 0.25s ease, margin 0.25s ease',
        }}
      >
        <Toolbar sx={{ px: { xs: 1.5, sm: 2, md: 4 }, minHeight: '64px !important', gap: 1 }}>
          <Button
            onClick={() => setMobileOpen(!mobileOpen)}
            startIcon={<MenuIcon />}
            aria-label="Abrir el menú"
            sx={{ display: { md: 'none' }, color: 'var(--studio-dark)', minHeight: 44, px: 1.5 }}
          >
            Menú
          </Button>
          <Box aria-hidden sx={{ display: { xs: 'block', md: 'none' }, minWidth: 0, maxWidth: '45vw' }}>
            <StudioLogo height={32} fontSize="1.2rem" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} />
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={{ xs: 1, sm: 2.5 }} alignItems="center">
            <Button
              variant="outlined"
              startIcon={<HelpOutlineIcon />}
              onClick={() => window.dispatchEvent(new Event(OPEN_GUIDE_EVENT))}
              sx={{ minHeight: 44, px: 2, backgroundColor: 'rgba(255,255,255,0.7)' }}
            >
              Ayuda
            </Button>
            <Typography
              sx={{ fontSize: '0.9rem', color: 'var(--studio-text-muted)', fontFamily: 'var(--studio-font-body)', display: { xs: 'none', sm: 'block' } }}
            >
              {user?.name || user?.email || 'Administrador'}
            </Typography>
            <Avatar
              sx={{
                display: { xs: 'none', sm: 'flex' },
                width: 34,
                height: 34,
                bgcolor: 'var(--studio-primary)',
                fontSize: '0.85rem',
                fontFamily: 'var(--studio-font-heading)',
              }}
            >
              {(user?.name || user?.email || config.studio_name || 'A')[0].toUpperCase()}
            </Avatar>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 }, transition: 'width 0.25s ease' }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH, maxWidth: '86vw' },
          }}
        >
          {drawerContent(false)}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              overflowX: 'hidden',
              transition: 'width 0.25s ease',
            },
          }}
          open
        >
          {drawerContent(mini, true)}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          minHeight: '100vh',
          // Hueco para que la barra inferior del móvil no tape el final de la página
          pb: { xs: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`, md: 0 },
        }}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 2, md: 3.5 } }}>
          <Outlet />
        </Box>
      </Box>

      <InstallCrmApp />

      {/* Móvil y tablet: lo más usado abajo, al alcance del pulgar */}
      <Paper
        component="nav"
        aria-label="Secciones principales"
        elevation={0}
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: (theme) => theme.zIndex.appBar,
          borderRadius: 0,
          borderTop: '1px solid rgb(var(--studio-line-rgb) / 0.35)',
          backgroundColor: 'rgba(255,255,255,0.92)',
          boxShadow: '0 -4px 20px rgb(var(--studio-dark-rgb) / 0.08)',
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <BottomNavigation
          showLabels
          value={bottomValue}
          onChange={(_, value: string) => {
            if (value === 'menu') setMobileOpen(true);
            else { navigate(value); setMobileOpen(false); }
          }}
          sx={{
            height: BOTTOM_NAV_HEIGHT,
            backgroundColor: 'transparent',
            '& .MuiBottomNavigationAction-root': { minWidth: 0, px: 0.5, color: 'var(--studio-text-hint)' },
            '& .MuiBottomNavigationAction-root.Mui-selected': { color: 'var(--studio-primary-dark)' },
            '& .MuiBottomNavigationAction-label': { fontSize: '0.78rem', fontWeight: 500, mt: 0.25 },
            '& .MuiBottomNavigationAction-label.Mui-selected': { fontSize: '0.8rem', fontWeight: 600 },
          }}
        >
          {BOTTOM_ITEMS.map((b) => (
            <BottomNavigationAction key={b.path} value={b.path} label={b.label} icon={b.icon} />
          ))}
          <BottomNavigationAction value="menu" label="Más" icon={<MenuIcon />} />
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
