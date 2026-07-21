import type { Day, Schedule } from "../lib/types";
import { sectionKey } from "../lib/types";
import { formatTime } from "../lib/time";

const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT", "SUN"];
const DAY_START = 420; // 7:00 AM
const DAY_END = 1260;  // 9:00 PM
const PX_PER_MIN = 0.8;
const HEADER_HEIGHT = 28;
const TIME_LABELS = Array.from({ length: 8 }, (_, i) => DAY_START + i * 120);

export function ScheduleGrid({ schedule }: { schedule: Schedule }) {
  const tba = schedule.filter((s) => s.meetings.length === 0);
  return (
    <div className="schedule-grid-scroll" role="region" aria-label="Weekly schedule" tabIndex={0}>
      <div className="grid">
        <div className="time-axis" aria-hidden="true" style={{ height: (DAY_END - DAY_START) * PX_PER_MIN + HEADER_HEIGHT }}>
          {TIME_LABELS.map((minutes) => (
            <span key={minutes} style={{ top: HEADER_HEIGHT + (minutes - DAY_START) * PX_PER_MIN }}>
              {formatTime(minutes)}
            </span>
          ))}
        </div>
        {DAYS.map((day) => (
          <div key={day} className="day-col" style={{ height: (DAY_END - DAY_START) * PX_PER_MIN + HEADER_HEIGHT }}>
            <div className="day-label">{day}</div>
            {schedule.flatMap((s) =>
              s.meetings
                .filter((meeting) => meeting.days.includes(day))
                .map((meeting, i) => (
                  <div
                    key={`${sectionKey(s)}-${i}`}
                    className="block"
                    style={{
                      top: HEADER_HEIGHT + (meeting.start - DAY_START) * PX_PER_MIN,
                      height: (meeting.end - meeting.start) * PX_PER_MIN,
                    }}
                  >
                    <strong>{sectionKey(s)}</strong>
                    <br />
                    {formatTime(meeting.start)}–{formatTime(meeting.end)}
                    <br />
                    {s.room}
                    {s.modality && s.modality !== "FULLY ONSITE" ? (
                      <>
                        <br />
                        {s.modality}
                      </>
                    ) : null}
                  </div>
                ))
            )}
          </div>
        ))}
      </div>
      {tba.length > 0 && <p>No fixed meeting time: {tba.map(sectionKey).join(", ")}</p>}
    </div>
  );
}
