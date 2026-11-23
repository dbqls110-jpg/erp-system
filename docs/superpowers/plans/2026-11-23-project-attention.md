# Project attention implementation plan

**Goal:** B dashboard preview and A full Today view, with reliable assignees and safe next-check changes.

**Architecture:** Both surfaces read the same authorized checklist query and priority policy. Resolve legacy project assignee names to exactly one active internal account, or accept a deliberately selected active internal ID. Rechecking updates only the next check date and version through the existing project edit guard.

**Constraints:** Keep the existing project list, filters, board, financial data and permission boundaries. No production changes, push, or deploy before approval. No schema change or retroactive reassignment.

1. Add database tests for bulk assignments, unmapped or ambiguous names and rechecking without modifying actual deadlines. Implement the shared resolver and guarded transactional recheck action.
2. Test sorting actual overdue and due today ahead of follow-ups, shared count and the first five, direct navigation, and full separate task rendering. Implement the shared query and use it on both pages.
3. Verify affected browser/render behavior, invited-user isolation, isolated PostgreSQL writes, complete tests, lint, types, and build. Keep change local for approval.
