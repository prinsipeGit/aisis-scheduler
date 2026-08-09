import type { Day, Schedule } from "../../lib/types";
import { formatTime } from "../../lib/time";

export interface ScheduleMeta {
  program: string;
  block: string;
  term: string;
}

const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT"];
const W = 1000;
const OUTPUT_SCALE = 2;
const PAD = 32;
const GRID_TOP = 58;
const GRID_H = 700;
const COURSE_PALETTE = [
  { fill: "#e6f4f1", ink: "#0a6659" },
  { fill: "#e8eef8", ink: "#174f96" },
  { fill: "#f0ebfa", ink: "#6541a5" },
  { fill: "#f7eee5", ink: "#855016" },
  { fill: "#edf2e8", ink: "#4e6b31" },
  { fill: "#f4eaf1", ink: "#7b456b" },
] as const;

function paletteFor(courseCode: string): (typeof COURSE_PALETTE)[number] {
  let hash = 0;
  for (let i = 0; i < courseCode.length; i++) hash = (hash * 31 + courseCode.charCodeAt(i)) >>> 0;
  return COURSE_PALETTE[hash % COURSE_PALETTE.length];
}

// jsdom's canvas stub either has no measureText or ignores its argument, so width lookups must
// never throw and must degrade to *some* bound rather than silently permitting overflow. A flat
// per-character estimate is a safe fallback: it still clamps, just less precisely than a real
// canvas would.
function textWidth(ctx: CanvasRenderingContext2D, text: string): number {
  if (typeof ctx.measureText !== "function") return text.length * 7;
  const measured = ctx.measureText(text)?.width;
  return typeof measured === "number" && Number.isFinite(measured) ? measured : text.length * 7;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (textWidth(ctx, text) <= maxWidth) return text;
  const ELLIPSIS = "…";
  if (textWidth(ctx, ELLIPSIS) > maxWidth) return "";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(ctx, text.slice(0, mid) + ELLIPSIS) <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, lo) + ELLIPSIS;
}

// Bounds the day/time + room text to the column's available width. Time is prioritized over
// room: an MWF section with a long room string drops or truncates the room first, and only
// truncates the time itself if it doesn't fit even with the room gone entirely - the meeting
// time is one of the four fields this image exists to carry into AISIS, the room is secondary.
export function fitDayTimeRoom(ctx: CanvasRenderingContext2D, when: string, room: string, maxWidth: number): string {
  const sep = "   ";
  const full = room ? `${when}${sep}${room}` : when;
  if (textWidth(ctx, full) <= maxWidth) return full;
  if (textWidth(ctx, when) >= maxWidth) return ellipsize(ctx, when, maxWidth);
  const roomBudget = maxWidth - textWidth(ctx, when + sep);
  const fittedRoom = room ? ellipsize(ctx, room, roomBudget) : "";
  return fittedRoom ? `${when}${sep}${fittedRoom}` : when;
}

// Rendered with the Canvas 2D API rather than a DOM-to-image library: the grid geometry is
// simple, and this adds no dependency (§11.3).
export function renderScheduleImage(
  schedule: Schedule, _meta: ScheduleMeta, canvas: HTMLCanvasElement
): string {
  const height = GRID_TOP + GRID_H + 58;
  // Draw in logical pixels but store twice as many physical pixels. The resulting PNG remains
  // the same shape while text and one-pixel rules stay sharp on Retina screens and in shares.
  canvas.width = W * OUTPUT_SCALE;
  canvas.height = height * OUTPUT_SCALE;
  const ctx = canvas.getContext("2d")!;
  if (typeof ctx.scale === "function") ctx.scale(OUTPUT_SCALE, OUTPUT_SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, height);

  const timed = schedule.flatMap((s) => s.meetings);
  // Fit the vertical range to this schedule instead of forcing 7 AM-9 PM. Round outward to full
  // hours so the first and last blocks have breathing room and the axis remains easy to scan.
  const start = timed.length
    ? Math.floor(Math.min(...timed.map((m) => m.start)) / 60) * 60
    : 480;
  const end = timed.length
    ? Math.ceil(Math.max(...timed.map((m) => m.end)) / 60) * 60
    : 1020;
  const perMin = GRID_H / Math.max(1, end - start);
  const visibleDays = schedule.some((s) => s.meetings.some((m) => m.days.includes("SAT")))
    ? DAYS
    : DAYS.slice(0, 5);
  const colW = (W - PAD * 2 - 58) / visibleDays.length;

  // Timetable frame and weekday header.
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(PAD + 58, GRID_TOP - 34, W - PAD * 2 - 58, 34);
  ctx.strokeStyle = "#cacacb";
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD + 58, GRID_TOP - 34, W - PAD * 2 - 58, GRID_H + 34);

  ctx.font = "500 11px Inter, sans-serif";
  visibleDays.forEach((day, i) => {
    const x = PAD + 58 + i * colW;
    ctx.fillStyle = "#39393b";
    ctx.textAlign = "center";
    ctx.fillText(day, x + colW / 2, GRID_TOP - 13);
    if (i > 0) {
      ctx.strokeStyle = "#e5e5e5";
      ctx.beginPath();
      ctx.moveTo(x, GRID_TOP - 34);
      ctx.lineTo(x, GRID_TOP + GRID_H);
      ctx.stroke();
    }
  });
  ctx.textAlign = "left";
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) {
    const y = GRID_TOP + (m - start) * perMin;
    ctx.strokeStyle = "#e5e5e5";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD + 58, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    ctx.font = "400 10px Inter, sans-serif";
    ctx.fillStyle = "#707072";
    ctx.fillText(formatTime(m), PAD, y + 4);
  }

  for (const s of schedule) {
    for (const meeting of s.meetings) {
      for (const day of meeting.days) {
        const i = visibleDays.indexOf(day);
        if (i < 0) continue;
        const x = PAD + 58 + i * colW;
        const y = GRID_TOP + (meeting.start - start) * perMin;
        const h = (meeting.end - meeting.start) * perMin;
        const palette = paletteFor(s.courseCode);
        ctx.fillStyle = palette.fill;
        ctx.fillRect(x + 3, y + 2, colW - 6, Math.max(2, h - 4));
        ctx.fillStyle = palette.ink;
        ctx.fillRect(x + 3, y + 2, 4, Math.max(2, h - 4));
        const textX = x + 12;
        const maxTextW = colW - 20;
        ctx.font = "500 10px Inter, sans-serif";
        ctx.fillText(ellipsize(ctx, `${s.courseCode} ${s.sectionCode}`, maxTextW), textX, y + 17);
        if (h >= 34) {
          ctx.font = "400 9px Inter, sans-serif";
          ctx.fillText(
            ellipsize(ctx, `${formatTime(meeting.start)}-${formatTime(meeting.end)}`, maxTextW),
            textX, y + 30
          );
        }
        if (h >= 48 && s.instructors.length > 0) {
          ctx.fillText(ellipsize(ctx, s.instructors.join(", "), maxTextW), textX, y + 43);
        }
        if (h >= 62 && s.room) {
          ctx.fillText(ellipsize(ctx, s.room, maxTextW), textX, y + 56);
        }
      }
    }
  }

  // Small signature only—the exported artifact is the timetable itself, not a second UI.
  ctx.textAlign = "right";
  ctx.font = "400 17px 'Bebas Neue', 'Arial Narrow', sans-serif";
  ctx.fillStyle = "#707072";
  ctx.fillText("SCHED.RIV", W - PAD, height - 20);
  ctx.textAlign = "left";

  return canvas.toDataURL("image/png");
}

export function downloadScheduleImage(schedule: Schedule, meta: ScheduleMeta): void {
  // Keep rendering and clicking inside the original button gesture. Awaiting font readiness or
  // canvas.toBlob() here causes privacy-focused browsers to treat the later click as unsolicited
  // and block it. By the time a generated schedule exists, the app's bundled fonts are loaded.
  const canvas = document.createElement("canvas");
  const url = renderScheduleImage(schedule, meta, canvas);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sched-riv-${meta.term || "schedule"}.png`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
