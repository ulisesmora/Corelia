"use client";
// Página /calendar: título corto + horario con reserva (AgendaCalendar).
import React, { useCallback } from 'react';
import Chakra from './ChakraProvider';
import AgendaCalendar, { type CalendarEvent } from './AgendaCalendar';
import { useLangStore } from './stores/lang.store';

export default function CalendarViewPage() {
  const lang = useLangStore((s) => s.lang);
  const en = lang === 'en';
  // AgendaCalendar ya añade la clase y lleva al checkout
  const onSelect = useCallback((_event: CalendarEvent) => {}, []);

  return (
    <Chakra>
    <div className="w-wrap" style={{ maxWidth: 880, paddingBottom: 'var(--w-8)' }}>
      <header className="w-pagehead">
        <h1 className="w-h1">{en ? 'Timetable' : 'Horario'}</h1>
        <p className="w-lead">{en ? 'Pick a day, check the spots left and book in one tap.' : 'Elige un día, mira las plazas que quedan y reserva en un toque.'}</p>
      </header>
      <AgendaCalendar onSelectEvent={onSelect} />
    </div>
    </Chakra>
  );
}
