// REAL AISIS DATA captured 2026-07-21 from the public classSkeds.do page
// (MATHEMATICS department, term 2026-1). Cells are per-<td> textContent.
export const REAL_ROWS: string[][] = [
  ["MATH 1.1", "C", "PREPARATION FOR COLLEGE MATHEMATICS I", "3", "M-TH 1100-1230(FULLY ONSITE)", "SEC-A215", "ABERIN, MARIA ALVA Q.", "ENG", "U", "-"],
  ["MATH 10", "A1", "MATHEMATICS IN THE MODERN WORLD", "3", "M-TH 0800-0930(FULLY ONSITE)", "SEC-A215", "GARCIA, MARK LESTER B.", "ENG", "U", "-"],
  ["MATH 10", "A3", "MATHEMATICS IN THE MODERN WORLD", "3", "M-TH 0800-0930(FULLY ONSITE)", "SEC-A117", "TOMENES, Mark", "ENG", "U", "1 SLOT(S) FOR CROSS REG-IXS MAJORS."],
  ["MATH 10", "B2", "MATHEMATICS IN THE MODERN WORLD", "3", "M-TH 0930-1100(FULLY ONSITE)", "CTC 506", "DE LOS SANTOS, Kurt Anthony, MIJARES, Jim Ralphealo", "ENG", "U", "-"],
  ["MATH 10", "C1", "MATHEMATICS IN THE MODERN WORLD", "3", "M-TH 1100-1230(FULLY ONSITE)", "SEC-A302A", "FLORES, Richell Isaiah, TOMENES, Mark", "ENG", "U", "-"],
];

// Synthetic rows covering shapes not present in the captured sample.
export const EDGE_ROWS: string[][] = [
  // TBA time
  ["NSTP 11", "A", "NATIONAL SERVICE TRAINING PROGRAM 11", "3", "TBA", "TBA", "TBA", "FIL", "U", "-"],
  // lecture + lab split across two meetings
  ["PHYS 23.02", "D", "UNIVERSITY PHYSICS I, LABORATORY", "2", "M 1000-1100/SAT 0900-1200(FULLY ONSITE)", "SEC B105", "REYES, PEDRO", "ENG", "U", "-"],
  // online modality
  ["MATH 51.1", "X", "DISCRETE MATHEMATICS I", "3", "T-F 1300-1430(ONLINE)", "ONLINE", "SANTOS, ANA", "ENG", "U", "-"],
  // unparseable time → imported as TBA-like with a warning
  ["THEO 11", "A", "FAITH, SPIRITUALITY, AND THE CHURCH", "3", "M-TH 25:00-2600(FULLY ONSITE)", "CTC 201", "CRUZ, JOSE", "ENG", "U", "-"],
  // too few columns → skipped with a warning
  ["JUNK ROW"],
  // REAL case from the 2026-1 scrape: tutorial rows have a non-day token and 0000-0000.
  ["BIO 290", "ZZZ", "GRADUATE TUTORIAL", "3", "TUTORIAL 0000-0000(FULLY ONSITE)", "TBA", "TBA", "ENG", "G", "~"],
];
