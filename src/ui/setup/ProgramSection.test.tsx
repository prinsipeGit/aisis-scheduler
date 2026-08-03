import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProgramSection } from "./ProgramSection";
import type { ProgramSummary } from "../../lib/types";

const programs: ProgramSummary[] = [
  { id: "AB-EU-24BE", code: "AB EU", name: "EUROPEAN STUDIES", version: "24BE", versionYear: 2024, versionLabel: "2024 · BE" },
  { id: "AB-EU-20IR", code: "AB EU", name: "EUROPEAN STUDIES", version: "20IR", versionYear: 2020, versionLabel: "2020 · IR" },
  { id: "BS-CS-2024", code: "BS CS", name: "BACHELOR OF SCIENCE IN COMPUTER SCIENCE", version: "2024", versionYear: 2024, versionLabel: "2024" },
];

afterEach(cleanup);

describe("ProgramSection", () => {
  it("shows the version label so same-code tracks are distinguishable", () => {
    render(<ProgramSection programs={programs} selectedId="" onSelect={() => {}} />);
    expect(screen.getByRole("option", { name: /2024 · BE/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /2020 · IR/ })).toBeTruthy();
  });

  it("never renders the string 'undefined' — the version_label regression", () => {
    const { container } = render(<ProgramSection programs={programs} selectedId="" onSelect={() => {}} />);
    expect(container.textContent).not.toContain("undefined");
  });

  it("filters by search text across code, name and label", () => {
    render(<ProgramSection programs={programs} selectedId="" onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "computer" } });
    expect(screen.queryByRole("option", { name: /EUROPEAN/ })).toBeNull();
    expect(screen.getByRole("option", { name: /COMPUTER SCIENCE/ })).toBeTruthy();
  });

  it("reports the chosen id", () => {
    const onSelect = vi.fn();
    render(<ProgramSection programs={programs} selectedId="" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText(/program/i), { target: { value: "BS-CS-2024" } });
    expect(onSelect).toHaveBeenCalledWith("BS-CS-2024");
  });
});
