# AGENTS.md

## PR Flow Instructions

Use this flow for every non-trivial change:

1. Create a dedicated git worktree for the task (never work in a shared worktree).
   - Example: `git worktree add ../ig-poster-<task> -b claude/<task>`
2. In that worktree, create/use a branch with prefix `claude/`.
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
8. After creating the PR, continue working on other tasks while Copilot review runs (~5 minutes).
   - Before requesting merge approval, verify Copilot review is complete.
   - Copilot often finds important bugs; always address its comments before merging.
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

## Documentation Maintenance

These docs must stay accurate:
  - `docs/overview.md`
  - `docs/user-guide.md`
  - `docs/architecture.md`
  - `docs/dev-getting-started.md`

- Update docs when the PR changes user-facing behavior, architecture, or setup steps.
- For purely internal changes (refactors, dependency updates, tooling), state "No doc impact" in the PR update.
- Before asking for merge approval, include a brief doc-impact note (which docs were updated, or "No doc impact").

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
  - Pre-approved command usage is limited to the active repository/worktree the agent is currently working in.
  - Any command that writes, deletes, moves, installs, or mutates files must only target paths inside that active repository/worktree.
  - If a write/update action is needed outside the active repository/worktree, stop and ask the user first.
- Core read/navigation commands:
  - `cd`, `pwd`, `ls`, `tree`, `wc`, `du`, `stat`
  - `rg`, `rg --files`, `find`, `cat`, `head`, `tail`, `sed -n`, `cut`, `sort`, `uniq`
  - `git status`, `git diff`, `git log`, `git show`, `git branch`, `git rev-parse`
  - `npm run lint`, `npm run build`, `npm run test`, `npm run typecheck`
- Web/search commands:
  - Tool-based search/open commands (for example: `web.search_query`, `web.open`) are pre-approved.
  - Shell web fetches are pre-approved for read-only retrieval: `curl -sSL` (GET-only), `wget -qO-` (GET-only).
- Write/update commands (repo-scoped only):
  - `mkdir`, `touch`, `cp`, `mv`, `rm` (paths must remain inside the active repository/worktree)
  - `git fetch`, `git pull --ff-only`
  - `npm install`
