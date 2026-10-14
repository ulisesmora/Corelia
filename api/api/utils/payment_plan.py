from api.filters import User
from api.models import CreditLedgerEntry, CreditWallet, Lead, Payment, Plan
import stripe
from decimal import Decimal
from django.utils import timezone
from datetime import timedelta
from django.db import transaction
import logging

logger = logging.getLogger(__name__)


@transaction.atomic
def fulfill_plan_purchase(session):
    """
    Procesa una compra de Plan.
    Crea el Payment, la entrada de créditos del plan y, si es la
    primera compra de un Lead, añade los 2 créditos de regalo.
    """
    metadata = session.metadata
    payment_intent_id = session.payment_intent
    
    user_id = metadata.get('user_id')
    plan_id = metadata.get('plan_id')
    payment_id = metadata.get('local_payment_id')
    
    if not user_id or not plan_id:
        raise ValueError(f"Metadata incompleta en sesión {session.id}")

    # 1. Obtener Payment con LOCK para serializar webhook vs verify
    try:
        payment = Payment.objects.select_for_update().get(id=payment_id)
        payment_created = False
    except Payment.DoesNotExist:
        from api.utils.payments import from_stripe_amount, stripe_currency
        session_currency = session.currency or stripe_currency()
        amount_eur = from_stripe_amount(session.amount_total, session_currency)
        payment = Payment.objects.create(
            id=payment_id,
            user_id=user_id,
            amount_eur=amount_eur,
            currency=session_currency.upper(),
            method='stripe',
            raw_response=session
        )
        payment_created = True

    # 2. Si el pago ya fue procesado, salimos.
    if payment.status == 'succeeded':
        logger.info(f"Info: Payment {payment_intent_id} ya había sido procesado.")
        return
    
    if CreditLedgerEntry.objects.filter(metadata__payment_id=str(payment_id)).exists():
        logger.warning(f"ALERTA: El payment_id {payment_id} ya fue procesado.")
        return

    logger.info(f"Procesando NUEVO pago {payment_intent_id} para user {user_id}...")
    # 3. Obtenemos los objetos necesarios
    try:
        user = User.objects.get(id=user_id)
        plan = Plan.objects.get(id=plan_id)
        wallet, _ = CreditWallet.objects.get_or_create(user_id=user_id)
    except (User.DoesNotExist, Plan.DoesNotExist) as e:
        logger.error(f"Error CRÍTICO: {e}. Revirtiendo pago {payment_intent_id}.")
        raise # Lanza el error para revertir la transacción

    # --- 4. ✅ LÓGICA DE REGALO (Solo para Leads en su 1ra compra) ---
    try:
        # Buscamos un Lead "virgen" (que no tenga deleted_at)
        # y lo bloqueamos (select_for_update) para evitar que dos compras
        # simultáneas intenten usar el mismo Lead.
        lead_to_convert = Lead.objects.select_for_update().filter(
            email=user.email,
            deleted_at__isnull=True 
        ).first()

        # Si encontramos un Lead que coincide...
        if lead_to_convert:
            logger.info(f"Detectado Lead {lead_to_convert.id} para user {user.id}. Dando regalo...")
            # 1. Damos el regalo de 2 créditos
            CreditLedgerEntry.objects.create(
                wallet=wallet,
                kind="grant",
                amount=Decimal('2.00'), # Los 2 créditos de regalo
                expires_at=None, # O pon una expiración si quieres
                reference="Regalo de bienvenida (Lead convertido)",
                metadata={'reason': 'first_purchase_lead_gift'}
            )
            
            # 2. "Quemamos" el Lead (Soft-delete) para que no se use de nuevo
            lead_to_convert.soft_delete()
            
            logger.info(f"Éxito: 2 créditos de REGALO añadidos a wallet {wallet.id}")
    except Exception as e:
        # ¡IMPORTANTE! Si el regalo falla, no queremos que la compra falle.
        # Solo lo registramos y continuamos.
        logger.error(f"ADVERTENCIA: Falló la lógica del regalo para user {user_id}, pero la compra continuará. Error: {e}")
        # (Asegúrate de tener 'import logging' y 'logger = logging.getLogger(__name__)' al inicio del archivo)

    # --- 5. LÓGICA DE LA COMPRA (Siempre se ejecuta) ---
    
    # Calcular la fecha de expiración del plan
    expires_at = None
    if plan.credits_expire_days:
        expires_at = timezone.now() + timedelta(days=plan.credits_expire_days)

    # Crear la entrada en el Ledger para el plan COMPRADO
    CreditLedgerEntry.objects.create(
        wallet=wallet,
        kind="grant",
        amount=plan.credits,
        expires_at=expires_at,
        reference=f"Compra del plan '{plan.name}'",
        metadata={'payment_id': payment.id, 'plan_id': plan.id}
    )
    
    payment.status = 'succeeded'
    payment.save()
    
    logger.info(f"Éxito: {plan.credits} créditos del plan añadidos a wallet {wallet.id}")