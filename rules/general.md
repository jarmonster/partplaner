# General Rules

## Before Starting Any Task
- Read the relevant section of CLAUDE.md
- Understand the existing codebase structure before writing new code
- Prefer editing existing files over creating new ones

## Code Standards
- Minimal changes — only touch what's necessary
- No over-engineering; simplest solution that works
- No unused variables, dead code, or commented-out blocks
- No speculative features or future-proofing

## Security
- Validate all user input at system boundaries
- No hardcoded secrets or credentials
- Sanitize output rendered to the DOM (prevent XSS)
- Use parameterized queries for any database access

## Before Pushing
- Both review cycles (defined in CLAUDE.md) must complete cleanly
- No console.log or debug statements left in production code
