# app/filters.py

import django_filters
from django.contrib.auth import get_user_model

User = get_user_model()

class UserFilter(django_filters.FilterSet):
    # Definimos explícitamente el campo 'is_superuser'
    is_superuser = django_filters.BooleanFilter(field_name='is_superuser')

    class Meta:
        model = User
        # Lista de campos que se pueden filtrar directamente
        fields = ['is_superuser', 'is_staff', 'is_active', 'email']