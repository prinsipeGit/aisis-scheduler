import type { Day, ProfRating, Preferences, RankCriterion, Schedule } from "./types";
import { sectionKey } from "./types";
import { ratingFor } from "./profs";

export interface RankedSchedule {
  schedule: Schedule;
  score: number;
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
function rawMetric(
  schedule: Schedule,
  criterion: RankCriterion,
  ratings: Map<string, ProfRating>
): number {
  const byDay = intervalsByDay(schedule);
  switch (criterion) {
    case "compactDays": {
      let gaps = 0;
      for (const list of byDay.values()) {
        list.sort((a, b) => a.start - b.start);
        for (let i = 1; i < list.length; i++) {
          gaps += Math.max(0, list[i].start - list[i - 1].end);
        }
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
      const scores = schedule.map((s) => ratingFor(s.instructor, ratings)?.rating ?? 3);
      return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 3;
    }
  }
}

const scheduleId = (s: Schedule): string => s.map(sectionKey).sort().join("|");

export function rank(
  schedules: Schedule[],
  prefs: Preferences,
  ratings: Map<string, ProfRating>
): RankedSchedule[] {
  const criteria: RankCriterion[] = prefs.criteria.length > 0 ? prefs.criteria : ["compactDays"];
  const metrics = schedules.map((schedule) =>
    criteria.map((c) => rawMetric(schedule, c, ratings))
  );
  const mins = criteria.map((_, i) => Math.min(...metrics.map((row) => row[i])));
  const maxs = criteria.map((_, i) => Math.max(...metrics.map((row) => row[i])));

  const ranked = schedules.map((schedule, idx) => {
    let score = 0;
    criteria.forEach((_, i) => {
      const spread = maxs[i] - mins[i];
      const normalized = spread === 0 ? 0.5 : (metrics[idx][i] - mins[i]) / spread;
      score += normalized / 2 ** i;
    });
    return { schedule, score };
  });

  return ranked.sort(
    (a, b) => b.score - a.score || scheduleId(a.schedule).localeCompare(scheduleId(b.schedule))
  );
}
