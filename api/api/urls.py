from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BroadcastEmailViewSet, CheckLeadEmailView, ChooseReplacementView,     AssignRecurringClassesView, ContactUserViewSet, CreateBookingWithCreditsView, CreateCheckoutSessionView, CancelAllUserBookingsView, CreatePlanCheckoutSessionView, CreateStripeSubscriptionView, EmailVerificationView, FileUploadViewTwo, MyReplacementStatusView, MyWalletBalanceView, RequestPasswordResetView, ResetPasswordView, RoleViewSet, ScheduleViewSet, SignInView, SignInViewClient, SignUpClientView, SignUpView, StripeWebhookView, ConnectWebhookView, UpdateLeadByEmailView, UserClassPreferenceViewSet, UserViewSet, ValidateJWTView, VerifyCheckoutSessionView, VerifyPlanPurchaseView,
)
from .views import (
    MeView, ScheduleBlackoutViewSet, VapidPublicKeyView, PushSubscribeView,
    MembershipSuggestionView, MembershipNudgeEventView, MembershipCandidatesView, MembershipCandidateContactedView,
    DashboardStatsView,
    VerifyEmailCodeView, ResendVerificationView, AdminVerifyUserView,
    GuestProfileViewSet,
    CategoryViewSet, InstructorViewSet, RoomViewSet, ClassTypeViewSet,
    RecurringScheduleViewSet, EventViewSet,
    PaymentViewSet, CreditWalletViewSet, CreditLedgerEntryViewSet, SiteImageViewSet,
    PlanViewSet, SubscriptionViewSet, CouponViewSet, CouponRedemptionViewSet,
    BookingViewSet, LeadViewSet, GoogleLoginView, ClassOccurrenceViewSet,
)
from .setup_guide import SetupClassTemplatesView, SetupProgressView, SetupPublishView, SetupStepView
from .views_guest import GuestReserveView
from .setup_flow import (
    SetupClassTypeDeleteView, SetupFlowView, SetupInstructorView, SetupPacksView, SetupTipsView, SetupWeekSlotView,
    SetupWeekView,
)
from .views_security import (
    TwoFactorConfirmView, TwoFactorDisableView, TwoFactorPolicyView, TwoFactorRecoveryCodesView,
    TwoFactorSetupView, TwoFactorStatusView, TwoFactorVerifyView,
)
from .views_payments import (
    StripeConnectDisconnectView, StripeConnectStartView, StripeConnectStatusView, StripeConnectSyncView,
)
from .views_calendar import (
    CalendarAddClientView, CalendarBookingCheckInView, CalendarBookingRemoveView, CalendarCancelView,
    CalendarEditView, CalendarMoveView, CalendarNotifyView, CalendarOccurrenceView, CalendarRangeView,
    CalendarReactivateView, CalendarUndoMoveView, WaitlistClaimView, WaitlistLeaveView, WaitlistPromoteView,
    WaitlistRemoveView, WaitlistSettingsView, WaitlistView,
)
from .views_dashboard import (
    DashboardActionView, DashboardChecklistView, DashboardDayView, DashboardSalesExportView, DashboardSalesView,
    DashboardTodayView, DashboardWebSectionView, DashboardWebView,
)
from .views_site import (
    FAQItemViewSet, SiteConfigAdminView, SiteConfigCheckDomainView, SiteConfigPublicView, SiteConfigStripeView,
    SiteBadgeView, SiteConfigTestEmailView, SiteIconView, SiteOgImageView, TestimonialViewSet,
)

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'roles', RoleViewSet)
router.register(r'guests', GuestProfileViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'instructors', InstructorViewSet)
router.register(r'rooms', RoomViewSet)
router.register(r'class-types', ClassTypeViewSet)
router.register(r'recurrences', RecurringScheduleViewSet)
router.register(r'events', EventViewSet)
router.register(r'payments', PaymentViewSet)
router.register(r'wallets', CreditWalletViewSet)
router.register(r'wallet-entries', CreditLedgerEntryViewSet)
router.register(r'occurrences', ClassOccurrenceViewSet)
router.register(r'plans', PlanViewSet)
router.register(r'subscriptions', SubscriptionViewSet)
router.register(r'coupons', CouponViewSet)
router.register(r'coupon-redemptions', CouponRedemptionViewSet)
router.register(r'bookings', BookingViewSet)
router.register(r'leads', LeadViewSet)
router.register(r'contact-user', ContactUserViewSet)
router.register(r'schedule', ScheduleViewSet, basename='schedule')
router.register(r'broadcast-emails', BroadcastEmailViewSet)
router.register(r'site-images', SiteImageViewSet)
router.register(r'blackouts', ScheduleBlackoutViewSet)
router.register(r'faqs', FAQItemViewSet)
router.register(r'testimonials', TestimonialViewSet)

urlpatterns = [
    # Antes que el router: si no, `subscriptions/<pk>/` captura «create-stripe» (405).
    path('v1/subscriptions/create-stripe/', CreateStripeSubscriptionView.as_view(), name='create-stripe-subscription'),
    # Calendario del panel y lista de espera (api/views_calendar.py)
    path('v1/calendar/', CalendarRangeView.as_view(), name='calendar-range'),
    path('v1/calendar/occurrence/', CalendarOccurrenceView.as_view(), name='calendar-occurrence'),
    path('v1/calendar/occurrence/move/', CalendarMoveView.as_view(), name='calendar-move'),
    path('v1/calendar/occurrence/undo-move/', CalendarUndoMoveView.as_view(), name='calendar-undo-move'),
    path('v1/calendar/occurrence/edit/', CalendarEditView.as_view(), name='calendar-edit'),
    path('v1/calendar/occurrence/cancel/', CalendarCancelView.as_view(), name='calendar-cancel'),
    path('v1/calendar/occurrence/reactivate/', CalendarReactivateView.as_view(), name='calendar-reactivate'),
    path('v1/calendar/occurrence/add-client/', CalendarAddClientView.as_view(), name='calendar-add-client'),
    path('v1/calendar/occurrence/notify/', CalendarNotifyView.as_view(), name='calendar-notify'),
    path('v1/calendar/bookings/<int:pk>/check-in/', CalendarBookingCheckInView.as_view(), name='calendar-check-in'),
    path('v1/calendar/bookings/<int:pk>/remove/', CalendarBookingRemoveView.as_view(), name='calendar-remove-booking'),
    path('v1/waitlist/', WaitlistView.as_view(), name='waitlist'),
    path('v1/waitlist/settings/', WaitlistSettingsView.as_view(), name='waitlist-settings'),
    path('v1/waitlist/claim/', WaitlistClaimView.as_view(), name='waitlist-claim'),
    path('v1/waitlist/<int:pk>/leave/', WaitlistLeaveView.as_view(), name='waitlist-leave'),
    path('v1/waitlist/<int:pk>/promote/', WaitlistPromoteView.as_view(), name='waitlist-promote'),
    path('v1/waitlist/<int:pk>/remove/', WaitlistRemoveView.as_view(), name='waitlist-remove'),
    # Resúmenes del panel: Hoy, Ventas, Mi web, Ajustes (api/views_dashboard.py)
    path('v1/dashboard/today/', DashboardTodayView.as_view(), name='dashboard-today'),
    path('v1/dashboard/day/', DashboardDayView.as_view(), name='dashboard-day'),
    path('v1/dashboard/actions/', DashboardActionView.as_view(), name='dashboard-actions'),
    path('v1/dashboard/sales/', DashboardSalesView.as_view(), name='dashboard-sales'),
    path('v1/dashboard/sales/export/', DashboardSalesExportView.as_view(), name='dashboard-sales-export'),
    path('v1/dashboard/web/', DashboardWebView.as_view(), name='dashboard-web'),
    path('v1/dashboard/web/sections/', DashboardWebSectionView.as_view(), name='dashboard-web-sections'),
    path('v1/dashboard/checklist/', DashboardChecklistView.as_view(), name='dashboard-checklist'),
    path('v1/', include(router.urls)),  # Namespace the router URLs under 'api/'
    path('signup/', SignUpView.as_view(), name='signup'),
    path('signin/', SignInView.as_view(), name='signin'),
    path('signupClient/', SignUpClientView.as_view(), name='signupClient'),
    path('signinClient/', SignInViewClient.as_view(), name='signinClient'),
    path('verify-email/', EmailVerificationView.as_view(), name='verify-email'),
    path('v1/auth/verify-code/', VerifyEmailCodeView.as_view(), name='verify-code'),
    path('v1/auth/resend-verification/', ResendVerificationView.as_view(), name='resend-verification'),
    # Verificación en dos pasos del panel (api/views_security.py)
    path('v1/auth/2fa/', TwoFactorStatusView.as_view(), name='2fa-status'),
    path('v1/auth/2fa/setup/', TwoFactorSetupView.as_view(), name='2fa-setup'),
    path('v1/auth/2fa/confirm/', TwoFactorConfirmView.as_view(), name='2fa-confirm'),
    path('v1/auth/2fa/disable/', TwoFactorDisableView.as_view(), name='2fa-disable'),
    path('v1/auth/2fa/recovery-codes/', TwoFactorRecoveryCodesView.as_view(), name='2fa-recovery-codes'),
    path('v1/auth/2fa/policy/', TwoFactorPolicyView.as_view(), name='2fa-policy'),
    path('v1/auth/2fa/verify/', TwoFactorVerifyView.as_view(), name='2fa-verify'),
    path('v1/users/<int:user_id>/verify-email/', AdminVerifyUserView.as_view(), name='admin-verify-email'),
    path('request-reset-password/', RequestPasswordResetView.as_view(), name='request-reset-password'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset-password'),
    path('validate',ValidateJWTView.as_view(), name='validate'),
    path('upload/', FileUploadViewTwo.as_view(), name='file-upload'),
    path('google-login/', GoogleLoginView.as_view(), name='googlesign'),
    path('wallet/my-balance/', MyWalletBalanceView.as_view(), name='my-wallet-balance'),
    path('v1/me/', MeView.as_view(), name='me'),
    path('v1/site-config/public/', SiteConfigPublicView.as_view(), name='site-config-public'),
    path('v1/site-config/', SiteConfigAdminView.as_view(), name='site-config'),
    path('v1/site-config/test-email/', SiteConfigTestEmailView.as_view(), name='site-config-test-email'),
    path('v1/site-config/stripe/', SiteConfigStripeView.as_view(), name='site-config-stripe'),
    # «Conectar pagos» (Stripe Connect; api/views_payments.py)
    path('v1/site-config/stripe/connect/status/', StripeConnectStatusView.as_view(), name='stripe-connect-status'),
    path('v1/site-config/stripe/connect/start/', StripeConnectStartView.as_view(), name='stripe-connect-start'),
    path('v1/site-config/stripe/connect/sync/', StripeConnectSyncView.as_view(), name='stripe-connect-sync'),
    path('v1/site-config/stripe/connect/disconnect/', StripeConnectDisconnectView.as_view(),
         name='stripe-connect-disconnect'),
    path('v1/site-config/icon/<int:size>.png', SiteIconView.as_view(), name='site-icon'),
    path('v1/site-config/og.png', SiteOgImageView.as_view(), name='site-og-image'),
    path('v1/site-config/badge.png', SiteBadgeView.as_view(), name='site-badge'),
    path('v1/site-config/check-domain/', SiteConfigCheckDomainView.as_view(), name='site-config-check-domain'),
    # Guía de puesta en marcha (api/setup_guide.py)
    path('v1/setup/progress/', SetupProgressView.as_view(), name='setup-progress'),
    path('v1/setup/steps/<slug:key>/', SetupStepView.as_view(), name='setup-step'),
    path('v1/setup/publish/', SetupPublishView.as_view(), name='setup-publish'),
    path('v1/setup/class-templates/', SetupClassTemplatesView.as_view(), name='setup-class-templates'),
    # Puesta en marcha obligatoria y consejos del panel (api/setup_flow.py)
    path('v1/setup/flow/', SetupFlowView.as_view(), name='setup-flow'),
    path('v1/setup/instructors/', SetupInstructorView.as_view(), name='setup-instructors'),
    path('v1/setup/class-types/<int:pk>/', SetupClassTypeDeleteView.as_view(), name='setup-class-type-delete'),
    path('v1/setup/week/', SetupWeekView.as_view(), name='setup-week'),
    path('v1/setup/week/<int:pk>/', SetupWeekSlotView.as_view(), name='setup-week-slot'),
    path('v1/setup/packs/', SetupPacksView.as_view(), name='setup-packs'),
    path('v1/setup/tips/', SetupTipsView.as_view(), name='setup-tips'),
    path('v1/me/membership-suggestion/', MembershipSuggestionView.as_view(), name='membership-suggestion'),
    path('v1/me/membership-suggestion/event/', MembershipNudgeEventView.as_view(), name='membership-suggestion-event'),
    path('v1/stats/dashboard/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('v1/membership-candidates/', MembershipCandidatesView.as_view(), name='membership-candidates'),
    path('v1/membership-candidates/<int:user_id>/contacted/', MembershipCandidateContactedView.as_view(), name='membership-candidate-contacted'),
    path('v1/push/vapid-public-key/', VapidPublicKeyView.as_view(), name='push-vapid-key'),
    path('v1/push/subscribe/', PushSubscribeView.as_view(), name='push-subscribe'),
    path('v1/checkout/create-session/', CreateCheckoutSessionView.as_view(), name='create-checkout-session'),
    path('v1/checkout/verify-checkout/', VerifyCheckoutSessionView.as_view(), name='payments-verify-checkout/'),
    path('v1/checkout/pay-plan/', CreatePlanCheckoutSessionView.as_view(), name='payments-pay-plan/'),
    path('v1/checkout/verify-plan/', VerifyPlanPurchaseView.as_view(), name='payments-verify-plan/'),
    path('v1/checkout/reserve/', CreateBookingWithCreditsView.as_view(), name='payments-reserve/'),
    # Invitada sin cuenta y estudio sin pagos online: reservar y pagar en el estudio
    path('v1/checkout/guest-reserve/', GuestReserveView.as_view(), name='checkout-guest-reserve'),
    path('v1/checkleads/check-email/', CheckLeadEmailView.as_view(), name='check-lead-email'),
    path('v1/checkleads/update-by-email/', UpdateLeadByEmailView.as_view(), name='update-lead-by-email'),
    path('v1/webhooks/listener/', StripeWebhookView.as_view(), name='webhook_listener'),
    path('v1/webhooks/connect/', ConnectWebhookView.as_view(), name='webhook_connect'),
    path('v1/my-class-preferences/', UserClassPreferenceViewSet.as_view({'get': 'list', 'post': 'create'}), name='my-class-preferences'),
    path('v1/my-class-preferences/<int:pk>/', UserClassPreferenceViewSet.as_view({'delete': 'destroy', 'patch': 'partial_update'}), name='my-class-preferences-detail'),
    path('v1/users/<int:user_id>/class-preferences/', UserClassPreferenceViewSet.as_view({'get': 'for_user', 'post': 'for_user', 'delete': 'for_user'}), name='user-class-preferences'),
    path('v1/users/<int:user_id>/class-preferences/<int:pk>/', UserClassPreferenceViewSet.as_view({'delete': 'for_user_delete'}), name='user-class-preferences-delete'),
    path('v1/my-replacement-status/', MyReplacementStatusView.as_view(), name='my-replacement-status'),
    path('v1/choose-replacement/', ChooseReplacementView.as_view(), name='choose-replacement'),
    path('v1/users/<int:user_id>/assign-recurring/', AssignRecurringClassesView.as_view(), name='assign-recurring'),
    path('v1/users/<int:user_id>/cancel-all-bookings/', CancelAllUserBookingsView.as_view(), name='cancel-all-bookings'),
    
]