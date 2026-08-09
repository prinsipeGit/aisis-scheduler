import { useEffect, useRef, useState } from "react";
import type { Schedule } from "../../lib/types";
import { downloadScheduleIcs } from "./calendarIcs";

interface Props {
  schedule: Schedule;
  term: string;
  onClose: () => void;
}

export function CalendarExportDialog({ schedule, term, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const exportCalendar = () => {
    setError("");
    try {
      downloadScheduleIcs(schedule, { startDate, endDate }, term);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <div className="scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog calendar-dialog" role="dialog" aria-modal="true"
           aria-labelledby="calendar-export-title" ref={panel} tabIndex={-1}>
        <header className="dialog-head">
          <div>
            <h2 id="calendar-export-title">Export calendar</h2>
            <p className="hint">Creates weekly events for Apple Calendar, Google Calendar, or Outlook.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close calendar export" onClick={onClose}>
            &times;
          </button>
        </header>
        <div className="dialog-body calendar-range">
          <p className="hint">Use the official first and last day of classes for this semester.</p>
          <label>
            First day of classes
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            Last day of classes
            <input type="date" value={endDate} min={startDate}
                   onChange={(event) => setEndDate(event.target.value)} />
          </label>
          {error && <p className="calendar-error" role="alert">{error}</p>}
        </div>
        <footer className="dialog-foot">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!startDate || !endDate}
                  onClick={exportCalendar}>Download .ics</button>
        </footer>
      </div>
    </div>
  );
}
