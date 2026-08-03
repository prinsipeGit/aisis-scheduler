import type { UserState } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import { formatTime } from "../../lib/time";
import type { ResolvedSlot } from "../../lib/slots";

interface Props {
  resolved: ResolvedSlot[];
  state: UserState;
  onChange: (s: UserState) => void;
}

const describeSection = (s: ResolvedSlot["allSections"][number]): string => {
  const when = s.meetings.length === 0
    ? "no fixed time"
    : s.meetings.map((m) => `${m.days.join("")} ${formatTime(m.start)}-${formatTime(m.end)}`).join(", ");
  return `${s.sectionCode} - ${when}`;
};

export function AlreadyHaveSection({ resolved, state, onChange }: Props) {
  const rows = resolved.filter((r) => r.slot.included && r.allSections.length > 0);
  // Pre-assigned first: those are the ones the student must supply (§5.6).
  const ordered = [...rows].sort(
    (a, b) => Number(b.status === "awaiting-section") - Number(a.status === "awaiting-section")
  );

  if (ordered.length === 0) return <p>Pick your courses first.</p>;

  // Only this slot's own pin is replaced. Filtering by allSections membership instead would
  // drop a neighbour's pin whenever the two slots accept the same codes (PFT3 and PFT4
  // share all 23 PATHFit activities).
  const pin = (r: ResolvedSlot, key: string) => {
    const others = state.lockedSections.filter((k) => k !== r.pinned);
    onChange({ ...state, lockedSections: key ? [...others, key] : others });
  };

  return (
    <div>
      <p className="hint">
        If a class was assigned to you, or you already secured a section, set it here and the
        rest of your schedule is planned around it.
      </p>
      <ul className="course-list">
        {ordered.map((r) => (
          <li key={r.slot.id}>
            <label>
              <span>{r.slot.chosen ?? r.slot.label}</span>{" "}
              <select aria-label={`Section for ${r.slot.label}`} value={r.pinned ?? ""}
                      onChange={(e) => pin(r, e.target.value)}>
                <option value="">- not set -</option>
                {r.allSections.map((s) => (
                  <option key={sectionKey(s)} value={sectionKey(s)}>{describeSection(s)}</option>
                ))}
              </select>
            </label>
            {r.status === "awaiting-section" && (
              <em> Pre-assigned - enter the section you were given.</em>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
