import assert from "node:assert/strict";
import test from "node:test";

import {
  displayRef,
  githubWorkflowYaml,
} from "../src/lib/deploy/githubWorkflow.ts";

test("generates a branch workflow with concurrency protection", () => {
  const yaml = githubWorkflowYaml("eyecntct", {
    githubRef: "refs/heads/main",
    targetPrefix: "/",
  });

  assert.match(yaml, /branches: \["main"\]/);
  assert.match(yaml, /group: "naru-eyecntct-refs-heads-main"/);
  assert.match(yaml, /cancel-in-progress: true/);
  assert.match(yaml, /actions\/checkout@v5/);
  assert.match(yaml, /site: "eyecntct"/);
  assert.match(yaml, /target: "\/"/);
});

test("uses a tags trigger for tag refs", () => {
  const yaml = githubWorkflowYaml("site", {
    githubRef: "refs/tags/v1.2.3",
    targetPrefix: "/docs",
  });

  assert.match(yaml, /tags: \["v1\.2\.3"\]/);
  assert.doesNotMatch(yaml, /branches:/);
  assert.match(yaml, /target: "\/docs"/);
  assert.equal(displayRef("refs/tags/v1.2.3"), "v1.2.3");
});

test("escapes values embedded in YAML", () => {
  const yaml = githubWorkflowYaml('site"name', {
    githubRef: 'refs/heads/release"next',
    targetPrefix: '/docs"preview',
  });

  assert.match(yaml, /branches: \["release\\"next"\]/);
  assert.match(yaml, /site: "site\\"name"/);
  assert.match(yaml, /target: "\/docs\\"preview"/);
});
