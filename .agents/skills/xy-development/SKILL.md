---
name: xy-development
description: "Core development standards for TypeScript conventions, Git workflow, testing principles, behavior-preserving refactors, repository workflow, and the Definition of Done. Use when writing or reviewing TypeScript or organizing imports; writing tests; refactoring, moving code between packages, or auditing a monorepo's package structure; running a repo's build, lint, test, or dev commands; adding or upgrading dependencies; committing, branching, merging, releasing, or deploying; writing PRD acceptance criteria; or before declaring any task complete."
metadata:
  # x-release-please-start-version
  version: "0.1.14"
  # x-release-please-end
---

# Development Standards

**Authority.** This skill is maintained only in [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills). Copies under `XYOracleNetwork/xyo-skills` are redirect stubs — edit here, never there.

**Skill identity.** When you present a plan, an acknowledgement, or a completion summary, state which skills informed it as `xy-development v<version>`, and list each other active skill from this pack the same way. Read the version from this file's `metadata.version`, never from an example.

This skill defines foundational development practices. Where a repository's own `AGENTS.md` or `CLAUDE.md` says otherwise, the repository wins. Load the sub-topic that matches your current task:

**Architecture decisions.** Before a change introduces distributed worker responsibilities, recovery rules, or new coordination authority, consult [ariestools-architecture](../ariestools-architecture/SKILL.md) when available. Prefer protocol-defined autonomous, replaceable workers with durable evidence and safe concurrent effects; justify coordination by its invariant or resource constraint. Preserve the accepted architecture during routine maintenance. The [workflow](workflow.md#architecture-decisions) describes this scoped review, including when the architecture skill is absent.

## Table of Contents

### [TypeScript Conventions](typescript.md)
Read when writing, reviewing, or refactoring TypeScript code, or organizing imports. Covers strictness markers and code-shape limits; the `any` policy; return types; interface vs type; readonly usage; erasable-syntax rules (no enums, parameter properties, or namespaces); ESM-only modules with explicit import extensions; root-barrel imports and import style; conditions, nullish values, and promises; and naming, export, and file conventions.

### [Git Workflow](git.md)
Read when committing, branching, pushing, merging or opening PRs, undoing a change, resolving a rejected push, or cutting a release. Covers conventional commits and PR titles, atomic commits, commit identity and repository hygiene, the history-rewrite policy (shared branches stay append-only; an unpushed topic branch changes only when the user asks), working in the checkout you were given, branching-model detection from `AGENTS.md` or `origin/develop`, merge methods, and releases.

### [Deployment Conventions](deployment.md)
Read when creating, changing, simplifying, or migrating deployment workflows or provider branch mappings. Covers `<environment>[-<component>]-<target>[-<build-mode>]` names, native Vercel versus CI prebuilt/image delivery, one automatic build/deploy path, explicit approval for naming exceptions, homelab scope, and compatibility across independently deployed components.

### [Testing Principles](testing.md)
Read when writing tests, discussing test strategy, or evaluating coverage. Covers framework-agnostic principles: behavior-focused names, arrange/act/assert, one concept per test, testing the public interface, independent and deterministic tests, minimal mocking that still leaves the real wiring tested, and coverage priorities. Frameworks, runners, and spec layout are defined in the xy-toolchain skill ([xy-toolchain testing](../xy-toolchain/testing.md)).

### [Development Workflow](workflow.md)
Read before running any build, lint, test, or dev command; before adding or upgrading dependencies; when writing a PRD.md's acceptance criteria; and before declaring any task complete. Covers toolchain discovery (repo instructions, scripts, and CI before ad-hoc one-offs), dependency and peer-dependency rules, credential safety, the layered Definition of Done (the toolchain completion gate is scoped `xy build` and `xy test`, with `xy check` only for policy and document edits, plus browser verification for apps), and writing project-specific acceptance criteria.

### [Behavior-Preserving Refactors](refactoring.md)
Read when moving code between files or packages, splitting or merging packages, breaking dependency cycles, or auditing a monorepo's package graph for cohesion and coupling. Covers the no-behavior-change invariant; a baseline run before the first change; cohesion and coupling findings, their default severities, and the owner-approval step; the steps of a cross-package move (tests, entry points, import sites, manifests, path aliases); breaking changes for published packages; and the per-move verification rule.

## Related skills

These are navigation links, not dependencies of this skill; each installs separately.

- **[ariestools-architecture](../ariestools-architecture/SKILL.md)** — the shared design preference and review criteria for autonomy, authority, concurrency, and recovery. Consult at architectural decisions; ordinary implementation within an accepted design does not reopen it.
- **[xy-toolchain](../xy-toolchain/SKILL.md)** — the `xy` CLI, build/lint/test commands, and the tooling these principles run on. Install: `npx skills add ariestools/ariestools-skills --skill xy-toolchain`.
- **[ariestools-sdk](../ariestools-sdk/SKILL.md)** — which `@ariestools/*` utilities to use and how to import them. Read it when the repo depends on sdk-js packages; `xy skills lint` requires it only there, so it is often absent elsewhere. Install: `npx skills add ariestools/ariestools-skills --skill ariestools-sdk`.
- **[ariestools-sdk-react](../ariestools-sdk-react/SKILL.md)** — which `@ariestools/sdk-react*` package owns a component or hook, its peers, and the import rule that keeps one copy of each React context. Read it when the repo depends on sdk-react packages; since toolchain 10.1.4, `xy skills lint` requires it only there. Install: `npx skills add ariestools/ariestools-skills --skill ariestools-sdk-react`.
- **[ariestools-actor](../ariestools-actor/SKILL.md)** — actor-kit actors, providers and the actor engine, hosted by cli-kit or browser-kit. Read it when the repo depends on actor-kit, cli-kit or browser-kit packages; since toolchain 10.1.4, `xy skills lint` requires it only there. Install: `npx skills add ariestools/ariestools-skills --skill ariestools-actor`.
- **[xy-agent](../xy-agent/SKILL.md)** — *recommended, not required.* Repository documentation conventions: the `AGENTS.md` entry point, per-tool adapters, and the `docs/` and `papers/` lifecycle. Read it when writing or reorganizing a repository's agent-facing documents, or when a repository already follows the pattern; otherwise follow the convention the repository already has. In `@ariestools/toolchain` repos, `xy agent lint` (since toolchain 10.1.1) enforces it. Since 10.1.2, `pnpm xy check` runs it only where the repository has a root `AGENTS.md` or declares `commands.agentLint` (even only to set rule levels), and by default only a missing root `AGENTS.md` or a relative Markdown link in it whose target does not exist is an error. Other departures, such as a `CLAUDE.md` that does not start with an `@AGENTS.md` import or a missing required `AGENTS.md` section, warn, and fail only under `--strict` or `XY_STRICT=1`. Toolchain 10.1.1 runs it in every repository with more error-level rules ([version notes](../xy-toolchain/toolchain.md#version-notes)). See [xy-toolchain › `xy agent`](../xy-toolchain/commands.md#xy-agent) for the rules and `commands.agentLint.rules`. `pnpm xy agent init` scaffolds the convention without overwriting existing files. Install: `npx skills add ariestools/ariestools-skills --skill xy-agent`, or, since toolchain 10.1.2, `pnpm xy skills pick --skill xy-agent`, which also records it as required so `pnpm xy skills lint` version-checks it and `--fix` installs or updates it. Since 10.1.2, `xy repo init --skills-optional` also installs it in a new repository on any skills tier except `none`, although that flag's help still describes only XL1 skills. See [xy-toolchain › `xy skills`](../xy-toolchain/commands.md#xy-skills) for the other routes and their caveats.
