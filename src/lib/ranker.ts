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

  // Display score: the top criterion normalised across the candidate set. Ordering is
  // lexicographic, so this is shown, never sorted on.
  const tops = rows.map((r) => r.metrics[0]);
  const min = Math.min(...tops);
  const max = Math.max(...tops);
  const spread = max - min;
  return rows.map((r) => ({
    schedule: r.schedule,
    score: spread === 0 ? 1 : (r.metrics[0] - min) / spread,
  }));
}
