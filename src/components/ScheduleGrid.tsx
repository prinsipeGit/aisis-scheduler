import type { Day, Schedule } from "../lib/types";
import { sectionKey } from "../lib/types";
import { formatTime } from "../lib/time";

const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT"];
const DAY_START = 420; // 7:00 AM
const DAY_END = 1260;  // 9:00 PM
const PX_PER_MIN = 0.8;

export function ScheduleGrid({ schedule }: { schedule: Schedule }) {
  const tba = schedule.filter((s) => s.meetings.length === 0);
  return (
    <div>
      <div className="grid">
        {DAYS.map((day) => (
          <div key={day} className="day-col" style={{ height: (DAY_END - DAY_START) * PX_PER_MIN }}>
            <div className="day-label">{day}</div>
            {schedule.flatMap((s) =>
              s.meetings
                .filter((meeting) => meeting.days.includes(day))
                .map((meeting, i) => (
                  <div
                    key={`${sectionKey(s)}-${i}`}
                    className="block"
                    style={{
                      top: (meeting.start - DAY_START) * PX_PER_MIN,
                      height: (meeting.end - meeting.start) * PX_PER_MIN,
                    }}
                  >
                    <strong>{sectionKey(s)}</strong>
                    <br />
                    {formatTime(meeting.start)}–{formatTime(meeting.end)}
                    <br />
                    {s.room}
                  </div>
                ))
            )}
          </div>
        ))}
      </div>
      {tba.length > 0 && <p>No fixed schedule (TBA): {tba.map(sectionKey).join(", ")}</p>}
    </div>
  );
}
