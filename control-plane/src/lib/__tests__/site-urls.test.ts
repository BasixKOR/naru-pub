import { describe, expect, it } from "@jest/globals";

import { collapseSlashes, getUserObjectKey } from "../site-urls";

describe("collapseSlashes", () => {
  it("leaves single slashes alone", () => {
    expect(collapseSlashes("a/b/c.html")).toBe("a/b/c.html");
    expect(collapseSlashes("")).toBe("");
  });

  it("collapses runs of any length to one slash", () => {
    expect(collapseSlashes("a//b")).toBe("a/b");
    expect(collapseSlashes("a///b")).toBe("a/b");
    expect(collapseSlashes("a////b")).toBe("a/b");
    expect(collapseSlashes("bincat////invalid///path////xxe.txt")).toBe(
      "bincat/invalid/path/xxe.txt",
    );
  });

  it("collapses leading and trailing runs", () => {
    expect(collapseSlashes("///a/")).toBe("/a/");
    expect(collapseSlashes("a///")).toBe("a/");
  });

  it("is idempotent", () => {
    const once = collapseSlashes("a/////b//c");
    expect(collapseSlashes(once)).toBe(once);
  });
});

describe("getUserObjectKey", () => {
  it("joins the home directory and the path", () => {
    expect(getUserObjectKey("alice", "index.html")).toBe("alice/index.html");
    expect(getUserObjectKey("alice", "dir/page.html")).toBe(
      "alice/dir/page.html",
    );
  });

  it("does not double the separator for leading or empty segments", () => {
    expect(getUserObjectKey("alice", "/index.html")).toBe("alice/index.html");
    expect(getUserObjectKey("alice", "//trav.txt")).toBe("alice/trav.txt");
    expect(getUserObjectKey("alice", "/dir/index.html")).toBe(
      "alice/dir/index.html",
    );
  });

  it("gives the same key however many slashes the path carries", () => {
    const keys = ["a/b.txt", "a//b.txt", "a///b.txt", "/a////b.txt"].map(
      (path) => getUserObjectKey("alice", path),
    );
    expect(new Set(keys)).toEqual(new Set(["alice/a/b.txt"]));
  });

  it("always stays under the home directory prefix", () => {
    for (const path of ["", "/", "///", "x", "////x///"]) {
      expect(getUserObjectKey("alice", path).startsWith("alice/")).toBe(true);
    }
  });
});
