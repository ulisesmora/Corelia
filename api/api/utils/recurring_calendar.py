
from datetime import date, datetime, timedelta
from typing import Dict, List

from api.models import RecurringSchedule


def generate_recurring_occurrences(start_date: date, end_date: date) -> List[Dict]:
    """Genera las ocurrencias de las reglas recurrentes dentro del rango de fechas."""
    
    # Obtener todas las reglas recurrentes activas
    recurrences = RecurringSchedule.objects.filter(
        is_recurrent=True,
        is_active=True,
    ).select_related('class_type__instructor', 'room', 'override_instructor')

    occurrences = []
    
    # Recorrer cada regla
    for rule in recurrences:
        
        if rule.start_date and rule.start_date > start_date:
            rule_start_date = rule.start_date
        else:
        # Si rule.start_date es None o es anterior, usa el start_date del filtro
            rule_start_date = start_date
        
        # Si la regla tiene una fecha de fin y esta es anterior a la fecha de inicio del rango, la saltamos
        if rule.end_date and rule.end_date < rule_start_date:
            continue
            
        # Determinar la fecha de inicio de la iteración
        current_date = rule_start_date
        
        # Iterar día por día hasta la fecha final
        while current_date <= end_date:
            
            # 1. Verificar si la regla de recurrencia ha expirado (si end_date está definida)
            if rule.end_date and current_date > rule.end_date:
                break
                
            # 2. Verificar el día de la semana
            if current_date.weekday() == rule.weekday:
                
                # 3. Construir la ocurrencia (en memoria)
                start_dt = datetime.combine(current_date, rule.start_time)
                end_dt = datetime.combine(current_date, rule.end_time)
                
                # Si el tiempo de fin cruza la medianoche, corregir la fecha de fin
                if rule.end_time <= rule.start_time:
                    end_dt += timedelta(days=1)
                    
                instructor_name = None
                # 2. Usar el override si existe
                if rule.override_instructor:
                    instructor_name = rule.override_instructor.name
                # 3. Si no, usar el del class_type (comprobando que exista)
                elif rule.class_type and rule.class_type.instructor:
                    instructor_name = rule.class_type.instructor.name
                
                occurrences.append({
                    'id': f'R_{rule.id}_{current_date}', # ID único para el frontend
                    'type': 'RECURRENCE',
                    'title': rule.class_type.title,
                    'title_en': rule.class_type.title_en or rule.class_type.title,
                    'start_datetime': start_dt.isoformat(),
                    'end_datetime': end_dt.isoformat(),
                    'room': rule.room.name,
                    'room_en': rule.room.title_en or rule.room.name,
                    'capacity_max': rule.capacity_max,
                    'capacity_min': rule.capacity_min, # <--- AÑADIDO
                    'is_recurrent': True,
                    'source_id': rule.id,
                    'class_type_id': rule.class_type.id,
                    'class_type_slug': rule.class_type.slug,
                    'price_eur_overwrite': rule.price_eur_override,
                    'price_credit_overwrite': rule.price_credits_override,
                    'price_eur': rule.class_type.default_price_eur,
                    'room': rule.room.name if rule.room else None,
                    'price_credit': rule.class_type.default_price_credits,
                    'image': rule.class_type.image, 
                    'instructor': instructor_name,
                
                    
                    
                })
                
                
            
            # Moverse al día siguiente
            current_date += timedelta(days=1)
            
    return occurrences
