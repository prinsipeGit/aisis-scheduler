import type { CSSProperties } from "react";
import type { Day, Schedule } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import { subjectPrefix } from "../../lib/course-code";
import { formatTime } from "../../lib/time";

const WEEKDAYS: Day[] = ["M", "T", "W", "TH", "F"];
const WEEKEND: Day[] = ["SAT", "SUN"];
const PX_PER_MIN = 0.8;
const HEADER = 28;
const DEPTS = 6;

// Keyed on the SUBJECT, not the whole code: every MATH section shares one tint, so the colour
// tells the student which department a block belongs to instead of decorating it. Stable across
// candidates, since the same subject always hashes the same way.
function deptFor(courseCode: string): { background: string; color: string } {
  const subject = subjectPrefix(courseCode);
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash = (hash * 31 + subject.charCodeAt(i)) >>> 0;
  const n = (hash % DEPTS) + 1;
  return { background: `var(--dept-${n})`, color: `var(--dept-${n}-ink)` };
}

export function WeekGrid({ schedule }: { schedule: Schedule }) {
  const timed = schedule.flatMap((s) => s.meetings);
  // Bounds still come from the data — ITMGT 20.51 QRF runs to 21:30 and used to overflow a grid
  // that hard-stopped at 21:00 (§11) — but the default frame is the teaching day, 7am to 6pm,
  // not 7am to 9pm. A fixed frame keeps the grid from resizing as the student pages through
  // candidates; the old one just spent a third of its height on hours nobody has class in.
  const start = timed.length ? Math.min(420, ...timed.map((m) => m.start)) : 420;
  const end = timed.length ? Math.max(1080, ...timed.map((m) => m.end)) : 1080;
  const height = (end - start) * PX_PER_MIN + HEADER;

  // Saturday and Sunday only earn a column when something meets on them. Most schedules are
  // weekday-only, and two dead columns cost every other day a third of its width.
  const used = new Set(timed.flatMap((m) => m.days));
  const days = [...WEEKDAYS, ...WEEKEND.filter((d) => used.has(d))];

  const labels: number[] = [];
  for (let m = Math.ceil(start / 120) * 120; m <= end; m += 120) labels.push(m);

  const tba = schedule.filter((s) => s.meetings.length === 0);

  // The hour rules are drawn by CSS from these two values, so they stay aligned with the
  // blocks whatever bounds the data produces.
  const gridVars = {
    "--hour": `${60 * PX_PER_MIN}px`,
    "--head": `${HEADER}px`,
    gridTemplateColumns: `52px repeat(${days.length}, minmax(78px, 1fr))`,
  } as CSSProperties;

  return (
    <div className="schedule-grid-scroll" role="region" aria-label="Weekly schedule" tabIndex={0}>
      <div className="grid" style={gridVars}>
        <div className="time-axis" aria-hidden="true" style={{ height }}>
          {labels.map((m) => (
            <span key={m} style={{ top: HEADER + (m - start) * PX_PER_MIN }}>{formatTime(m)}</span>
          ))}
        </div>
        {days.map((day) => (
          <div key={day} className="day-col" style={{ height }}>
            <div className="day-label">{day}</div>
            {schedule.flatMap((s) =>
              s.meetings
                .filter((m) => m.days.includes(day))
                .map((m, i) => (
                  <div key={`${sectionKey(s)}-${day}-${i}`} className="block"
                       style={{
                         top: HEADER + (m.start - start) * PX_PER_MIN,
                         height: (m.end - m.start) * PX_PER_MIN,
                         ...deptFor(s.courseCode),
                       }}>
                    <strong>{sectionKey(s)}</strong>
                    <span className="block-when">{formatTime(m.start)}-{formatTime(m.end)}</span>
                    {s.room && <><br /><span className="block-room">{s.room}</span></>}
                  </div>
                ))
            )}
          </div>
        ))}
      </div>
      {tba.length > 0 && (
        <p className="tba-note">
          No fixed meeting time: <code>{tba.map(sectionKey).join(", ")}</code>
        </p>
      )}
    </div>
  );
}
