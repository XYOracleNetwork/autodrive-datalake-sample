---
name: xy-development
description: Core development standards for TypeScript, Git workflow, testing principles, and development workflow. Activates when writing code, running builds, performing git operations, or completing features.
metadata:
  version: 0.1.5 # x-release-please-version
---

# Development Standards

**Authority.** This skill is maintained only in [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills). Copies under `XYOracleNetwork/xyo-skills` are redirect stubs — edit here, never there.

This skill defines foundational development practices. Load the relevant sub-topic based on your current task:

**Skill identity.** This skill's version is exposed in this file's frontmatter under `metadata.version`. When reporting which skills informed your work, format as `<skill-name> v<version>` (e.g. `xy-development v1.1.19`). When multiple skills from this plugin are active, each may be listed.

## Table of Contents

### [TypeScript Conventions](typescript.md)
Read when writing, reviewing, or refactoring TypeScript code. Covers strictness posture, the `any` escape hatch policy, return type inference, interface vs type usage, and naming conventions.

### [Git Workflow](git.md)
Read when creating commits, branches, or preparing changes for review. Covers conventional commits, atomic commit discipline, and branch naming patterns.

### [Testing Principles](testing.md)
Read when writing tests, discussing test strategy, or evaluating coverage. Covers framework-agnostic testing principles. Note: specific test frameworks and tooling are defined in the XY Toolchain skill (Layer 2).

### [Development Workflow](workflow.md)
Read before running any build, lint, or test command, and before declaring any task complete. Covers native toolchain discovery (use the repo's commands, not ad-hoc one-offs) and the definition of done checklist.

## Related skills

- **[xy-toolchain](../xy-toolchain/SKILL.md)** — the `xy` CLI, build/lint/test commands, and the tooling these principles run on.
- **[xy-agent](../xy-agent/SKILL.md)** — *recommended, not required.* Repository documentation conventions: the `AGENTS.md` entry point, per-tool adapters, and the `docs/` and `papers/` lifecycle. Read it when writing or reorganizing a repository's agent-facing documents, or when a repository already follows the pattern. A repository that does not follow it is not defective — use whatever convention that repository already has.
