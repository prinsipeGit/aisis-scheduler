import type { CSSProperties } from "react";
import type { Day, Schedule } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import { subjectPrefix } from "../../lib/course-code";
import { lastNames } from "../../lib/profs";
import { formatTime } from "../../lib/time";

const WEEKDAYS: Day[] = ["M", "T", "W", "TH", "F"];
const WEEKEND: Day[] = ["SAT", "SUN"];
const PX_PER_MIN = 0.8;
const HEADER = 28;
const DEPTS = 8;

// Keyed on the SUBJECT, not the whole code: every MATH section shares one tint, so the colour
// tells the student which department a block belongs to instead of decorating it.
//
// Assigned by alphabetical position among the subjects *this* schedule actually contains, rather
// than by hashing the subject into a fixed bucket. Hashing was the obvious approach and it was
// wrong: with six buckets and a hash nobody chose, PHILO and CSCI both landed on the same green,
// so the one comparison the colour exists to serve — telling two blocks in the same week apart —
// was the comparison it failed. Position guarantees that a schedule of up to eight subjects gets
// eight different tints, and sorting keeps it stable as the student pages through candidates,
// which all draw on the same course list.
function deptPalette(subjects: string[]): Map<string, { background: string; color: string }> {
  const ordered = [...new Set(subjects)].sort();
  return new Map(ordered.map((subject, i) => {
    const n = (i % DEPTS) + 1;
    return [subject, { background: `var(--dept-${n})`, color: `var(--dept-${n}-ink)` }];
  }));
}

export function WeekGrid({ schedule, changed }: { schedule: Schedule; changed?: Set<string> }) {
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
  const tints = deptPalette(schedule.map((s) => subjectPrefix(s.courseCode)));

  // The hour rules are drawn by CSS from these two values, so they stay aligned with the
  // blocks whatever bounds the data produces.
  const gridVars = {
    "--hour": `${60 * PX_PER_MIN}px`,
    "--head": `${HEADER}px`,
    // 66px: wide enough for "12:00 PM" set in mono on one line, plus the gutter to the column.
    // 104px: wide enough for the longest section codes in the catalog ("MATH 101.6 UV1") without
    // truncating. A clipped code is worse than a narrower grid — dropping the trailing letter off
    // "MATH 62.1 A" leaves a string that still looks like a section code and is the wrong one.
    gridTemplateColumns: `66px repeat(${days.length}, minmax(104px, 1fr))`,
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
            {schedule.flatMap((s) => {
              // Surname only. The block is one column of a five-column week — there is room for one
              // word per line, and the surname is the part a student actually recognises and says.
              const profs = lastNames(s.instructors);
              const who = profs.length > 1 ? `${profs[0]} +${profs.length - 1}` : profs[0];
              return s.meetings
                .filter((m) => m.days.includes(day))
                .map((m, i) => {
                  const when = `${formatTime(m.start)}-${formatTime(m.end)}`;
                  return (
                  <div key={`${sectionKey(s)}-${day}-${i}`}
                       className={changed?.has(sectionKey(s)) ? "block is-changed" : "block"}
                       // Short meetings clip their lower lines by design (see .block in index.css),
                       // so the block carries the whole truth in its tooltip.
                       title={[sectionKey(s), when, profs.join(", "), s.room].filter(Boolean).join(" · ")}
                       style={{
                         top: HEADER + (m.start - start) * PX_PER_MIN,
                         height: (m.end - m.start) * PX_PER_MIN,
                         ...tints.get(subjectPrefix(s.courseCode)),
                       }}>
                    <strong>{sectionKey(s)}</strong>
                    <span className="block-when">{when}</span>
                    {who && <span className="block-prof">{who}</span>}
                    {s.room && <span className="block-room">{s.room}</span>}
                  </div>
                  );
                });
            })}
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
