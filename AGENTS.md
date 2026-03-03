# AGENTS.md

## PR Flow Instructions

Use this flow for every non-trivial change:

1. Create a branch with prefix `codex/`.
2. Implement changes, run local validation (`lint`, `build`, relevant tests).
3. Commit with clear message and push branch.
4. Open a PR with:
   - concise summary of what changed
   - validation evidence
   - any known risks or follow-ups
5. Request Copilot review on the PR.
6. Wait for Copilot review to complete before taking next steps.
7. Process review comments:
   - address each actionable comment with code changes, tests, or explicit rationale
   - reply on each comment with resolution details
   - push follow-up commits
8. Re-run validation after fixes.
9. Post a final PR update summarizing:
   - what was changed after review
   - current status of all review comments
   - latest validation results
10. Wait for explicit user approval before merging.
11. Do not merge until user says to merge.

## Merge Gate (Mandatory)

- Never self-merge without explicit user approval.
- If approval is missing, stop and ask for merge approval.
- After approval, merge PR with a non-interactive command.

## Review Handling Rules

- Treat Copilot review comments as required inputs, not optional suggestions.
- If a comment is incorrect, respond with a short technical justification.
- Do not ignore unresolved threads.
- Ensure PR has no unresolved critical comments before asking for merge approval.
