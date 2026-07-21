// Extract data rows from the AISIS class-schedule HTML as arrays of cell text.
// Deliberately dependency-free: AISIS markup is plain server-rendered tables.
const MIN_COLUMNS = 10;

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function cellText(cellHtml) {
  // <br> joins with no space: "M-TH 0800-0930<br>(FULLY ONSITE)" → "M-TH 0800-0930(FULLY ONSITE)"
  return decodeEntities(cellHtml.replace(/<br\s*\/?>/gi, "").replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function extractRows(html) {
  const rows = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));
    if (cells.length >= MIN_COLUMNS) rows.push(cells);
  }
  return rows;
}
