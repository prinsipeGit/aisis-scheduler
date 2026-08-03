import type { Schedule, UserState } from "../../lib/types";
import { sectionKey } from "../../lib/types";

interface Props {
  schedule: Schedule;
  state: UserState;
  onChange: (s: UserState) => void;
}

export function SectionChips({ schedule, state, onChange }: Props) {
  const toggle = (field: "lockedSections" | "fullSections", key: string) => {
    const list = state[field];
    onChange({
      ...state,
      [field]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
    });
  };

  const exclude = (key: string) =>
    onChange({
      ...state,
      preferences: {
        ...state.preferences,
        excludedSections: state.preferences.excludedSections.includes(key)
          ? state.preferences.excludedSections
          : [...state.preferences.excludedSections, key],
      },
    });

  return (
    <ul className="chips">
      {schedule.map((s) => {
        const key = sectionKey(s);
        return (
          <li key={key} className="chip" data-locked={state.lockedSections.includes(key)}>
            {/* The code shown is the one THIS candidate used: a PHILO 11 slot may be
                .03 here and .05 in the next candidate (§11). It leads the row, in mono,
                because it is the string the student retypes into AISIS. */}
            <span className="chip-code">{key}</span>{" "}
            <span className="chip-who">{s.instructors.length > 0 ? s.instructors.join(", ") : "TBA"}</span>
            {s.modality && <span className="chip-flag">{s.modality}</span>}
            {s.meetings.length === 0 && <span className="chip-flag">time TBA</span>}{" "}
            <span className="chip-actions">
              <button type="button" onClick={() => toggle("lockedSections", key)}>
                {state.lockedSections.includes(key) ? "Unlock" : "Lock"}
              </button>{" "}
              <button type="button" onClick={() => toggle("fullSections", key)}>
                {state.fullSections.includes(key) ? "Unmark full" : "Mark full"}
              </button>{" "}
              <button type="button" onClick={() => exclude(key)}>Exclude</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
