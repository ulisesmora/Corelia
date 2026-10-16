import { Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';
import Users from './pages/Users';
import RecurringScheduleManagement from './pages/Payments';
import CalendarPage from './pages/CalendarPage';
import CustomerViewer from './pages/Clients';
import { AuthProvider } from './context/AuthContext';
import ClassTypeManagement from './pages/Bots';
import PlanManagement from './pages/Plans';
import PaymentViewer from './pages/Payment';
import BookingViewer from './pages/Bookings';
import CouponManagement from './pages/CuoponManagment';
import BroadcastManagement from './pages/Mailing';
import MembershipCandidates from './pages/MembershipCandidates';
import InstructorManagement from './pages/InstructorsManagment';
import SubscriptionsManagement from './pages/Subscriptions';
import CreditsManagement from './pages/Credits';
import AssignClassesManagement from './pages/AssignClasses';
import SiteImagesManagement from './pages/SiteImages';
import RoomsManagement from './pages/Rooms';
import CategoriesManagement from './pages/Categories';
import Setup from './pages/Setup';
import StudioSettings from './pages/StudioSettings';
import Security from './pages/Security';
import SalesPage from './pages/ventas/SalesPage';
import MyWebPage from './pages/miweb/MyWebPage';
import SettingsHub from './pages/ajustes/SettingsHub';
import CatalogPage from './pages/catalogo/CatalogPage';
import NewStudioClientWizard from './pages/estudio/NewStudioClientWizard';
import SetupGate from './components/setup/SetupGate';
import { GuideRedirect, ProgressOutlet } from './onboarding';

const App = () => (
  <AuthProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<ProgressOutlet />}>
        <Route path="/bienvenida" element={<Setup />} />
        <Route element={<SetupGate><MainLayout /></SetupGate>}>
          <Route path="/" element={<Home />} />
          {/* Antes: guía de 11 pasos. Ahora: la puesta en marcha obligatoria (o Ajustes si ya está publicada) */}
          <Route path="/puesta-en-marcha" element={<GuideRedirect />} />
          <Route path="/admins" element={<Users />} />
          <Route path="/classes" element={<ClassTypeManagement />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/calendar/horarios" element={<RecurringScheduleManagement />} />
          <Route path="/plans" element={<PlanManagement />} />
          <Route path="/payments" element={<PaymentViewer />} />
          <Route path="/clients" element={<CustomerViewer />} />
          <Route path="/bookings" element={<BookingViewer />} />
          <Route path="/cuopon" element={<CouponManagement />} />
          <Route path="/mails" element={<BroadcastManagement />} />
          <Route path="/membership-candidates" element={<MembershipCandidates />} />
          <Route path="/instructors" element={<InstructorManagement />} />
          <Route path="/subscriptions" element={<SubscriptionsManagement />} />
          <Route path="/credits" element={<CreditsManagement />} />
          <Route path="/assign-classes" element={<AssignClassesManagement />} />
          <Route path="/site-images" element={<SiteImagesManagement />} />
          <Route path="/rooms" element={<RoomsManagement />} />
          <Route path="/categories" element={<CategoriesManagement />} />
          <Route path="/ajustes" element={<StudioSettings />} />
          <Route path="/seguridad" element={<Security />} />
          {/* Ventas, Mi web y Ajustes (pages/ventas, pages/miweb, pages/ajustes) */}
          <Route path="/ventas" element={<SalesPage />} />
          <Route path="/mi-web" element={<MyWebPage />} />
          <Route path="/configuracion" element={<SettingsHub />} />
          {/* Clases y precios: tipos de clase, precios y bonos, profesores, categorías y salas */}
          <Route path="/clases-y-precios" element={<CatalogPage />} />
          {/* Clientas del estudio: alta guiada (plan mensual cobrado en el estudio) */}
          <Route path="/clientas/estudio/nueva" element={<NewStudioClientWizard />} />
        </Route>
        </Route>
      </Route>
    </Routes>
  </AuthProvider>
);

export default App;
