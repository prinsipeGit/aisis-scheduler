import type { Day, Schedule } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import { formatTime } from "../../lib/time";

const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT", "SUN"];
const PX_PER_MIN = 0.8;
const HEADER = 28;
const HUES = ["var(--hue-1)", "var(--hue-2)", "var(--hue-3)", "var(--hue-4)", "var(--hue-5)", "var(--hue-6)"];

// Stable per course code, so a course keeps its colour across candidates.
function hueFor(courseCode: string): string {
  let hash = 0;
  for (let i = 0; i < courseCode.length; i++) hash = (hash * 31 + courseCode.charCodeAt(i)) >>> 0;
  return HUES[hash % HUES.length];
}

export function WeekGrid({ schedule }: { schedule: Schedule }) {
  const timed = schedule.flatMap((s) => s.meetings);
  // Bounds come from the data, not constants: ITMGT 20.51 QRF runs to 21:30 and used to
  // overflow a grid that hard-stopped at 21:00 (§11).
  const start = timed.length ? Math.min(420, ...timed.map((m) => m.start)) : 420;
  const end = timed.length ? Math.max(1260, ...timed.map((m) => m.end)) : 1260;
  const height = (end - start) * PX_PER_MIN + HEADER;

  const labels: number[] = [];
  for (let m = Math.ceil(start / 120) * 120; m <= end; m += 120) labels.push(m);

  const tba = schedule.filter((s) => s.meetings.length === 0);

  return (
    <div className="schedule-grid-scroll" role="region" aria-label="Weekly schedule" tabIndex={0}>
      <div className="grid">
        <div className="time-axis" aria-hidden="true" style={{ height }}>
          {labels.map((m) => (
            <span key={m} style={{ top: HEADER + (m - start) * PX_PER_MIN }}>{formatTime(m)}</span>
          ))}
        </div>
        {DAYS.map((day) => (
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
                         background: hueFor(s.courseCode),
                       }}>
                    <strong>{sectionKey(s)}</strong>
                    <br />{formatTime(m.start)}-{formatTime(m.end)}
                    <br />{s.room}
                  </div>
                ))
            )}
          </div>
        ))}
      </div>
      {tba.length > 0 && (
        <p>No fixed meeting time: {tba.map(sectionKey).join(", ")}</p>
      )}
    </div>
  );
}
