"""Cifrado de los secretos que el estudio guarda desde el panel (contraseña
del email, claves de Stripe). Se cifran con una clave derivada de la
SECRET_KEY de la instalación: quien lea un volcado de la BD no ve las claves.

OJO: si se cambia la SECRET_KEY, estos secretos dejan de poder leerse y hay
que volver a introducirlos en el panel (el resto de datos no se ve afectado).
"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models

_PREFIX = 'enc:'


def _fernet():
    digest = hashlib.sha256(f'studio-kit:{settings.SECRET_KEY}'.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    if not value:
        return ''
    return _PREFIX + _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    if not value:
        return ''
    if not value.startswith(_PREFIX):
        return value  # dato antiguo sin cifrar
    try:
        return _fernet().decrypt(value[len(_PREFIX):].encode()).decode()
    except InvalidToken:
        return ''  # SECRET_KEY cambiada: hay que volver a introducirlo


class EncryptedTextField(models.TextField):
    """TextField que se guarda cifrado y se lee en claro."""

    def from_db_value(self, value, expression, connection):
        return decrypt(value) if value else (value or '')

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        return encrypt(value) if value else ''
