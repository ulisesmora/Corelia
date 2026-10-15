// Vista Mes: cada día con su ocupación como «calor» del color del estudio y
// un punto por tipo de clase. Clic en un día → vista Día.
import type { CSSProperties } from 'react';
import type { CalendarData, Occurrence } from './types';
import type { ClassTone } from './classColors';
import { DS, MONTHS, addDays, dayNum, monthIdx, startOfMonth } from './dates';
import { monthGridRange, occupancyPct } from './helpers';

interface Props {
  anchor: string;
  occurrences: Occurrence[];
  closedDays: CalendarData['closed_days'];
  today: string;
  tone: (o: Occurrence) => ClassTone;
  onPickDay: (date: string) => void;
}

export default function MonthView({ anchor, occurrences, closedDays, today, tone, onPickDay }: Props) {
  const { start } = monthGridRange(anchor);
  const month = monthIdx(anchor);
  const byDay = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    if (!byDay.has(o.date)) byDay.set(o.date, []);
    byDay.get(o.date)!.push(o);
  }
  // 5 o 6 semanas según el mes
  const lastOfMonth = addDays(startOfMonth(addDays(startOfMonth(anchor), 32)), -1);
  const weeks = addDays(start, 35) <= lastOfMonth ? 6 : 5;
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return (
    <div className="kc-wrap kc-month" role="grid" aria-label={`${MONTHS[month]} ${anchor.slice(0, 4)}`}>
      <div className="kc-mh" role="row">{DS.map((d) => <span role="columnheader" key={d}>{d}</span>)}</div>
      <div className="kc-mgrid">
        {cells.map((d) => {
          const inMonth = monthIdx(d) === month;
          const list = (byDay.get(d) || []).filter((o) => !o.canceled);
          const closed = closedDays[d];
          const occ = closed || !list.length ? 0 : occupancyPct(list);
          const types = new Map<number, Occurrence>();
          list.forEach((o) => types.set(o.class_type.id, o));
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              className={`kc-mc ${inMonth ? '' : 'out'} ${d === today ? 'today' : ''} ${closed ? 'closed' : ''}`}
              style={{ '--heat': `${Math.round(occ * 0.24)}%` } as CSSProperties}
              onClick={() => onPickDay(d)}
              aria-label={`${dayNum(d)} de ${MONTHS[monthIdx(d)]}${closed ? `, cerrado (${closed.reason || 'festivo'})` : `, ${list.length} clases, ${occ}% de ocupación`}`}
            >
              <span className="mn">{dayNum(d)}</span>
              {closed ? (
                <span className="mo">{closed.reason || 'Cerrado'}</span>
              ) : list.length ? (
                <>
                  <span className="md" aria-hidden="true">
                    {[...types.values()].slice(0, 6).map((o) => <i key={o.class_type.id} style={{ background: tone(o).dot }} />)}
                  </span>
                  <span className="mo">
                    <span className="kc-hide-xs">{list.length} clase{list.length > 1 ? 's' : ''} · </span>{occ}%
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="kc-mleg" aria-hidden="true">
        <span>Ocupación</span>
        {[3, 10, 17, 24].map((h) => <i key={h} style={{ '--heat': `${h}%` } as CSSProperties} />)}
        <span>alta</span>
      </div>
    </div>
  );
}
