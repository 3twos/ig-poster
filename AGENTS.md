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
7. Request Copilot review on the PR.
8. Wait for Copilot review to complete before taking next steps.
9. Process review comments:
   - address each actionable comment with code changes, tests, or explicit rationale
   - reply on each comment with resolution details
   - push follow-up commits
10. Re-run validation after fixes.
11. Post a final PR update summarizing:
   - what was changed after review
   - current status of all review comments
   - latest validation results
12. Wait for explicit user approval before merging.
13. Do not merge until user says to merge.

## Merge Gate (Mandatory)

- Never self-merge without explicit user approval.
- If approval is missing, stop and ask for merge approval.
- After approval, merge PR with a non-interactive command.

## Review Handling Rules

- Treat Copilot review comments as required inputs, not optional suggestions.
- If a comment is incorrect, respond with a short technical justification.
- Do not ignore unresolved threads.
- Ensure PR has no unresolved critical comments before asking for merge approval.
