# PartPlaner – Claude Code Instructions

## Code Review Loop (MANDATORY before any push)

After completing any coding task, run the following review loop **twice** before pushing:

### Review Cycle (repeat 2x)
1. **Spawn a review agent** using `subagent_type: Explore` to audit the changed files
2. The agent must check for:
   - Logic errors and bugs
   - Security issues (XSS, injection, auth gaps)
   - Code quality (no over-engineering, no dead code)
   - Consistency with existing patterns
3. Apply all findings from the agent
4. Repeat the full cycle a second time on the updated code
5. Only after both cycles pass cleanly may you push or consider the task done

### Agent Usage
- Agents live in [`agents/`](agents/) — each file defines a reusable agent prompt
- Rules and constraints live in [`rules/`](rules/) — read relevant rules before starting any task
- Before coding: read `rules/general.md`
- Before pushing: confirm both review cycles completed

## General Workflow
- Minimal changes — only touch what's necessary
- No over-engineering; simplest solution that works
- Fix root causes, not symptoms
