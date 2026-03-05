# AGENTS.md

## PR Flow Instructions

Use this flow for every non-trivial change:

1. Create a dedicated git worktree for the task (never work in a shared worktree).
   - Example: `git worktree add ../ig-poster-<task> -b codex/<task>`
2. In that worktree, create/use a branch with prefix `codex/`.
3. Run a pre-flight isolation check before editing:
   - `git status --short`
   - If there are unexpected tracked/untracked files, stop and ask the user before proceeding.
4. Implement changes, run local validation (`lint`, `build`, relevant tests).
5. Commit with clear message and push branch.
6. Open a PR with:
   - concise summary of what changed
   - validation evidence
   - any known risks or follow-ups
7. Copilot review is automatically requested when the PR is created (do not manually request it).
8. Wait for Copilot review to complete before taking next steps.
   - Copilot review may take around 5 minutes; wait and re-check before re-triggering.
   - Copilot often finds important bugs; do not skip this wait.
9. Process review comments:
   - address each actionable comment with code changes, tests, or explicit rationale
   - reply on each comment with resolution details
   - resolve all conversations (PRs are merge-blocked until conversations are resolved)
   - resolve all merge conflicts before asking for merge approval
   - push follow-up commits
10. Re-run validation after fixes.
11. Post a final PR update summarizing:
   - what was changed after review
   - current status of all review comments
   - latest validation results
12. Wait for explicit user approval before merging.
13. Do not merge until user says to merge.

## Documentation Maintenance (Mandatory)

- Treat these files as required living docs that must stay accurate on every PR:
  - `docs/overview.md`
  - `docs/user-guide.md`
  - `docs/architecture.md`
  - `docs/dev-getting-started.md`
- For every PR, review these docs for impact and update them when product behavior, UX flow, architecture, or developer workflow changes.
- Before asking for merge approval, include a doc-impact note in the PR update:
  - list which of the four docs were updated, or
  - explicitly state why no updates were required.
- Do not request merge approval while any of the above docs are stale relative to the code in the PR.

## Merge Gate (Mandatory)

- Never self-merge without explicit user approval.
- All review conversations must be resolved before merging. No PR may be merged with open/unresolved threads.
- The PR must have no merge conflicts. If the PR shows as CONFLICTING, rebase or merge the base branch to resolve conflicts before requesting merge approval.
- If approval is missing, stop and ask for merge approval.
- After approval, merge PR with a non-interactive command.

## Review Handling Rules

- Treat Copilot review comments as required inputs, not optional suggestions.
- If a comment is incorrect, respond with a short technical justification.
- Do not ignore unresolved threads.
- All review conversations must be resolved before a PR can be merged. This is a hard gate — no exceptions.
- After pushing fixes, reply on each resolved comment thread and mark it resolved.
- Ensure PR has no unresolved critical comments before asking for merge approval.

## PR Body Safety (Mandatory)

- Do not use inline markdown strings with `gh pr create --body "..."` or `gh pr comment --body "..."` when text includes backticks or shell-sensitive characters.
- Always write PR markdown into a file and use `--body-file` (for create/edit/comments) to avoid shell interpolation and command substitution.
- After creating or editing a PR body, verify it with `gh pr view <number> --json body --jq .body`.
- If formatting is corrupted, immediately fix it with `gh pr edit <number> --body-file <file>` and post a corrected follow-up comment if needed.

## GitHub API Reference (Mandatory)

When interacting with PR review comments via `gh api`, use these exact endpoints:

- **Reply to a review comment**: `gh api repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies -f body="..."`
  - WRONG: `gh api repos/{owner}/{repo}/pulls/comments/{id}/replies` (missing PR number — returns 404)
- **List review comments**: `gh api repos/{owner}/{repo}/pulls/{pr_number}/comments`
- **Resolve review threads**: use GraphQL `resolveReviewThread` mutation with the thread's node ID
- **Get thread node IDs**: query `reviewThreads` on the `pullRequest` object via GraphQL

## Command Permissions (Default Allowlist)

To reduce approval interruptions, the following commands are pre-approved by default.

- Scope rule:
  - Read-only discovery/navigation commands are pre-approved.
  - Any command that writes, deletes, moves, installs, or mutates files must only target paths inside the active repository/worktree.
  - If a write/update action is needed outside the active repository/worktree, stop and ask the user first.
- Core read/navigation commands:
  - `cd`, `pwd`, `ls`, `tree`, `wc`, `du`, `stat`
  - `rg`, `rg --files`, `find`, `cat`, `head`, `tail`, `sed -n`, `cut`, `sort`, `uniq`
  - `git status`, `git diff`, `git log`, `git show`, `git branch`, `git rev-parse`
  - `npm run lint`, `npm run build`
- Web/search commands:
  - Tool-based search/open commands (for example: `web.search_query`, `web.open`) are pre-approved.
  - Shell web fetches are pre-approved only for simple read-only GET requests using exact forms:
    - `curl -sSL <URL>`
    - `wget -qO- <URL>`
    - Do not add flags that change method or send a request body (for example: `-X`, `-d`, `--data`, `--data-*`, `--upload-file`, `-F`, `--form`).
    - For non-GET/authenticated/upload requests, use tool-based web commands instead of `curl`/`wget`.
- Write/update commands (repo-scoped only):
  - `mkdir`, `touch`, `cp`, `mv`, `rm` (paths must remain inside the active repository/worktree)
  - `git fetch`, `git pull --ff-only`
  - `npm ci` (preferred lockfile install)
  - `npm install` is not pre-approved when it will add/update/remove dependencies or modify `package.json`/`package-lock.json`; ask the user first.
