# AGENTS.md

Use `.claude/skills/pr` for every non-trivial repo change. That skill owns the end-to-end PR workflow. This file only keeps the repo-specific rules the skill must follow.

## Required Repo Rules

- Work in a dedicated git worktree; never edit non-trivial changes in a shared worktree.
- Run `git status --short` in the active worktree before editing. If unexpected tracked or untracked files are present, stop and ask the user.
- Keep these docs accurate when behavior, architecture, or setup changes:
  - `docs/overview.md`
  - `docs/user-guide.md`
  - `docs/architecture.md`
  - `docs/dev-getting-started.md`
- If docs are unchanged, say `No doc impact` in PR updates.
- Copilot review is auto-requested when the PR is created. Do not request it manually.
- Treat Copilot review comments as required inputs. Address each actionable comment with code, tests, or explicit rationale.
- Reply on each resolved review comment thread and resolve all conversations before asking for merge approval.
- Do not ask for merge approval while the PR has conflicts. Rebase or merge the base branch first, then rerun validation.
- Never merge without explicit user approval. After approval, merge with a non-interactive command.
- Use `--body-file` for `gh pr create`, `gh pr edit`, and `gh pr comment` whenever markdown may contain shell-sensitive characters or backticks.
- After editing a PR body, verify it with `gh pr view <number> --json body --jq .body` and immediately fix any formatting corruption.

## Review API Notes

- Reply to a review comment with `gh api repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies -f body="..."`.
- List review comments with `gh api repos/{owner}/{repo}/pulls/{pr_number}/comments`.
- Resolve review threads with the GraphQL `resolveReviewThread` mutation.
- Get review thread node IDs from `pullRequest.reviewThreads`.

## Command Guardrails

Command allowlists and tool hooks live in `.claude/settings.json`. Keep permissions and safety hooks there instead of duplicating them in this file.
