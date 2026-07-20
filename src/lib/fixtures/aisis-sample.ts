// PLACEHOLDER FIXTURE — best-guess AISIS class-schedule table format.
// Replace with a REAL copied AISIS table when available (spec §12 open item 1).
// Columns: Subject Code | Section | Course Title | Units | Time | Room | Instructor
//          | Max No. | Lang | Level | Free Slots | Remarks
export const AISIS_SAMPLE = [
  "Subject Code\tSection\tCourse Title\tUnits\tTime\tRoom\tInstructor\tMax No.\tLang\tLevel\tFree Slots\tRemarks",
  "PHILO 11\tA\tPHILOSOPHY OF THE HUMAN PERSON I\t3\tM-TH 0800-0930\tCTC 102\tGARCIA, JUAN\t35\tENG\tU\t12\t",
  "PHILO 11\tB\tPHILOSOPHY OF THE HUMAN PERSON I\t3\tT-F 1100-1230\tCTC 105\tSANTOS, ANA\t35\tENG\tU\t3\t",
  "CSCI 30\tA\tDATA STRUCTURES AND ALGORITHMS\t3\tM-TH 0930-1100\tCTC 118\tSY, MARIA\t30\tENG\tU\t0\t",
  "CSCI 30\tB2\tDATA STRUCTURES AND ALGORITHMS\t3\tT-F 1300-1430\tCTC 118\tSY, MARIA\t30\tENG\tU\t8\t",
  "MATH 31.1\tC\tCALCULUS LAB\t1\tW 1400-1700\tSEC A201\tTBA\t25\tENG\tU\t5\t",
  "PHYS 72.1\tD\tPHYSICS LAB\t1\tM 1000-1100/SAT 0900-1200\tSEC B105\tREYES, PEDRO\t20\tENG\tU\t3\tLEC+LAB",
  "NSTP 11\tA\tCWTS STREAM\t(3)\tTBA\tTBA\tTBA\t50\tFIL\tU\t50\t",
].join("\n");

// Deliberately malformed rows for warning-path tests.
export const AISIS_SAMPLE_WITH_BAD_ROWS =
  AISIS_SAMPLE +
  "\n" +
  [
    "THEO 11\tA\tFOUNDATIONS OF THEOLOGY\t3\tM-TH 25:00-2600\tCTC 201\tCRUZ, JOSE\t35\tENG\tU\t9\t",
    "not a real row at all",
  ].join("\n");
