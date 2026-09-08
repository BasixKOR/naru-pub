type GitHubWorkflowTarget = {
  githubRef: string;
  targetPrefix: string;
};

export function displayRef(ref: string) {
  if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length);
  if (ref.startsWith("refs/tags/")) return ref.slice("refs/tags/".length);
  return ref;
}

export function normalizeWorkflowTargetPrefix(targetPrefix: string) {
  const trimmed = targetPrefix.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function yamlString(value: string) {
  return JSON.stringify(value);
}

export function githubWorkflowYaml(
  loginName: string,
  target: GitHubWorkflowTarget,
) {
  const refName = displayRef(target.githubRef);
  const trigger = target.githubRef.startsWith("refs/tags/")
    ? `tags: [${yamlString(refName)}]`
    : `branches: [${yamlString(refName)}]`;
  const concurrencyRef = target.githubRef.replace(/[^A-Za-z0-9_.-]+/g, "-");

  return `name: Deploy to Naru

on:
  push:
    ${trigger}
  workflow_dispatch:

permissions:
  contents: read
  id-token: write

concurrency:
  group: ${yamlString(`naru-${loginName}-${concurrencyRef}`)}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: naru-pub/actions/deploy@v1
        with:
          site: ${yamlString(loginName)}
          dir: "public"
          target: ${yamlString(normalizeWorkflowTargetPrefix(target.targetPrefix))}
`;
}
