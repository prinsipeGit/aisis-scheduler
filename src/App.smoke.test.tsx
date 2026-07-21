import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("smoke: pick courses → generate → mark full → re-rank", () => {
  it("runs the whole flow on the bundled catalog", () => {
    render(<App />);

    // Pick two courses that have compatible sections in the placeholder catalog.
    fireEvent.click(screen.getByLabelText(/PHILO 11/));
    fireEvent.click(screen.getByLabelText(/CSCI 30/));

    // Generate: Results tab shows ranked schedules.
    fireEvent.click(screen.getByRole("button", { name: "Results" }));
    expect(screen.getByText(/valid schedule\(s\), best first/)).toBeTruthy();
    const before = screen.getByText(/valid schedule\(s\), best first/).textContent!;

    // Mark the first listed section full → instant re-rank with fewer schedules.
    fireEvent.click(screen.getAllByRole("button", { name: "Mark full" })[0]);
    const after = screen.getByText(/valid schedule\(s\), best first/).textContent!;
    expect(after).not.toBe(before);

    // State persisted to localStorage.
    const stored = JSON.parse(localStorage.getItem("aisis-scheduler-state")!);
    expect(stored.fullSections).toHaveLength(1);
    expect(stored.chosenCourses).toEqual(["PHILO 11", "CSCI 30"]);
  });
});
