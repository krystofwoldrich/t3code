#!/usr/bin/env bash
set -euo pipefail

block() {
  printf 'BLOCKED: %s\n' "$*" >&2
  exit 1
}

repository() {
  case "${1%.git}" in
    https://github.com/krystofwoldrich/t3code|git@github.com:krystofwoldrich/t3code|ssh://git@github.com/krystofwoldrich/t3code)
      printf 'fork'
      ;;
    https://github.com/pingdotgg/t3code|git@github.com:pingdotgg/t3code|ssh://git@github.com/pingdotgg/t3code)
      printf 'upstream'
      ;;
    *) printf 'unknown' ;;
  esac
}

root="$(git rev-parse --show-toplevel)"
cd "$root"
git_dir="$(git rev-parse --absolute-git-dir)"
common_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
[[ "$git_dir" != "$common_dir" ]] || block 'Run in the dedicated maintenance worktree.'
branch="$(git symbolic-ref --quiet --short HEAD)" || block 'The worktree needs a branch.'
[[ "$branch" != main ]] || block 'The maintenance worktree must use its own branch.'
[[ ! -e "$git_dir/MERGE_HEAD" ]] || block 'Resolve and commit the pending merge, then retry; preserving it.'
[[ -z "$(git status --porcelain)" ]] || block 'Save pending maintenance work before retrying; preserving it.'

origin_url="$(git config --get remote.origin.url)"
push_url="$(git config --get remote.origin.pushurl || printf '%s' "$origin_url")"
upstream_url="$(git config --get remote.upstream.url)"
[[ "$(repository "$origin_url")" == fork ]] || block 'origin must be krystofwoldrich/t3code.'
[[ "$(repository "$push_url")" == fork ]] || block 'origin must push to krystofwoldrich/t3code.'
[[ "$(repository "$upstream_url")" == upstream ]] || block 'upstream must be pingdotgg/t3code.'

if [[ -f .t3/setup-running ]]; then
  setup_pid="$(cat .t3/setup-running)"
  if [[ "$setup_pid" =~ ^[0-9]+$ ]] && kill -0 "$setup_pid" 2>/dev/null; then
    block 'Worktree setup is still running. Wait for it before retrying.'
  fi
fi

export GIT_TERMINAL_PROMPT=0
export PATH="$root/node_modules/.bin:$common_dir/../node_modules/.bin:$PATH"
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
git fetch --no-tags upstream refs/heads/main:refs/remotes/upstream/main
origin_head="$(git rev-parse refs/remotes/origin/main)"
upstream_head="$(git rev-parse refs/remotes/upstream/main)"

git merge --ff-only refs/remotes/origin/main || block 'Merge origin/main into this branch, resolve conflicts, commit and retry.'
if [[ "$(git rev-parse HEAD)" == "$origin_head" ]] && git merge-base --is-ancestor "$upstream_head" HEAD; then
  printf 'UP_TO_DATE: upstream main is already included in fork main.\n'
  exit 0
fi

if ! git merge-base --is-ancestor "$upstream_head" HEAD; then
  if ! git merge --no-ff --no-commit refs/remotes/upstream/main; then
    if [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
      printf 'CONFLICT: resolve and commit the merge, then rerun this helper to publish it.\n' >&2
      exit 2
    fi
    block 'Git could not prepare the upstream merge.'
  fi
fi

validation_summary=''
check() {
  local label="$1"
  shift
  local status
  if "$@"; then
    validation_summary+="$label: PASS"$'\n'
  else
    status=$?
    validation_summary+="$label: FAIL (exit $status)"$'\n'
    printf 'WARNING: %s failed (exit %s); publishing continues under the fork testing policy.\n' "$label" "$status" >&2
  fi
}

check 'dependency install' vp i --frozen-lockfile
check 'KW identity tests' vp test run apps/mobile/app.config.test.ts
check 'changed-file checks' vp run check:changed refs/remotes/origin/main --timeout 300
printf '%s' "$validation_summary"

git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
if [[ "$(git rev-parse refs/remotes/origin/main)" != "$origin_head" ]]; then
  printf 'ORIGIN_MOVED: save the candidate, merge the updated origin/main and retry; do not force-push.\n' >&2
  exit 4
fi

commit_message="$(mktemp "${TMPDIR:-/tmp}/t3-upstream-merge.XXXXXX")"
trap 'rm -f "$commit_message"' EXIT
cat > "$commit_message" <<EOF
chore(sync): merge upstream main

Merge pingdotgg/t3code at $upstream_head while preserving the KW fork.
Check failures are advisory for this testing fork:
$validation_summary

Co-authored-by: Krystof Woldrich <31292499+krystofwoldrich@users.noreply.github.com>
Co-authored-by: Codex <noreply@openai.com>
EOF
if [[ -e "$git_dir/MERGE_HEAD" ]]; then
  git commit --file "$commit_message"
fi
git push origin HEAD:refs/heads/main
printf 'PUSHED: %s\n' "$(git rev-parse HEAD)"
