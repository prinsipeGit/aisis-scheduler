import type { RankedSchedule } from "../../lib/ranker";
import type { Day } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import { formatTime } from "../../lib/time";

interface Props {
  ranked: RankedSchedule[];
  index: number;
  onPick: (i: number) => void;
}

const daysOnCampus = (r: RankedSchedule): number => {
  const days = new Set<Day>();
  for (const s of r.schedule) for (const m of s.meetings) for (const d of m.days) days.add(d);
  return days.size;
};

// The span of a teaching day, earliest class to latest. Candidates that tie on days and on
// start time still usually differ here, which is what makes the row worth reading.
const daySpan = (r: RankedSchedule): { start: number; end: number } | null => {
  const meetings = r.schedule.flatMap((s) => s.meetings);
  if (meetings.length === 0) return null;
  return {
    start: Math.min(...meetings.map((m) => m.start)),
    end: Math.max(...meetings.map((m) => m.end)),
  };
};

export function CandidateList({ ranked, index, onPick }: Props) {
  if (ranked.length === 0) return <p className="hint">Schedules appear here.</p>;

  // A stale index (e.g. after the candidate set shrinks) must not select outside the list —
  // the same clamp the Stage applies before indexing into `ranked` (see stage/Stage.tsx).
  const current = Math.max(0, Math.min(index, ranked.length - 1));

  return (
    <ol className="candidate-list">
      {ranked.map((r, i) => {
        const days = daysOnCampus(r);
        const span = daySpan(r);
        const percent = Math.round(r.score * 100);
        const isCurrent = i === current;

        // `score` is the top ranking criterion, min-max normalized across the schedules on
        // screen right now (lib/ranker.ts) — a within-set relative position, not an absolute
        // match quality. Sorting happens before normalizing, so row 0 always reads 100% and the
        // last row always reads 0%, even when the real spread is a single minute; when the top
        // criterion ties across the whole set every row reads 100% too.
        //
        // Which is why the number is not printed on every row: 500 rows each stating "100%"
        // told the student nothing and drowned out the facts that DO differ. It is drawn as a
        // relative bar instead — equal bars are the truth when the criterion ties — while the
        // full qualified sentence, in the same framing the Pager uses, stays in the row's
        // accessible name so the number never appears anywhere stripped of its qualifier.
        const label =
          `#${i + 1} — ${percent}% toward the best of this set, on your top preference` +
          ` — ${days} ${days === 1 ? "day" : "days"} on campus` +
          (span !== null ? `, ${formatTime(span.start)} to ${formatTime(span.end)}` : "") +
          (isCurrent ? " — showing now" : "");

        return (
          <li key={`${i}-${r.schedule.map(sectionKey).join("|")}`}>
            <button
              type="button"
              aria-current={isCurrent ? "true" : undefined}
              onClick={() => onPick(i)}
            >
              <span className="sr-only">{label}</span>
              <span className="cand-top" aria-hidden="true">
                <span className="cand-rank">#{i + 1}</span>
                <span className="cand-facts">
                  {days}{days === 1 ? " day" : " days"}
                  {span !== null && <> · {formatTime(span.start)}&ndash;{formatTime(span.end)}</>}
                </span>
              </span>
              <span className="cand-bar" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
