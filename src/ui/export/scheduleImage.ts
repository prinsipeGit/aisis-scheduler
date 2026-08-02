import type { Day, Schedule } from "../../lib/types";
import { sectionKey } from "../../lib/types";
import { formatTime } from "../../lib/time";

export interface ScheduleMeta {
  program: string;
  block: string;
  term: string;
}

const DAYS: Day[] = ["M", "T", "W", "TH", "F", "SAT"];
const W = 1000;
const PAD = 24;
const GRID_TOP = 120;
const GRID_H = 460;
const ROW_H = 26;
const HUES = ["#2f6df6", "#f6a23b", "#2fbf8f", "#e15b8d", "#7a5af8", "#22b8cf"];

function hueFor(courseCode: string): string {
  let hash = 0;
  for (let i = 0; i < courseCode.length; i++) hash = (hash * 31 + courseCode.charCodeAt(i)) >>> 0;
  return HUES[hash % HUES.length];
}

// Rendered with the Canvas 2D API rather than a DOM-to-image library: the grid geometry is
// simple, and this adds no dependency (§11.3).
export function renderScheduleImage(
  schedule: Schedule, meta: ScheduleMeta, canvas: HTMLCanvasElement
): string {
  const rows = [...schedule].sort((a, b) => sectionKey(a).localeCompare(sectionKey(b)));
  const height = GRID_TOP + GRID_H + 40 + rows.length * ROW_H + 60;
  canvas.width = W;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, height);

  // Header - a saved image must identify itself.
  ctx.fillStyle = "#1b2233";
  ctx.font = "600 26px Inter, sans-serif";
  ctx.fillText("AISIS Scheduler", PAD, 44);
  ctx.font = "16px Inter, sans-serif";
  ctx.fillStyle = "#8c96aa";
  ctx.fillText(`${meta.program}  ${meta.block}  ${meta.term}`, PAD, 72);

  const timed = schedule.flatMap((s) => s.meetings);
  const start = timed.length ? Math.min(420, ...timed.map((m) => m.start)) : 420;
  const end = timed.length ? Math.max(1260, ...timed.map((m) => m.end)) : 1260;
  const perMin = GRID_H / Math.max(1, end - start);
  const colW = (W - PAD * 2 - 50) / DAYS.length;

  ctx.font = "13px Inter, sans-serif";
  DAYS.forEach((day, i) => {
    ctx.fillStyle = "#8c96aa";
    ctx.fillText(day, PAD + 50 + i * colW + colW / 2 - 8, GRID_TOP - 8);
  });
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) {
    const y = GRID_TOP + (m - start) * perMin;
    ctx.strokeStyle = "#eef1f6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD + 50, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    ctx.fillStyle = "#8c96aa";
    ctx.fillText(formatTime(m), PAD, y + 4);
  }

  for (const s of schedule) {
    for (const meeting of s.meetings) {
      for (const day of meeting.days) {
        const i = DAYS.indexOf(day);
        if (i < 0) continue;
        const x = PAD + 50 + i * colW;
        const y = GRID_TOP + (meeting.start - start) * perMin;
        const h = (meeting.end - meeting.start) * perMin;
        ctx.fillStyle = hueFor(s.courseCode);
        ctx.fillRect(x + 2, y, colW - 4, h);
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 11px Inter, sans-serif";
        ctx.fillText(s.courseCode, x + 6, y + 14);
        ctx.font = "10px Inter, sans-serif";
        ctx.fillText(s.sectionCode, x + 6, y + 26);
      }
    }
  }

  // Section list. The SECTION CODE carries the weight - it is what gets typed into AISIS.
  let y = GRID_TOP + GRID_H + 44;
  ctx.fillStyle = "#1b2233";
  ctx.font = "600 15px Inter, sans-serif";
  ctx.fillText("Enlist these sections", PAD, y);
  y += 24;
  for (const s of rows) {
    ctx.font = "13px Inter, sans-serif";
    ctx.fillStyle = "#1b2233";
    ctx.fillText(s.courseCode, PAD, y);
    ctx.font = "600 15px Inter, sans-serif";
    ctx.fillText(s.sectionCode, PAD + 190, y);
    ctx.font = "12px Inter, sans-serif";
    ctx.fillStyle = "#8c96aa";
    const when = s.meetings.length === 0
      ? "no fixed time"
      : s.meetings.map((m) => `${m.days.join("")} ${formatTime(m.start)}-${formatTime(m.end)}`).join(", ");
    ctx.fillText(`${when}   ${s.room}`, PAD + 360, y);
    y += ROW_H;
  }

  ctx.font = "12px Inter, sans-serif";
  ctx.fillStyle = "#8c96aa";
  ctx.fillText("Unofficial planning tool - always verify your final schedule in AISIS.", PAD, height - 20);

  return canvas.toDataURL("image/png");
}

export async function downloadScheduleImage(schedule: Schedule, meta: ScheduleMeta): Promise<void> {
  // Wait for the self-hosted faces, or the canvas silently falls back to a system font.
  if (typeof document !== "undefined" && "fonts" in document) {
    try { await document.fonts.ready; } catch { /* proceed with whatever is loaded */ }
  }
  const canvas = document.createElement("canvas");
  const url = renderScheduleImage(schedule, meta, canvas);
  const link = document.createElement("a");
  link.href = url;
  link.download = `schedule-${meta.term}.png`;
  link.click();
}
