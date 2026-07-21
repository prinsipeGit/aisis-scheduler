/**
 * AISIS catalog export snippet.
 *
 * HOW TO USE (maintainer only, once per semester):
 *   1. Log into AISIS in your browser and open the Class Schedule page.
 *   2. Open DevTools (F12) → Console, paste this entire file, press Enter.
 *   3. Wait for the loop to finish; a .txt file downloads automatically.
 *   4. Open the app's Import tab, paste the .txt contents, download the
 *      merged catalog JSON, and commit it to src/data/.
 *
 * The snippet runs inside YOUR logged-in session. It stores no credentials,
 * sends nothing anywhere, and fetches each department once with a delay.
 *
 * !! CONFIG values are BEST-GUESS — verify against live AISIS before first
 * !! use and update them if the page structure differs (spec §12).
 */
(async () => {
  const CONFIG = {
    schedulePath: "/j_aisis/J_VCSC.do", // Class Schedule action — VERIFY on live AISIS
    deptSelectName: "deptCode",         // department <select> name — VERIFY on live AISIS
    delayMs: 1500,                      // politeness delay between department fetches
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const parseHTML = (html) => new DOMParser().parseFromString(html, "text/html");

  const firstPage = parseHTML(await (await fetch(CONFIG.schedulePath)).text());
  const select = firstPage.querySelector(`select[name="${CONFIG.deptSelectName}"]`);
  if (!select) {
    alert(
      "AISIS export: department dropdown not found.\n" +
        "AISIS layout may have changed — update CONFIG in tools/aisis-export.js,\n" +
        "or fall back to copy-pasting department tables into the Import tab."
    );
    return;
  }

  const depts = [...select.options].map((o) => o.value).filter(Boolean);
  const lines = [];
  for (const dept of depts) {
    try {
      const body = new URLSearchParams({ [CONFIG.deptSelectName]: dept });
      const res = await fetch(CONFIG.schedulePath, { method: "POST", body });
      if (!res.ok) {
        console.warn(`AISIS export: ${dept} skipped — HTTP ${res.status}`);
        continue;
      }
      const page = parseHTML(await res.text());
      for (const row of page.querySelectorAll("table tr")) {
        const cells = [...row.querySelectorAll("td")].map((c) => c.textContent.trim());
        if (cells.length >= 7) lines.push(cells.join("\t"));
      }
      console.log(`AISIS export: ${dept} done (${lines.length} rows total)`);
    } catch (err) {
      console.warn(`AISIS export: ${dept} skipped — ${err.message ?? err}`);
      continue;
    }
    await sleep(CONFIG.delayMs);
  }

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `aisis-raw-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
  console.log(`AISIS export: finished — ${lines.length} rows downloaded.`);
})();
