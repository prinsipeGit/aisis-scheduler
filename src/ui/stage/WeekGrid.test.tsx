import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WeekGrid } from "./WeekGrid";
import type { Schedule, Section } from "../../lib/types";

const section = (code: string, days: Section["meetings"][number]["days"], start: number, end: number): Section => ({
  courseCode: code, sectionCode: "1", title: code, units: 3, instructors: [], modality: "",
  meetings: [{ days, start, end }], timeStatus: "scheduled", room: "R1", remarks: "", raw: "",
});

afterEach(cleanup);

describe("WeekGrid", () => {
  it("renders a block per meeting day", () => {
    const schedule: Schedule = [section("MATH 10", ["M", "W"], 480, 540)];
    render(<WeekGrid schedule={schedule} />);
    expect(screen.getAllByText(/MATH 10/)).toHaveLength(2);
  });

  it("extends past 9 PM when the data does, instead of clipping", () => {
    // ITMGT 20.51 QRF really does run F 1830-2130 in the 2026-1 catalog.
    const late: Schedule = [section("ITMGT 20.51", ["F"], 1110, 1290)];
    const { container } = render(<WeekGrid schedule={late} />);
    const block = container.querySelector(".block") as HTMLElement;
    const column = container.querySelector(".day-col") as HTMLElement;
    const blockBottom = parseFloat(block.style.top) + parseFloat(block.style.height);
    expect(blockBottom).toBeLessThanOrEqual(parseFloat(column.style.height));
  });

  it("lists sections with no fixed meeting time separately", () => {
    const tba: Schedule = [{ ...section("BIO 290", ["M"], 0, 0), meetings: [], timeStatus: "tba" }];
    render(<WeekGrid schedule={tba} />);
    // toHaveTextContent is a jest-dom matcher; this project has no jest-dom dependency or
    // vitest setupFiles registering it (confirmed: not in package.json, not in node_modules,
    // no setup file anywhere in the repo — see task-13-report.md). Same assertion, plain chai.
    expect(screen.getByText(/no fixed meeting time/i).textContent).toContain("BIO 290");
  });

  it("gives a course the same colour in every schedule it appears in", () => {
    const a = render(<WeekGrid schedule={[section("MATH 10", ["M"], 480, 540)]} />);
    const first = (a.container.querySelector(".block") as HTMLElement).style.background;
    cleanup();
    const b = render(<WeekGrid schedule={[section("ZZZZ 1", ["M"], 600, 660), section("MATH 10", ["T"], 480, 540)]} />);
    const blocks = [...b.container.querySelectorAll(".block")] as HTMLElement[];
    const math = blocks.find((el) => el.textContent?.includes("MATH 10"))!;
    expect(math.style.background).toBe(first);
  });
});
