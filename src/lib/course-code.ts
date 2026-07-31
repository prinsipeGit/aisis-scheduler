export function canonicalCourseCode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

export function sameCourseCode(a: string, b: string): boolean {
  return canonicalCourseCode(a) === canonicalCourseCode(b);
}

// The subject a code belongs to: everything before the first space.
// Used to keep a lecture and its lab in the same department (§5.4).
export function subjectPrefix(code: string): string {
  return canonicalCourseCode(code).split(" ")[0];
}
