import { useEffect, useRef } from "react";
import { sameCourseCode } from "../../lib/course-code";
import { overlaps } from "../../lib/time";
import type { Schedule, Section, UserState } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import type { ResolvedSlot } from "../../lib/slots";
import { formatTime } from "../../lib/time";

interface Props {
  selected: Section;
  schedule: Schedule;
  resolved: ResolvedSlot[];
  state: UserState;
  onChange: (state: UserState) => void;
  onClose: () => void;
}

export function sectionConflicts(candidate: Section, schedule: Schedule, replacing: Section): Section[] {
  return schedule.filter((other) => {
    if (sectionKey(other) === sectionKey(replacing)) return false;
    return candidate.meetings.some((a) => other.meetings.some((b) => overlaps(a, b)));
  });
}

const meetingText = (section: Section) => section.meetings.length === 0
  ? "Time TBA"
  : section.meetings
      .map((m) => `${m.days.join("/")} ${formatTime(m.start)}–${formatTime(m.end)}`)
      .join(" · ");

export function SectionSwitcher({ selected, schedule, resolved, state, onChange, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const owner = resolved.find((slot) =>
    slot.allSections.some((section) => sectionKey(section) === sectionKey(selected)));
  const alternatives = (owner?.allSections ?? [])
    .filter((section) => sameCourseCode(section.courseCode, selected.courseCode))
    .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const choose = (section: Section) => {
    if (!owner) return;
    const ownerKeys = new Set(owner.allSections.map(sectionKey));
    const key = sectionKey(section);
    onChange({
      ...state,
      lockedSections: [...state.lockedSections.filter((locked) => !ownerKeys.has(locked)), key],
      fullSections: state.fullSections.filter((full) => full !== key),
      preferences: {
        ...state.preferences,
        excludedSections: state.preferences.excludedSections.filter((excluded) => excluded !== key),
      },
    });
    onClose();
  };

  return (
    <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog section-switcher" role="dialog" aria-modal="true"
           aria-labelledby="section-switcher-title" ref={panel} tabIndex={-1}>
        <header className="dialog-head">
          <div>
            <h2 id="section-switcher-title">{selected.courseCode}</h2>
            <p className="hint">Choose another section. Your other classes stay fixed.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close section options" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="dialog-body section-options">
          {!owner && <p className="banner">No matching course slot was found.</p>}
          {owner && alternatives.map((section) => {
            const key = sectionKey(section);
            const conflicts = sectionConflicts(section, schedule, selected);
            const current = key === sectionKey(selected);
            const invalidTime = section.timeStatus === "parse-error";
            return (
              <article key={key} className={current ? "section-option is-current" : "section-option"}>
                <div className="section-option-main">
                  <div className="section-option-code">
                    <strong>{section.sectionCode}</strong>
                    {current && <span className="section-option-status">Current</span>}
                  </div>
                  <p>{meetingText(section)}</p>
                  <p className="hint">
                    {section.instructors.length > 0 ? section.instructors.join(", ") : "Professor TBA"}
                    {section.room ? ` · ${section.room}` : ""}
                  </p>
                  {conflicts.length > 0 && (
                    <div className="section-conflict" role="status">
                      <strong>Conflicts with:</strong>
                      <ul>
                        {conflicts.map((conflict) => (
                          <li key={sectionKey(conflict)}>
                            {sectionKey(conflict)} — {meetingText(conflict)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {invalidTime && <p className="section-conflict">This section has an unreadable meeting time.</p>}
                </div>
                <button type="button" className={current ? "" : "btn-primary"}
                        disabled={current || conflicts.length > 0 || invalidTime}
                        onClick={() => choose(section)}>
                  {current ? "Selected" : conflicts.length > 0 ? "Blocked" : "Choose"}
                </button>
              </article>
            );
          })}
        </div>
        <footer className="dialog-foot">
          <p className="hint">Choosing a section locks it and regenerates your schedules.</p>
          <button type="button" onClick={onClose}>Cancel</button>
        </footer>
      </div>
    </div>
  );
}
