# Milady Project Scope

## Project Mission
Milady is a personal AI assistant built on ElizaOS. It runs locally, respects privacy, and connects to messaging platforms. The goal is agent capability, not human aesthetics.

## In Scope (always welcome)
- Bug fixes (especially connector issues, crashes, regressions)
- Security fixes and hardening
- Test coverage improvements
- Performance improvements (must include benchmarks)
- Documentation accuracy fixes
- Error handling improvements
- Logging and observability improvements

## Deep Review Required (may not merge)
- New features (must align with mission, include tests)
- New plugins or integrations (must justify why)
- Architectural changes (needs strong rationale + migration plan)
- Memory/context system changes (must benchmark before/after)
- Dependency additions (justify necessity, check supply chain)
- API changes (backward compatibility required)

## Out of Scope (reject)
- Frontend redesigns, theme changes, color schemes, icon/font swaps
- "Beautification" PRs that don't improve agent capability
- Aesthetic changes to human-facing UI that don't affect agent function
- Scope creep disguised as "improvements"
- Changes without tests for testable code
- PRs that add dependencies without `src/` directly importing them

## Anti-patterns to watch for
- Large PRs that bundle unrelated changes (ask to split)
- "Refactoring" that changes behavior without tests
- New dependencies with postinstall scripts
- Changes to auth/permissions/secrets without security review
- Subtle changes to prompt templates or system messages
