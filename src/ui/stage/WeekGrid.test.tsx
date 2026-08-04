import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WeekGrid } from "./WeekGrid";
import type { Schedule, Section } from "../../lib/types";

const section = (code: string, days: Section["meetings"][number]["days"], start: number, end: number): Section => ({
  courseCode: code, sectionCode: "1", title: code, units: 3, instructors: [], modality: "",
  meetings: [{ days, start, end }], timeStatus: "scheduled", room: "R1", remarks: "", raw: "",
});

// The department fill rides on a custom property rather than on `background`, because the CSS
// derives the module's edge and the glow on its code from the same value. Reading `.style.background`
// here would return "" for every block and quietly pass whatever the implementation did.
const gasOf = (el: Element) => {
  const gas = (el as HTMLElement).style.getPropertyValue("--gas");
  if (!gas) throw new Error("block has no --gas custom property");
  return gas;
};

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

  it("names the professor on the block by surname alone", () => {
    const s: Schedule = [{ ...section("MATH 10", ["M"], 480, 600), instructors: ["DE GUZMAN, Ivan Adrian"] }];
    const { container } = render(<WeekGrid schedule={s} />);
    expect(container.querySelector(".block-prof")?.textContent).toBe("De Guzman");
  });

  it("counts the rest rather than listing a team-taught roster it has no room for", () => {
    const s: Schedule = [{
      ...section("MATH 10", ["M"], 480, 600),
      instructors: ["CRUZ, RONALD ALLAN L.", "ELICANO, ANTONIO RAFAEL N."],
    }];
    const { container } = render(<WeekGrid schedule={s} />);
    expect(container.querySelector(".block-prof")?.textContent).toBe("Cruz +1");
  });

  it("keeps the whole truth in the block's tooltip, since short blocks clip", () => {
    const s: Schedule = [{ ...section("MATH 10", ["M"], 480, 510), instructors: ["CRUZ, Ana"] }];
    const { container } = render(<WeekGrid schedule={s} />);
    expect((container.querySelector(".block") as HTMLElement).title)
      .toBe("1. · MATH 10 1 · 8:00 AM-8:30 AM · Cruz · R1");
  });

  it("says nothing about the professor when the catalog listed none", () => {
    const { container } = render(<WeekGrid schedule={[section("MATH 10", ["M"], 480, 600)]} />);
    expect(container.querySelector(".block-prof")).toBeNull();
  });

  // The course layer: controls numbered in the order the day is actually walked, and a leg drawn
  // in each gap between them. This is the world's signature notation, so it is pinned.
  it("numbers the day's classes in the order they are walked, not array order", () => {
    const s: Schedule = [
      section("CSCI 111", ["M"], 840, 900),   // 2:00 PM — later, but listed first
      section("MATH 10", ["M"], 480, 540),    // 8:00 AM
      section("PHILO 12", ["M"], 660, 720),   // 11:00 AM
    ];
    const { container } = render(<WeekGrid schedule={s} />);
    const blocks = [...container.querySelectorAll(".block")];
    const order = blocks.map((b) => [
      b.querySelector(".control")?.textContent,
      b.querySelector("strong")?.textContent,
    ]);
    expect(order).toEqual([["1", "MATH 10 1"], ["2", "PHILO 12 1"], ["3", "CSCI 111 1"]]);
  });

  it("draws a leg across each gap between consecutive controls", () => {
    const s: Schedule = [
      section("MATH 10", ["M"], 480, 540),   // ends 9:00
      section("PHILO 12", ["M"], 660, 720),  // starts 11:00 — a two-hour gap
    ];
    const { container } = render(<WeekGrid schedule={s} />);
    const legs = [...container.querySelectorAll(".leg")] as HTMLElement[];
    expect(legs).toHaveLength(1);
    // 120 minutes of gap at 0.8px/min.
    expect(parseFloat(legs[0].style.height)).toBeCloseTo(96, 5);
  });

  it("draws no leg between back-to-back classes", () => {
    const s: Schedule = [
      section("MATH 10", ["M"], 480, 540),
      section("PHILO 12", ["M"], 540, 600),
    ];
    const { container } = render(<WeekGrid schedule={s} />);
    expect(container.querySelectorAll(".leg")).toHaveLength(0);
  });

  // The whole point of the tint is telling two blocks in the same week apart, which the old
  // hash-into-six-buckets scheme did not guarantee: PHILO and CSCI both landed on the same green.
  it("gives every subject in one schedule a different tint", () => {
    const s: Schedule = [
      section("PHILO 12", ["M"], 480, 540),
      section("CSCI 111", ["T"], 480, 540),
      section("MATH 10", ["W"], 480, 540),
      section("ENGL 11", ["TH"], 480, 540),
    ];
    const { container } = render(<WeekGrid schedule={s} />);
    const tints = [...container.querySelectorAll(".block")].map((el) => gasOf(el));
    expect(new Set(tints).size).toBe(4);
  });

  it("gives two courses from one department the same tint", () => {
    const s: Schedule = [section("MATH 10", ["M"], 480, 540), section("MATH 21", ["T"], 480, 540)];
    const { container } = render(<WeekGrid schedule={s} />);
    const [a, b] = [...container.querySelectorAll(".block")].map((el) => gasOf(el));
    expect(a).toBe(b);
  });

  it("gives a course the same colour in every schedule it appears in", () => {
    const a = render(<WeekGrid schedule={[section("MATH 10", ["M"], 480, 540)]} />);
    const first = gasOf(a.container.querySelector(".block")!);
    cleanup();
    const b = render(<WeekGrid schedule={[section("ZZZZ 1", ["M"], 600, 660), section("MATH 10", ["T"], 480, 540)]} />);
    const blocks = [...b.container.querySelectorAll(".block")] as HTMLElement[];
    const math = blocks.find((el) => el.textContent?.includes("MATH 10"))!;
    expect(gasOf(math)).toBe(first);
  });
});
