import type { Catalog, Day, Meeting, ProfRating, RankCriterion, UserState } from "../lib/types";
import { formatTime } from "../lib/time";

const CRITERIA: { id: RankCriterion; label: string }[] = [
  { id: "compactDays", label: "Compact days (fewest gaps)" },
  { id: "fewestDays", label: "Fewest days on campus" },
  { id: "lateStart", label: "Later starts" },
  { id: "earlyEnd", label: "Earlier ends" },
  { id: "preferredProfs", label: "Preferred professors" },
];
const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT"];
const HOURS = Array.from({ length: 15 }, (_, i) => 420 + i * 60); // 7:00 AM – 9:00 PM

interface Props {
  catalog: Catalog;
  state: UserState;
  onChange: (s: UserState) => void;
}

export function PreferencesPanel({ catalog, state, onChange }: Props) {
  const prefs = state.preferences;
  const setPrefs = (p: Partial<UserState["preferences"]>) =>
    onChange({ ...state, preferences: { ...prefs, ...p } });

  const toggleCriterion = (id: RankCriterion) =>
    setPrefs({
      criteria: prefs.criteria.includes(id)
        ? prefs.criteria.filter((c) => c !== id)
        : [...prefs.criteria, id],
    });

  const setBlock = (i: number, block: Meeting) =>
    setPrefs({ protectedBlocks: prefs.protectedBlocks.map((b, j) => (j === i ? block : b)) });

  const instructors = [
    ...new Set(
      catalog.sections
        .filter((s) => state.chosenCourses.includes(s.courseCode) && s.instructor && s.instructor !== "TBA")
        .map((s) => s.instructor)
    ),
  ].sort();

  const setRating = (name: string, value: string) => {
    const others = state.personalRatings.filter((r) => r.name !== name);
    const rating = Number(value);
    onChange({
      ...state,
      personalRatings:
        rating >= 1 && rating <= 5
          ? [...others, { name, rating: rating as ProfRating["rating"] }]
          : others,
    });
  };

  const timeSelect = (value: number | undefined, set: (v: number | undefined) => void) => (
    <select
      value={value ?? ""}
      onChange={(e) => set(e.target.value === "" ? undefined : Number(e.target.value))}
    >
      <option value="">any time</option>
      {HOURS.map((h) => (
        <option key={h} value={h}>{formatTime(h)}</option>
      ))}
    </select>
  );

  return (
    <section>
      <h2>Ranking criteria (priority = order checked)</h2>
      <ul>
        {CRITERIA.map(({ id, label }) => {
          const pos = prefs.criteria.indexOf(id);
          return (
            <li key={id}>
              <label>
                <input type="checkbox" checked={pos >= 0} onChange={() => toggleCriterion(id)} />{" "}
                {label}
                {pos >= 0 ? ` — priority ${pos + 1}` : ""}
              </label>
            </li>
          );
        })}
      </ul>

      <h2>Time limits</h2>
      <label>No classes before {timeSelect(prefs.earliestStart, (v) => setPrefs({ earliestStart: v }))}</label>{" "}
      <label>No classes after {timeSelect(prefs.latestEnd, (v) => setPrefs({ latestEnd: v }))}</label>

      <h2>Protected time blocks</h2>
      {prefs.protectedBlocks.map((block, i) => (
        <div key={i}>
          <select
            value={block.days[0]}
            onChange={(e) => setBlock(i, { ...block, days: [e.target.value as Day] })}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select value={block.start} onChange={(e) => setBlock(i, { ...block, start: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{formatTime(h)}</option>
            ))}
          </select>
          {" – "}
          <select value={block.end} onChange={(e) => setBlock(i, { ...block, end: Number(e.target.value) })}>
            {HOURS.map((h) => (
              <option key={h} value={h}>{formatTime(h)}</option>
            ))}
          </select>{" "}
          <button onClick={() => setPrefs({ protectedBlocks: prefs.protectedBlocks.filter((_, j) => j !== i) })}>
            Remove
          </button>
        </div>
      ))}
      <button onClick={() => setPrefs({ protectedBlocks: [...prefs.protectedBlocks, { days: ["M"], start: 720, end: 780 }] })}>
        Add protected block
      </button>

      <h2>My professor ratings</h2>
      {instructors.length === 0 && <p>Pick courses first to rate their professors.</p>}
      <ul>
        {instructors.map((name) => (
          <li key={name}>
            <label>
              {name}{" "}
              <select
                value={state.personalRatings.find((r) => r.name === name)?.rating ?? ""}
                onChange={(e) => setRating(name, e.target.value)}
              >
                <option value="">unrated</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
