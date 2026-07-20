import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImportPage } from "./ImportPage";
import { AISIS_SAMPLE, AISIS_SAMPLE_WITH_BAD_ROWS } from "../lib/fixtures/aisis-sample";
import type { Catalog } from "../lib/types";

const catalog: Catalog = { semester: "2026-1", exportedAt: "2026-07-20T00:00:00.000Z", warnings: [], sections: [] };

afterEach(cleanup);

describe("ImportPage", () => {
  it("parses pasted AISIS text and reports counts", () => {
    render(<ImportPage catalog={catalog} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: AISIS_SAMPLE } });
    fireEvent.click(screen.getByText("Parse"));
    expect(screen.getByText(/7 section\(s\) parsed, 0 warning\(s\)/)).toBeTruthy();
  });

  it("surfaces warnings for bad rows", () => {
    render(<ImportPage catalog={catalog} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: AISIS_SAMPLE_WITH_BAD_ROWS } });
    fireEvent.click(screen.getByText("Parse"));
    expect(screen.getByText(/2 warning\(s\)/)).toBeTruthy();
    expect(screen.getByText(/Skipped row/)).toBeTruthy();
  });

  it("download button is disabled until something parses", () => {
    render(<ImportPage catalog={catalog} />);
    const download = screen.getByText("Download merged catalog JSON") as HTMLButtonElement;
    expect(download.disabled).toBe(true);
  });
});
