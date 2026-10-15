// Tipos del calendario del panel (API: api/views_calendar.py).

export interface Ref { id: number; name: string }

export interface Blackout {
  id: number;
  kind: 'vacation' | 'closed' | 'private' | 'canceled' | 'moved';
  reason: string;
  schedule_id: number | null;
  start: string; // hora de pared del estudio «YYYY-MM-DDTHH:MM»
  end: string;
}

export interface Occurrence {
  id: string;
  kind: 'class' | 'event';
  schedule_id: number | null;
  event_id: number | null;
  date: string; // YYYY-MM-DD
  start: string; // YYYY-MM-DDTHH:MM (hora del estudio)
  end: string;
  duration: number;
  title: string;
  class_type: { id: number; title: string };
  room: Ref;
  instructor: Ref | null;
  capacity: number;
  capacity_min: number;
  booked: number;
  attended: number;
  no_show: number;
  waitlist: number;
  offered: number;
  recurring: boolean;
  weekday: number | null;
  series: { start_date: string | null; end_date: string | null } | null;
  canceled: boolean;
  blackout: Blackout | null;
  past: boolean;
  started: boolean;
  price_credits: string;
}

export interface ClassTypeLite {
  id: number;
  title: string;
  duration_minutes: number;
  instructor_id: number | null;
  default_price_credits: string;
  category: string;
}

export interface Catalog {
  rooms: (Ref & { capacity: number })[];
  instructors: Ref[];
  class_types: ClassTypeLite[];
  has_schedule: boolean;
  waitlist: { enabled: boolean };
}

export interface CalendarData {
  start: string;
  end: string;
  now: string;
  occurrences: Occurrence[];
  closed_days: Record<string, { kind: string; reason: string; id: number }>;
  blackouts: Blackout[];
  catalog?: Catalog;
}

export interface Attendee {
  booking_id: number;
  status: 'reserved' | 'attended' | 'no_show';
  name: string;
  email: string;
  phone: string;
  user_id: number | null;
  guest: boolean;
  paid_with: 'credits' | 'card' | 'free';
  balance: string | null;
  plan: string | null;
}

export interface WaitlistItem {
  id: number;
  position: number;
  status: 'waiting' | 'offered';
  offer_alive: boolean;
  offer_expires_at: string | null;
  name: string;
  email: string;
  user_id: number;
  balance: string;
  plan: string | null;
}

export interface OccurrenceDetail {
  occurrence: Occurrence;
  attendees: Attendee[];
  waitlist: WaitlistItem[];
  free_seats: number;
}

export interface MoveUndo {
  schedule: number;
  date: string;
  target: number;
  target_date: string;
  blackout: number | null;
  original: { start_time: string; end_time: string; room: number | null };
  notify: boolean;
}

export interface MoveResult {
  moved: number;
  notified: number;
  occurrence_id: string;
  schedule_id: number;
  date: string;
  undo: MoveUndo;
}

export type View = 'day' | 'week' | 'month';

export interface Filters {
  room: number | 'all';
  instructor: number | 'all';
  /** Tipos de clase ocultos (la leyenda filtra) */
  hiddenTypes: number[];
}
