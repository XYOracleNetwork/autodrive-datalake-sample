---
name: xy-toolchain
description: "The Aries Tools TypeScript toolchain (@ariestools/toolchain) behind XY, XYO, and XL1 repositories — the stable xy and experimental xyex CLIs, xy.config.ts, and the shared ESLint, TypeScript, and Vitest configs. Use when setting up a repo or choosing a project profile; running or debugging build, lint, test, or xy check; configuring package output; fixing deplint or publint findings; linting AGENTS.md and docs with xy agent; supporting product planning (papers, roadmap, PRDs) with xy repo init and xyex plan; managing skills; tracking work with xyex work; updating dependencies; auditing licenses or security; releasing packages; or interpreting xy command failures."
metadata:
  # x-release-please-start-version
  version: "0.1.14"
  # x-release-please-end
  toolchain: ">=9.0.0"
  verified-toolchain: 10.3.0
---

# XY Toolchain

**Authority.** This skill is maintained only in [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills). Copies under `XYOracleNetwork/xyo-skills` are redirect stubs — edit here, never there. If the repository also has `xylabs-*` skills, `.claude/rules/xylabs-*.md`, or `.claude/commands/xy-*.md` and `xylabs-*.md`, they are retired output of the removed `xy claude` command; this skill supersedes them. Since 10.1.2, `xy skills lint` reports them and `--fix` removes most of them ([legacy agent files](toolchain.md#legacy-agent-files-from-xy-claude)).

**Toolchain versions.** This skill is verified against `@ariestools/toolchain` 10.3.0; anything not marked "(since X)" exists from 9.0.0. Find the installed version with `pnpm list @ariestools/toolchain --depth 0` (`pnpm xy --version` is reliable only from 10.0.6). A top-level command the installed version lacks prints `Command not found`. From 10.1.2 that exits 1; through 10.1.1, where newer commands are the ones missing, it exits 0, even under `--strict`. A missing subcommand may be silently ignored (for example, `xy node <typo>` prints only its banner and exits 0) or read as a package target, so check the output and the Version notes, not only the exit code. [Version notes](toolchain.md#version-notes) collects the gates.

**Skill identity.** When you present a plan, an acknowledgement, or a completion summary, state which skills informed it as `xy-toolchain v<version>`, and list each other active skill from this pack the same way. Read the version from this file's `metadata.version`, never from an example or from `verified-toolchain`.

Use the active [`@ariestools/toolchain`](https://github.com/ariestools/toolchain) packages. Do not install the retired `@xylabs/*` compatibility names in new work.

**Channels.** `xy` is semver-stable. `xyex` (since 9.2.0) is an experimental superset whose commands, flags, and config may change on a minor release. Prefer `xy`; run the commands that `pnpm xy --stability` marks experimental, such as `work`, `dead`, and `plan`, as `pnpm xyex <cmd>` (before 9.2.0, see [channels](commands.md#stable-and-experimental-channels)).

Inspect the repository's `package.json`, lockfile, `xy.config.ts`, ESLint config, TypeScript configs, and test config before choosing commands. Prefer existing repository scripts; use the `xy` CLI directly when the repository exposes no narrower wrapper.

This skill builds on [xy-development](../xy-development/SKILL.md), which covers language and workflow principles. Load only the reference needed for the task:

## References

### [Project profiles](project-profiles.md)

Read first when classifying a package's role (library, library/CLI, CLI, service, app, workspace-root, tooling), visibility, runtime, and framework; choosing neutral/node/browser/React guidance; overriding a misdetected deplint role, such as a single-package service detected as `workspace-root`; deciding how monorepo and single-package setup differ; or determining whether framework tooling or `xy compile` owns production output. [Verify the selected profile](project-profiles.md#verify-the-selected-profile) is the check after that configuration change. The task-completion gate is the [Definition of Done](../xy-development/workflow.md#definition-of-done).

### [Toolchain and project setup](toolchain.md)

Read when installing the toolchain with pinned TypeScript and ESLint ranges, setting up pnpm and `pnpm-workspace.yaml`, choosing between `xy` and `xyex`, wiring root scripts and their hand-off from `xy`, distinguishing `xy` commands from `package-*` hooks, scaffolding with `xy repo init` or meeting the new-project baseline, migrating from `@xylabs/*`, upgrading 9.x to 10.x, removing legacy `xy claude` agent files, checking which toolchain version added a command, or troubleshooting project setup.

### [Compilation and package output](compilation.md)

Read when editing `xy.config.ts` (including which settings cascade from the root), selecting neutral/node/browser targets, choosing library/bundle/transpile/monolith/vendor mode, configuring type validation or the experimental native compiler, keeping a monolith's `#imports` aligned with its exports, or debugging emitted files and export layouts.

### [Command and policy catalog](commands.md)

Read when choosing between `xy` and `xyex` commands; running lifecycle or CI gates (`build`, `check`, `fix`, `test`); fixing `deplint` (package roles, `not-public`, placement/presence, `pick`), `api-exposure`, `publint`, `license`, `secure`, or repository-policy findings (including `nodeTrack`); checking AGENTS.md and docs with `xy agent` (since 10.1.1; `xy check` runs its `lint`, since 10.1.2 only when AGENTS.md exists or `commands.agentLint` is declared; the experimental `--fix-interactive` since 10.1.5); managing `xy skills` (tiers, package.json `xy.skills`, per-skill presence, `pick`); tracking work with `xyex work` (GitHub Issues dual-write and sync, multi-folder `--workspace` scope); configuring `clean`; releasing with `deploy` and `publish` (`--tag`, `--defer`); maintaining dependencies (`install`, `reinstall`, `up`, `updo` with `commands.updo.ignoreDeps`); using other experimental `xyex` commands (`dead`, `plan`, `npm-org`, …); or setting rule levels and using `--rules`, `--json`, `--strict`, and automation behavior.

### [Plan tooling](plan.md)

Read when scaffolding a product repository for the xy-product-plan process (papers, `docs/ROADMAP.md`, per-version PRDs), or when deciding whether and how to use the experimental `xyex plan lint` or `.xy/plan.json` with it. Covers what `xy repo init` and `xy agent init` create, what `xy agent lint` checks on papers, the roadmap and PRDs (and that no tool checks version pins), the `plan lint` rules that conflict with product-prefixed, Red and Light papers and how to turn them off, the manifest's paper slots and roadmap phases, and linking `xyex work` items to a PRD.

### [ESLint configuration](eslint.md)

Read when creating or repairing an ESLint flat config (`xy lint init` or by hand), selecting a rule tier, fixing the rules you hit at the default tier, enabling or scoping type-aware linting, honoring `.gitignore`, overriding import restrictions without dropping the shared bans, diagnosing lint caching or performance, or using `lint lint` and `lint config`.

### [TypeScript configuration](typescript.md)

Read when selecting `@ariestools/tsconfig`, `-dom`, or `-react` with a pinned `typescript` range (never 7), interpreting base options such as `noEmit`, `erasableSyntaxOnly`, and the `tslib` that decorators need, configuring Node types and per-target type passes, using `@ariestools/lib-neutral` ambient globals, or separating type validation from toolchain emission.

### [Testing with Vitest](testing.md)

Read when configuring Vitest (the `@ariestools/vitest-config` preset and its version-dependent default include, or a hand-rolled config), choosing spec locations and node/browser routing, installing Chromium for browser tests, running a workspace or path and understanding how `xy test` hands off to a root script, placing full-app Playwright e2e, clearing the test cache, or distinguishing test failures from build failures.

## Related skills

These are navigation links, not dependencies; each skill installs separately.

- **[xy-development](../xy-development/SKILL.md)** — the base skill: TypeScript, Git, testing principles, and the Definition of Done. Install: `npx skills add ariestools/ariestools-skills --skill xy-development`.
- **[ariestools-sdk](../ariestools-sdk/SKILL.md)** — `@ariestools/sdk` utilities and specialist packages from `sdk-js`; it builds on this skill. Install: `npx skills add ariestools/ariestools-skills --skill ariestools-sdk`.
- **[ariestools-sdk-react](../ariestools-sdk-react/SKILL.md)** — React UI on `@ariestools/sdk-react*`: packages, peers, the import rule and house patterns; it builds on this skill and its React profile. Install: `npx skills add ariestools/ariestools-skills --skill ariestools-sdk-react`, or, since 10.1.4, `pnpm xy skills pick --skill ariestools-sdk-react`, which also records it as required; `xy skills lint` requires it where `@ariestools/sdk-react*` packages are used ([`xy skills`](commands.md#xy-skills)).
- **[ariestools-actor](../ariestools-actor/SKILL.md)** — actor-kit actors, providers and the actor engine, hosted by cli-kit or browser-kit; it builds on this skill. Install: `npx skills add ariestools/ariestools-skills --skill ariestools-actor`, or, since 10.1.4, `pnpm xy skills pick --skill ariestools-actor`, which also records it as required; `xy skills lint` requires it where actor-kit, cli-kit or browser-kit packages are used ([`xy skills`](commands.md#xy-skills)).
- **[xy-agent](../xy-agent/SKILL.md)** — AGENTS.md, `docs/`, and `papers/` conventions, checked by the stable `xy agent lint` (since 10.1.1; `xy check` runs it, since 10.1.2 only when AGENTS.md exists or `commands.agentLint` is declared), with `xy agent init|audit|index|archive` as helpers ([`xy agent`](commands.md#xy-agent)). Install: `npx skills add ariestools/ariestools-skills --skill xy-agent`, or `pnpm xy skills pick --skill xy-agent` (since 10.1.2), which also records it as required.
- **[xy-product-plan](../xy-product-plan/SKILL.md)** — the tool-independent product-planning process (White, Yellow, Green, Red and Light papers, the roadmap's MVP line, per-version PRDs) that [Plan tooling](plan.md) supports. Install: `npx skills add ariestools/ariestools-skills --skill xy-product-plan`. It is outside the `xy skills` catalog, so `xy skills pick` rejects it.
- Domain scaffolds (for example XL1 apps in the separate [xyo-skills](https://github.com/XYOracleNetwork/xyo-skills) pack) should still depend on the active `@ariestools/*` toolchain packages described here.
