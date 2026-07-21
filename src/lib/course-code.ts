export function canonicalCourseCode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

export function sameCourseCode(a: string, b: string): boolean {
  return canonicalCourseCode(a) === canonicalCourseCode(b);
}
