import type { RankedSchedule } from "../../lib/ranker";
import type { Day } from "../../lib/types";
import { sectionKey } from "../../lib/types";

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

export function CandidateList({ ranked, index, onPick }: Props) {
  if (ranked.length === 0) return <p className="hint">Schedules appear here.</p>;

  // A stale index (e.g. after the candidate set shrinks) must not select outside the list —
  // the same clamp the Stage applies before indexing into `ranked` (see stage/Stage.tsx).
  const current = Math.max(0, Math.min(index, ranked.length - 1));

  return (
    <ol className="candidate-list">
      {ranked.map((r, i) => {
        const days = daysOnCampus(r);
        const percent = Math.round(r.score * 100);
        // `score` is the top ranking criterion, min-max normalized across the schedules on
        // screen right now (lib/ranker.ts) — a within-set relative position, not an absolute
        // match quality. Sorting happens before normalizing, so row 0 always reads 100% and the
        // last row always reads 0%, even when the real spread is a single minute; when the top
        // criterion ties across the whole set every row reads 100% too. So the number must never
        // stand alone: it is always attached to the rank position, in the same relative framing
        // the Pager uses (stage/Pager.tsx: "toward the best of this set, on your top
        // preference"), so the two on-screen components never contradict each other.
        const isCurrent = i === current;
        // aria-current covers assistive tech, but a sighted student needs a cue that does not
        // rely on colour alone (the .current class has no rule in index.css yet, and adding one
        // is out of scope here) — so the current row also says so in plain text.
        const label =
          `#${i + 1} — ${percent}% toward the best of this set, on your top preference` +
          ` — ${days} ${days === 1 ? "day" : "days"} on campus` +
          (isCurrent ? " — showing now" : "");
        return (
          <li key={`${i}-${r.schedule.map(sectionKey).join("|")}`}>
            <button
              type="button"
              aria-current={isCurrent ? "true" : undefined}
              className={isCurrent ? "current" : ""}
              onClick={() => onPick(i)}
            >
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
