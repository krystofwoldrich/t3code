// @effect-diagnostics nodeBuiltinImport:off - Tests exercise the real git CLI in disposable repositories.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { expect, it } from "vite-plus/test";

const script = NodeURL.fileURLToPath(new URL("./sync-upstream.sh", import.meta.url));

function fixture() {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-upstream-sync-"));
  const origin = NodePath.join(root, "origin.git");
  const upstream = NodePath.join(root, "upstream.git");
  const checkout = NodePath.join(root, "checkout");
  const source = NodePath.join(root, "source");
  const worktree = NodePath.join(root, "maintenance");
  const bin = NodePath.join(root, "bin");
  NodeFS.mkdirSync(bin);
  NodeFS.writeFileSync(
    NodePath.join(bin, "vp"),
    '#!/bin/sh\nif [ "$1" = "${TEST_FAIL_STAGE:-}" ]; then exit 1; fi\n',
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Sync test",
    GIT_AUTHOR_EMAIL: "sync@example.test",
    GIT_COMMITTER_NAME: "Sync test",
    GIT_COMMITTER_EMAIL: "sync@example.test",
  };
  const git = (cwd: string, ...args: string[]) => {
    const result = NodeChildProcess.spawnSync("git", args, { cwd, env, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  };
  git(root, "init", "--bare", "--initial-branch=main", origin);
  git(root, "init", "--bare", "--initial-branch=main", upstream);
  git(root, "init", "--initial-branch=main", checkout);
  git(checkout, "config", `url.${origin}.insteadOf`, "https://github.com/krystofwoldrich/t3code");
  git(checkout, "config", `url.${upstream}.insteadOf`, "https://github.com/pingdotgg/t3code");
  git(checkout, "remote", "add", "origin", "https://github.com/krystofwoldrich/t3code");
  git(checkout, "remote", "add", "upstream", "https://github.com/pingdotgg/t3code");
  NodeFS.writeFileSync(NodePath.join(checkout, "shared.txt"), "base\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "initial");
  git(checkout, "push", "upstream", "main");
  NodeFS.writeFileSync(NodePath.join(checkout, "fork.txt"), "KW customization\n");
  git(checkout, "add", ".");
  git(checkout, "commit", "-m", "fork customization");
  git(checkout, "push", "origin", "main");
  const forkHead = git(checkout, "rev-parse", "HEAD");
  git(checkout, "worktree", "add", "-b", "maintenance", worktree, "main");
  git(root, "clone", upstream, source);

  return {
    origin,
    checkout,
    source,
    worktree,
    forkHead,
    git,
    changeUpstream(file = "upstream.txt", contents = "upstream change\n") {
      NodeFS.writeFileSync(NodePath.join(source, file), contents);
      git(source, "add", ".");
      git(source, "commit", "-m", "upstream change");
      git(source, "push", "origin", "main");
    },
    run(cwd = worktree, failStage = "") {
      return NodeChildProcess.spawnSync("bash", [script], {
        cwd,
        env: { ...env, TEST_FAIL_STAGE: failStage },
        encoding: "utf8",
      });
    },
    [Symbol.dispose]() {
      NodeFS.rmSync(root, { recursive: true, force: true });
    },
  };
}

it("publishes a validated merge while preserving fork edits and the shared checkout", () => {
  using repo = fixture();
  repo.changeUpstream();
  const result = repo.run();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("PUSHED:");
  expect(repo.git(repo.origin, "show", "main:fork.txt")).toBe("KW customization");
  expect(repo.git(repo.origin, "show", "main:upstream.txt")).toBe("upstream change");
  expect(repo.git(repo.checkout, "rev-parse", "HEAD")).toBe(repo.forkHead);
  expect(repo.git(repo.origin, "log", "-1", "--format=%B")).toContain(
    "Co-authored-by: Krystof Woldrich <31292499+krystofwoldrich@users.noreply.github.com>\nCo-authored-by: Codex <noreply@openai.com>",
  );
  const published = repo.git(repo.origin, "rev-parse", "main");
  expect(repo.run().stdout).toContain("UP_TO_DATE:");
  expect(repo.git(repo.origin, "rev-parse", "main")).toBe(published);
});

it("keeps a conflicting upstream merge off remote main", () => {
  using repo = fixture();
  NodeFS.writeFileSync(NodePath.join(repo.worktree, "shared.txt"), "fork version\n");
  repo.git(repo.worktree, "add", ".");
  repo.git(repo.worktree, "commit", "-m", "customize shared file");
  repo.git(repo.worktree, "push", "origin", "HEAD:main");
  const before = repo.git(repo.origin, "rev-parse", "main");
  repo.changeUpstream("shared.txt", "upstream version\n");
  const result = repo.run();
  expect(result.status).toBe(2);
  expect(repo.git(repo.origin, "rev-parse", "main")).toBe(before);
  expect(repo.git(repo.worktree, "diff", "--name-only", "--diff-filter=U")).toBe("shared.txt");
  NodeFS.writeFileSync(NodePath.join(repo.worktree, "shared.txt"), "fork and upstream version\n");
  repo.git(repo.worktree, "add", "shared.txt");
  repo.git(repo.worktree, "commit", "-m", "resolve upstream merge");
  const resumed = repo.run();
  expect(resumed.status, resumed.stderr).toBe(0);
  expect(resumed.stdout).toContain("PUSHED:");
  expect(repo.git(repo.origin, "show", "main:shared.txt")).toBe("fork and upstream version");
});

it.each([
  ["i", "dependency install"],
  ["test", "KW identity tests"],
  ["run", "changed-file checks"],
])("publishes with a reported warning when %s fails", (stage, label) => {
  using repo = fixture();
  repo.changeUpstream();
  const result = repo.run(repo.worktree, stage);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("PUSHED:");
  expect(result.stderr).toContain(`WARNING: ${label} failed (exit 1)`);
  expect(repo.git(repo.origin, "show", "main:upstream.txt")).toBe("upstream change");
  expect(repo.git(repo.origin, "show", "main:fork.txt")).toBe("KW customization");
  expect(repo.git(repo.origin, "log", "-1", "--format=%B")).toContain(`${label}: FAIL (exit 1)`);
});

it("refuses the shared checkout and unsaved work", () => {
  using repo = fixture();
  repo.changeUpstream();
  expect(repo.run(repo.checkout).status).toBe(1);
  NodeFS.writeFileSync(NodePath.join(repo.worktree, "pending.txt"), "pending review\n");
  expect(repo.run().status).toBe(1);
  expect(NodeFS.readFileSync(NodePath.join(repo.worktree, "pending.txt"), "utf8")).toBe(
    "pending review\n",
  );
  expect(repo.git(repo.origin, "rev-parse", "main")).toBe(repo.forkHead);
});

it("refuses a remote configured to publish to upstream", () => {
  using repo = fixture();
  repo.git(repo.worktree, "config", "remote.origin.pushurl", "https://github.com/pingdotgg/t3code");
  expect(repo.run().status).toBe(1);
  expect(repo.git(repo.origin, "rev-parse", "main")).toBe(repo.forkHead);
});
