// Validation for the user-relative paths the file API routes take from the
// client and join onto the user's home directory to build R2 keys. Keys are
// literal, so nothing here resolves `.` or `..`; such paths are refused.

export const MAX_PATH_LENGTH = 1000;

// Accepts "" (the home directory) and trailing slashes ("dir/"), which some
// routes use for directories. Rejects anything that isn't a string, a leading
// "/", any "..", "." segments, and paths over MAX_PATH_LENGTH.
export function assertNoPathTraversal(path: unknown): asserts path is string {
  if (typeof path !== "string") {
    throw new Error("Invalid path.");
  }
  if (path.includes("..")) {
    throw new Error("Path traversal detected in filename.");
  }
  if (path.startsWith("/")) {
    throw new Error("Absolute path detected in filename.");
  }
  if (path.split("/").includes(".")) {
    throw new Error("Relative path segment detected in filename.");
  }
  if (path.length > MAX_PATH_LENGTH) {
    throw new Error("경로가 너무 깁니다.");
  }
}

// A single path segment: a file's own name, with no directory part.
export function assertPlainFilename(name: unknown): asserts name is string {
  assertNoPathTraversal(name);
  if (name.includes("/")) {
    throw new Error("파일명에 '/'를 사용할 수 없습니다.");
  }
}
