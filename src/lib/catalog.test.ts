import { describe, it, expect } from "vitest";
import { getCatalog, getCommunityRatings, isStale } from "./catalog";

describe("catalog data layer", () => {
  it("returns the bundled catalog with sections", () => {
    const catalog = getCatalog();
    expect(catalog.semester).toBe("2026-1");
    expect(catalog.sections.length).toBeGreaterThan(0);
    expect(catalog.sections[0].courseCode).toBe("PHILO 11");
  });

  it("returns community ratings", () => {
    expect(getCommunityRatings().length).toBeGreaterThan(0);
  });

  it("isStale is false within 30 days, true after", () => {
    const catalog = { ...getCatalog(), exportedAt: "2026-07-01T00:00:00.000Z" };
    expect(isStale(catalog, new Date("2026-07-20T00:00:00.000Z"))).toBe(false);
    expect(isStale(catalog, new Date("2026-08-05T00:00:00.000Z"))).toBe(true);
  });
});
