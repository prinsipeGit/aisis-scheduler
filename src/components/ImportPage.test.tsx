import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ImportPage } from "./ImportPage";
import { AISIS_SAMPLE, AISIS_SAMPLE_WITH_BAD_ROWS } from "../lib/fixtures/aisis-sample";
import type { Catalog, Section } from "../lib/types";

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

  it("download merges pasted sections over the catalog by sectionKey", async () => {
    const existing: Section = {
      courseCode: "PHILO 11", sectionCode: "A", title: "OLD TITLE", units: 3,
      instructor: "OLD, PROF", meetings: [], room: "OLD", remarks: "", raw: "",
    };
    const catalogWithExisting: Catalog = { ...catalog, sections: [existing] };
    let captured: Blob | null = null;
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = ((blob: Blob) => {
      captured = blob;
      return "blob:mock";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      render(<ImportPage catalog={catalogWithExisting} />);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: AISIS_SAMPLE } });
      fireEvent.click(screen.getByText("Parse"));
      fireEvent.click(screen.getByText("Download merged catalog JSON"));
      expect(captured).not.toBeNull();
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(captured!);
      });
      const json = JSON.parse(text);
      expect(json.semester).toBe("2026-1");
      expect(json.sections).toHaveLength(7);
      const philoA = json.sections.find(
        (s: Section) => s.courseCode === "PHILO 11" && s.sectionCode === "A"
      );
      expect(philoA.title).toBe("PHILOSOPHY OF THE HUMAN PERSON I");
      expect(new Date(json.exportedAt).getTime()).toBeGreaterThan(0);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });
});
