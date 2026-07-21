import { describe, it, expect } from "vitest";
import { extractRows } from "./extract-rows.mjs";

const HTML = `
<html><body>
<table>
  <tr><th>Subject Code</th><th>Section</th><th>Course Title</th><th>Units</th><th>Time</th>
      <th>Room</th><th>Instructor</th><th>Lang</th><th>Level</th><th>Remarks</th></tr>
  <tr><td>MATH 10</td><td>A1</td><td>MATHEMATICS IN THE MODERN WORLD</td><td>3</td>
      <td>M-TH 0800-0930<br>(FULLY ONSITE)</td><td>SEC-A215</td>
      <td>GARCIA, MARK LESTER B.</td><td>ENG</td><td>U</td><td>-</td></tr>
</table>
<table><tr><td>nav</td><td>junk</td></tr></table>
</body></html>`;

describe("extractRows", () => {
  it("returns one array of cell strings per data row", () => {
    const rows = extractRows(HTML);
    expect(rows).toHaveLength(1);
    expect(rows[0][0]).toBe("MATH 10");
    expect(rows[0][6]).toBe("GARCIA, MARK LESTER B.");
  });
  it("joins a <br> inside the time cell without inserting whitespace", () => {
    expect(extractRows(HTML)[0][4]).toBe("M-TH 0800-0930(FULLY ONSITE)");
  });
  it("ignores tables whose rows have too few columns", () => {
    expect(extractRows(HTML).every((r) => r.length >= 10)).toBe(true);
  });
  it("returns an empty array when there is no schedule table", () => {
    expect(extractRows("<html><body><p>nothing</p></body></html>")).toEqual([]);
  });
});
