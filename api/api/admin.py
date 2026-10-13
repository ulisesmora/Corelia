from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserCreationForm, UserChangeForm
from django import forms
from django.shortcuts import redirect
from django.contrib import messages
from django.urls import path
from django.template.response import TemplateResponse

from .models import (
    ContactUser, Role, GuestProfile,
    Category, Instructor, Room, ClassType,
    RecurringSchedule, ScheduleBlackout,
    Payment, CreditWallet, CreditLedgerEntry,
    Plan, Subscription, Coupon, CouponRedemption,
    Booking, Lead, UserClassPreference, SiteImage,
)

User = get_user_model()


class CreditAdjustForm(forms.Form):
    amount = forms.DecimalField(label='Cantidad (+ para añadir, - para quitar)', max_digits=9, decimal_places=2)
    reason = forms.CharField(label='Motivo', max_length=255, required=False)


class CreditLedgerEntryInline(admin.TabularInline):
    model = CreditLedgerEntry
    extra = 0
    readonly_fields = ('kind', 'amount', 'reference', 'metadata', 'expires_at', 'created_at')
    can_delete = False
    ordering = ('-created_at',)
    fields = ('kind', 'amount', 'reference', 'expires_at', 'created_at')
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


class SubscriptionInline(admin.TabularInline):
    model = Subscription
    extra = 0
    fields = ('plan', 'status', 'current_period_start', 'current_period_end', 'cancel_at_period_end', 'stripe_subscription_id')
    show_change_link = True


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0
    readonly_fields = ('amount_eur', 'currency', 'status', 'method', 'stripe_checkout_session_id', 'stripe_payment_intent_id', 'created_at')
    can_delete = False
    fields = ('amount_eur', 'currency', 'status', 'method', 'created_at')
    show_change_link = True
    ordering = ('-created_at',)

    def has_add_permission(self, request, obj=None):
        return False


class CreditWalletInline(admin.StackedInline):
    model = CreditWallet
    extra = 0
    fields = ('wallet_balance',)
    readonly_fields = ('wallet_balance',)

    def has_add_permission(self, request, obj=None):
        return False

    def wallet_balance(self, obj):
        return obj.balance
    wallet_balance.short_description = 'Balance'


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    add_form = UserCreationForm
    form = UserChangeForm

    list_display = ('id', 'email', 'first_name', 'created_by_admin', 'is_active', 'is_staff', 'is_verified', 'date_joined')
    list_filter = ('is_active', 'is_staff', 'is_verified', 'created_by_admin', 'date_joined')
    search_fields = ('email', 'id', 'first_name')
    ordering = ('-date_joined',)
    readonly_fields = ('date_joined', 'last_login', 'verification_token', 'verification_token_expires', 'reset_token', 'reset_token_expires')

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Información Personal', {
            'fields': ('first_name', 'last_name', 'phone', 'birth_date', 'city', 'gender', 'experience_level', 'goal_primary', 'source', 'consent'),
        }),
        ('Preferencias de Marketing', {
            'fields': ('whatThinkFeel', 'whatSee', 'whatListen', 'whatsay', 'frustated', 'desires'),
            'classes': ('collapse',),
        }),
        ('Permisos', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'is_verified', 'created_by_admin', 'role', 'groups', 'user_permissions'),
        }),
        ('Fechas Importantes', {
            'fields': ('date_joined', 'last_login'),
        }),
        ('Stripe', {
            'fields': ('stripe_customer_id',),
        }),
        ('Estado de Reemplazo', {
            'fields': ('needs_class_replacement', 'replacement_class_options', 'replacement_deadline'),
            'classes': ('collapse',),
        }),
        ('Tokens', {
            'fields': ('verification_token', 'verification_token_expires', 'reset_token', 'reset_token_expires'),
            'classes': ('collapse',),
        }),
        ('Notas', {
            'fields': ('notes',),
            'classes': ('collapse',),
        }),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'first_name', 'last_name', 'password1', 'password2'),
        }),
        ('Opcional', {
            'classes': ('wide',),
            'fields': ('phone', 'is_active', 'is_staff', 'is_superuser', 'is_verified', 'created_by_admin'),
        }),
    )

    inlines = [CreditWalletInline, SubscriptionInline, PaymentInline]

    actions = ['adjust_credits_action']

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by_admin = True
            obj.is_verified = True
        super().save_model(request, obj, form, change)

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                '<id>/adjust-credits/',
                self.admin_site.admin_view(self.adjust_credits_view),
                name='user_adjust_credits',
            ),
        ]
        return custom_urls + urls

    def adjust_credits_action(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, 'Selecciona exactamente un usuario para ajustar créditos.', messages.ERROR)
            return
        user = queryset.first()
        return redirect('admin:user_adjust_credits', id=user.id)
    adjust_credits_action.short_description = 'Ajustar créditos del usuario'

    def adjust_credits_view(self, request, id):
        user = self.get_object(request, id)
        if request.method == 'POST':
            form = CreditAdjustForm(request.POST)
            if form.is_valid():
                amount = form.cleaned_data['amount']
                reason = form.cleaned_data['reason'] or 'Ajuste manual desde admin'
                wallet, _ = CreditWallet.objects.get_or_create(user=user)
                CreditLedgerEntry.objects.create(
                    wallet=wallet,
                    kind='adjust',
                    amount=amount,
                    reference=reason,
                    metadata={'adjusted_by': str(request.user.email), 'user_id': user.id},
                )
                self.message_user(request, f'Créditos ajustados: {amount:+.2f}. Balance actual: {wallet.balance}', messages.SUCCESS)
                return redirect('admin:api_user_change', id)
        else:
            form = CreditAdjustForm()
        context = {
            'title': f'Ajustar créditos de {user.email}',
            'form': form,
            'user_obj': user,
            'opts': self.model._meta,
        }
        return TemplateResponse(request, 'admin/adjust_credits.html', context)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'description', 'created_at')
    search_fields = ('name',)
    ordering = ('name',)


@admin.register(GuestProfile)
class GuestProfileAdmin(admin.ModelAdmin):
    list_display = ('public_id', 'name', 'email', 'phone', 'birth_date', 'linked_user', 'created_at')
    search_fields = ('name', 'email', 'phone')
    ordering = ('-created_at',)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('linked_user')


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'email', 'phone', 'birth_date', 'source', 'created_at')
    search_fields = ('name', 'email', 'phone')
    list_filter = ('source',)
    ordering = ('-created_at',)


@admin.register(ContactUser)
class ContactUserAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'email', 'created_at')
    search_fields = ('name', 'email')
    ordering = ('-created_at',)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'slug', 'color')
    search_fields = ('name', 'slug')


@admin.register(Instructor)
class InstructorAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'slug', 'experience_years')
    search_fields = ('name', 'slug')


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'capacity', 'location')
    search_fields = ('name', 'location')


@admin.register(ClassType)
class ClassTypeAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'category', 'level', 'duration_minutes', 'is_active')
    search_fields = ('title', 'slug')
    list_filter = ('category', 'level', 'is_active')

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('category')


@admin.register(RecurringSchedule)
class RecurringScheduleAdmin(admin.ModelAdmin):
    list_display = ('id', 'class_type', 'room', 'weekday', 'start_time', 'end_time', 'is_active', 'is_recurrent')
    list_filter = ('weekday', 'is_active', 'is_recurrent', 'room')
    search_fields = ('class_type__title', 'room__name')
    ordering = ('weekday', 'start_time')

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('class_type', 'room')


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ('id', 'amount_eur', 'currency', 'status', 'method', 'user', 'guest', 'created_at')
    list_filter = ('status', 'method', 'currency')
    search_fields = ('id', 'user__email', 'guest__email', 'stripe_checkout_session_id', 'stripe_payment_intent_id')
    readonly_fields = ('stripe_checkout_session_id', 'stripe_payment_intent_id')
    ordering = ('-created_at',)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'guest')


@admin.register(CreditWallet)
class CreditWalletAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'balance')
    search_fields = ('user__email',)
    inlines = [CreditLedgerEntryInline]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')


@admin.register(CreditLedgerEntry)
class CreditLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ('id', 'wallet', 'kind', 'amount', 'expires_at', 'created_at')
    list_filter = ('kind', 'created_at')
    search_fields = ('wallet__user__email', 'reference')
    readonly_fields = ('kind', 'amount', 'reference', 'metadata', 'expires_at', 'created_at')
    ordering = ('-created_at',)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('wallet__user')


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'plan', 'status', 'current_period_start', 'current_period_end', 'cancel_at_period_end')
    list_filter = ('status', 'plan')
    search_fields = ('user__email', 'stripe_subscription_id')

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'plan')


@admin.register(CouponRedemption)
class CouponRedemptionAdmin(admin.ModelAdmin):
    list_display = ('id', 'coupon', 'user', 'guest', 'times_used')
    list_filter = ('coupon',)
    search_fields = ('user__email', 'guest__email')

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('coupon', 'user', 'guest')


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'guest', 'occurrence', 'event', 'status', 'start_datetime', 'created_at')
    list_filter = ('status', 'start_datetime')
    search_fields = ('user__email', 'guest__email', 'occurrence__class_type__title')
    ordering = ('-start_datetime',)
    date_hierarchy = 'start_datetime'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'user', 'guest', 'occurrence__class_type', 'event'
        )


@admin.register(UserClassPreference)
class UserClassPreferenceAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'schedule', 'is_active', 'created_at')
    list_filter = ('is_active', 'schedule__class_type')
    search_fields = ('user__email', 'schedule__class_type__title')

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'schedule__class_type')


@admin.register(ScheduleBlackout)
class ScheduleBlackoutAdmin(admin.ModelAdmin):
    list_display = ('id', 'schedule', 'kind', 'start_datetime', 'end_datetime', 'reason', 'created_by')
    list_filter = ('kind',)
    search_fields = ('reason', 'schedule__class_type__title')
    ordering = ('-start_datetime',)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('schedule__class_type', 'created_by')


@admin.register(SiteImage)
class SiteImageAdmin(admin.ModelAdmin):
    list_display = ('id', 'section', 'title', 'order', 'is_active')
    list_filter = ('section', 'is_active')
    search_fields = ('title',)
    ordering = ('section', 'order')
