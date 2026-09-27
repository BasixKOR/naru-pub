/** @jest-environment node */
import { describe, test, expect } from "@jest/globals";
import {
  assertNoPathTraversal,
  assertPlainFilename,
  MAX_PATH_LENGTH,
} from "../file-paths";

describe("assertNoPathTraversal", () => {
  test.each([
    "",
    "index.html",
    "dir/",
    "dir/sub/file.html",
    "dir/.hidden",
    "dir/file.min.js",
    "한글/파일.html",
    "a".repeat(MAX_PATH_LENGTH),
  ])("accepts %j", (path) => {
    expect(() => assertNoPathTraversal(path)).not.toThrow();
  });

  test.each([
    "..",
    "../other/file.html",
    "dir/../../other",
    "dir/..",
    "file..html",
    "/",
    "/index.html",
    "//dir",
    ".",
    "./file.html",
    "dir/./file.html",
    "dir/.",
    "a".repeat(MAX_PATH_LENGTH + 1),
  ])("rejects %j", (path) => {
    expect(() => assertNoPathTraversal(path)).toThrow();
  });

  test.each([undefined, null, 1, {}, ["../x"]])(
    "rejects non-string %j",
    (path) => {
      expect(() => assertNoPathTraversal(path)).toThrow("Invalid path.");
    },
  );
});

describe("assertPlainFilename", () => {
  test.each(["index.html", ".hidden", "file.min.js"])("accepts %j", (name) => {
    expect(() => assertPlainFilename(name)).not.toThrow();
  });

  test.each(["dir/file.html", "file.html/", "../file.html", "/file.html", "."])(
    "rejects %j",
    (name) => {
      expect(() => assertPlainFilename(name)).toThrow();
    },
  );
});
