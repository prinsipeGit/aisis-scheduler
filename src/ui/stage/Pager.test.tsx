import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Pager } from "./Pager";

afterEach(cleanup);

describe("Pager", () => {
  it("shows a 1-based position and announces it politely", () => {
    render(<Pager index={1} count={41} score={0.91} onIndex={() => {}} />);
    const live = screen.getByRole("status");
    expect(live.textContent).toMatch(/2 of 41/);
  });

  it("shows the score in the visible row, attached to the rank position", () => {
    const { container } = render(<Pager index={1} count={41} score={0.91} onIndex={() => {}} />);
    const visible = container.querySelector(".pager-count");
    expect(visible?.textContent).toMatch(/2/);
    expect(visible?.textContent).toMatch(/41/);
    expect(visible?.textContent).toMatch(/91%/);
    // Not only tucked into the .sr-only live region — a sighted student must see it too.
    const nodes = screen.getAllByText(/91%/);
    const outsideSrOnly = nodes.some((n) => !n.closest(".sr-only"));
    expect(outsideSrOnly).toBe(true);
  });

  it("disables previous at the start and next at the end, with no wraparound", () => {
    const { rerender } = render(<Pager index={0} count={3} score={1} onIndex={() => {}} />);
    expect((screen.getByRole("button", { name: /previous/i }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<Pager index={2} count={3} score={1} onIndex={() => {}} />);
    expect((screen.getByRole("button", { name: /next/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("steps with the arrow keys", () => {
    const onIndex = vi.fn();
    render(<Pager index={1} count={3} score={1} onIndex={onIndex} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndex).toHaveBeenCalledWith(2);
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndex).toHaveBeenCalledWith(0);
  });

  it("ignores arrow keys while a text field has focus", () => {
    const onIndex = vi.fn();
    render(<><input data-testid="field" /><Pager index={1} count={3} score={1} onIndex={onIndex} /></>);
    screen.getByTestId("field").focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onIndex).not.toHaveBeenCalled();
  });
});
