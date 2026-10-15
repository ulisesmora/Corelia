from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BroadcastEmailViewSet, CheckLeadEmailView, ChooseReplacementView,     AssignRecurringClassesView, ContactUserViewSet, CreateBookingWithCreditsView, CreateCheckoutSessionView, CancelAllUserBookingsView, CreatePlanCheckoutSessionView, CreateStripeSubscriptionView, EmailVerificationView, FileUploadViewTwo, MyReplacementStatusView, MyWalletBalanceView, RequestPasswordResetView, ResetPasswordView, RoleViewSet, ScheduleViewSet, SignInView, SignInViewClient, SignUpClientView, SignUpView, StripeWebhookView, UpdateLeadByEmailView, UserClassPreferenceViewSet, UserViewSet, ValidateJWTView, VerifyCheckoutSessionView, VerifyPlanPurchaseView,
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
from .views_security import (
    TwoFactorConfirmView, TwoFactorDisableView, TwoFactorPolicyView, TwoFactorRecoveryCodesView,
    TwoFactorSetupView, TwoFactorStatusView, TwoFactorVerifyView,
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
    path('v1/site-config/icon/<int:size>.png', SiteIconView.as_view(), name='site-icon'),
    path('v1/site-config/og.png', SiteOgImageView.as_view(), name='site-og-image'),
    path('v1/site-config/badge.png', SiteBadgeView.as_view(), name='site-badge'),
    path('v1/site-config/check-domain/', SiteConfigCheckDomainView.as_view(), name='site-config-check-domain'),
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
    path('v1/checkleads/check-email/', CheckLeadEmailView.as_view(), name='check-lead-email'),
    path('v1/checkleads/update-by-email/', UpdateLeadByEmailView.as_view(), name='update-lead-by-email'),
    path('v1/webhooks/listener/', StripeWebhookView.as_view(), name='webhook_listener'),
    path('v1/subscriptions/create-stripe/', CreateStripeSubscriptionView.as_view(), name='create-stripe-subscription'),
    path('v1/my-class-preferences/', UserClassPreferenceViewSet.as_view({'get': 'list', 'post': 'create'}), name='my-class-preferences'),
    path('v1/my-class-preferences/<int:pk>/', UserClassPreferenceViewSet.as_view({'delete': 'destroy', 'patch': 'partial_update'}), name='my-class-preferences-detail'),
    path('v1/users/<int:user_id>/class-preferences/', UserClassPreferenceViewSet.as_view({'get': 'for_user', 'post': 'for_user', 'delete': 'for_user'}), name='user-class-preferences'),
    path('v1/users/<int:user_id>/class-preferences/<int:pk>/', UserClassPreferenceViewSet.as_view({'delete': 'for_user_delete'}), name='user-class-preferences-delete'),
    path('v1/my-replacement-status/', MyReplacementStatusView.as_view(), name='my-replacement-status'),
    path('v1/choose-replacement/', ChooseReplacementView.as_view(), name='choose-replacement'),
    path('v1/users/<int:user_id>/assign-recurring/', AssignRecurringClassesView.as_view(), name='assign-recurring'),
    path('v1/users/<int:user_id>/cancel-all-bookings/', CancelAllUserBookingsView.as_view(), name='cancel-all-bookings'),
    
]