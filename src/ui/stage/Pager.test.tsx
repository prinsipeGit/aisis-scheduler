import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Pager } from "./Pager";

afterEach(cleanup);

describe("Pager", () => {
  it("presents the first result as the best schedule", () => {
    render(<Pager index={0} count={41} onIndex={() => {}} />);
    expect(screen.getByText("Best schedule")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Schedule 1 of 41");
  });

  it("shows later results as numbered options without exposing the ranking list", () => {
    render(<Pager index={1} count={41} onIndex={() => {}} />);
    expect(screen.getByText("Schedule option 2")).toBeTruthy();
    expect(screen.queryByText(/of 41/, { selector: ".pager-option" })).toBeNull();
  });

  it("uses Back and Generate another to move deterministically", () => {
    const onIndex = vi.fn();
    render(<Pager index={1} count={3} onIndex={onIndex} />);
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(onIndex).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: /generate another/i }));
    expect(onIndex).toHaveBeenCalledWith(2);
  });

  it("disables Back at the best schedule and reports when no more schedules remain", () => {
    const { rerender } = render(<Pager index={0} count={3} onIndex={() => {}} />);
    expect((screen.getByRole("button", { name: /back/i }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Pager index={2} count={3} onIndex={() => {}} />);
    expect((screen.getByRole("button", { name: /no more schedules/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("steps with the arrow keys", () => {
    const onIndex = vi.fn();
    render(<Pager index={1} count={3} onIndex={onIndex} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenCalledWith(2);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndex).toHaveBeenCalledWith(0);
  });

  it("ignores arrow keys while a text field has focus", () => {
    const onIndex = vi.fn();
    render(<><input data-testid="field" /><Pager index={1} count={3} onIndex={onIndex} /></>);
    screen.getByTestId("field").focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndex).not.toHaveBeenCalled();
  });
});
