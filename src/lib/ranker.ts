import type { Day, Preferences, ProfRating, RankCriterion, Schedule } from "./types";
import { sectionKey } from "./types";
import { ratingFor } from "./profs";

export interface RankedSchedule {
  schedule: Schedule;
  score: number; // display only — ordering is lexicographic, not by this number
}

type DayIntervals = Map<Day, { start: number; end: number }[]>;

function intervalsByDay(schedule: Schedule): DayIntervals {
  const byDay: DayIntervals = new Map();
  for (const section of schedule) {
    for (const meeting of section.meetings) {
      for (const day of meeting.days) {
        const list = byDay.get(day) ?? [];
        list.push({ start: meeting.start, end: meeting.end });
        byDay.set(day, list);
      }
    }
  }
  return byDay;
}

// Raw metric per criterion. Sign convention: HIGHER is always BETTER.
function rawMetric(schedule: Schedule, criterion: RankCriterion, ratings: Map<string, ProfRating>): number {
  const byDay = intervalsByDay(schedule);
  switch (criterion) {
    case "compactDays": {
      let gaps = 0;
      for (const list of byDay.values()) {
        list.sort((a, b) => a.start - b.start);
        for (let i = 1; i < list.length; i++) gaps += Math.max(0, list[i].start - list[i - 1].end);
      }
      return -gaps;
    }
    case "fewestDays":
      return -byDay.size;
    case "lateStart": {
      const starts = [...byDay.values()].map((l) => Math.min(...l.map((x) => x.start)));
      return starts.length ? starts.reduce((a, b) => a + b, 0) / starts.length : 0;
    }
    case "earlyEnd": {
      const ends = [...byDay.values()].map((l) => Math.max(...l.map((x) => x.end)));
      return ends.length ? -(ends.reduce((a, b) => a + b, 0) / ends.length) : 0;
    }
    case "preferredProfs": {
      // Average across sections; within a section, average across instructors.
      // Unrated scores neutral (3 on the 0-5 scale). Scaled so a whole-number rounding
      // does not erase differences of less than one star.
      const scores = schedule.map((s) => {
        if (s.instructors.length === 0) return 3;
        const perProf = s.instructors.map((name) => ratingFor(name, ratings, s.courseCode)?.rating ?? 3);
        return perProf.reduce((a, b) => a + b, 0) / perProf.length;
      });
      const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 3;
      return mean * 60;
    }
    default:
      return 0;
  }
}

const scheduleId = (s: Schedule): string => s.map(sectionKey).sort().join("|");

export function rank(
  schedules: Schedule[], prefs: Preferences, ratings: Map<string, ProfRating>
): RankedSchedule[] {
  const criteria: RankCriterion[] = prefs.criteria.length > 0 ? prefs.criteria : ["compactDays"];

  // Metrics are floats (gap minutes, mean start times). Rounding to the whole minute is what
  // makes "tie" meaningful — without it criterion 2 would almost never get to speak (§7).
  const rows = schedules.map((schedule) => ({
    schedule,
    metrics: criteria.map((c) => Math.round(rawMetric(schedule, c, ratings))),
    id: scheduleId(schedule),
  }));

  rows.sort((a, b) => {
    for (let i = 0; i < criteria.length; i++) {
      const diff = b.metrics[i] - a.metrics[i]; // higher is better
      if (diff !== 0) return diff;
    }
    return a.id.localeCompare(b.id); // deterministic final tiebreak
  });

  // Display score across ALL criteria, not just the first.
  //
  // Scoring only metrics[0] made the number useless in the common case: when the top criterion
  // ties across the whole set — and `compactDays` ties constantly — every candidate scored 1,
  // so 500 rows all read "100%" and the list looked static even though later criteria ranked
  // them genuinely apart.
  //
  // Each criterion is normalised across the set, then combined with weights that decay by 3, so
  // a lower-priority criterion can still separate candidates that tie on everything above it.
  //
  // Weight decay alone does NOT guarantee the composite agrees with the lexicographic order:
  // (1.0, 0.0) outranks (0.9, 1.0) on the first criterion, yet scores lower once the second is
  // added (1.0 vs 1.233). The decay only dominates when the gap at the deciding criterion is
  // large, and gaps here can be arbitrarily small. So the composite is run through a cumulative
  // minimum afterwards: the score may never rise as rank falls. Where the raw composite would
  // have contradicted the order, the candidate is capped at the one above it and the two read as
  // equal — which is the honest outcome, since the ordering, not the composite, is the truth.
  const normalised = criteria.map((_, i) => {
    const values = rows.map((r) => r.metrics[i]);
    const min = Math.min(...values);
    const spread = Math.max(...values) - min;
    // A criterion nobody varies on contributes equally to everyone, so it cannot reorder.
    return (v: number) => (spread === 0 ? 1 : (v - min) / spread);
  });

  const raw = rows.map((r) =>
    r.metrics.reduce((sum, m, i) => sum + normalised[i](m) * Math.pow(3, -i), 0)
  );
  // rows is already in rank order, so a running minimum is all the clamp needs to be.
  const composites: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    composites.push(i === 0 ? raw[0] : Math.min(raw[i], composites[i - 1]));
  }
  const lo = composites[composites.length - 1] ?? 0;
  const hi = composites[0] ?? 0;
  const range = hi - lo;

  return rows.map((r, i) => ({
    schedule: r.schedule,
    // Still a within-set relative position — the best of what is on screen scores 1, the worst
    // scores 0 — but now it reflects every preference the student ordered, so two candidates
    // that differ only on a lower-priority criterion no longer read as identical.
    score: range === 0 ? 1 : (composites[i] - lo) / range,
  }));
}
