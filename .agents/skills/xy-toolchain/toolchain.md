# Toolchain and Project Setup

## Contents

- [Start from repository truth](#start-from-repository-truth)
- [Package manager](#package-manager)
- [Installation](#installation)
- [Root CLI versus package hooks](#root-cli-versus-package-hooks)
- [Root scripts](#root-scripts)
- [New project baseline](#new-project-baseline)
- [Migration and troubleshooting](#migration-and-troubleshooting)
- [Version notes](#version-notes)

## Start from repository truth

Before running or adding commands:

1. Read the root and target-package `package.json` scripts.
2. Read the root `packageManager` field and lockfile.
3. Read root and package `xy.config.ts` files.
4. Check the installed toolchain with `pnpm list @ariestools/toolchain --depth 0` and compare it with [Version notes](#version-notes).
5. Use the repository script when it already represents the requested gate.
6. Ask the installed version when command behavior is uncertain: `pnpm xy <command> --help`, `pnpm xy <command> --rules` for rule ids and levels, and `pnpm xy --stability` for the stable/experimental catalog (since 9.2.0).

Do not substitute a raw `tsc`, ESLint, esbuild, or Vitest invocation for a repository wrapper unless a targeted diagnostic requires functionality the wrapper does not expose.

## Package manager

Use pnpm for new repositories. It is the fully supported and recommended package manager; Bun, npm, and Yarn support is experimental.

The CLI detects the package manager in this order:

1. The root `devEngines.packageManager` name.
2. The legacy root `packageManager` field.
3. pnpm workspace or lock files.
4. Bun lock files.
5. Yarn lock/config files.
6. npm lock files.

Since 10.2.2 the implementation falls back to npm when no signal exists (Yarn through 10.2.1). Do not rely on that fallback: set `devEngines.packageManager`, commit exactly one lockfile, and use that manager exclusively.

Every pnpm repository, single-package or monorepo, needs a root `pnpm-workspace.yaml`. `xy packman lint` runs in `xy check` and fails without the file, and its `--fix` cannot create it. Minimal content:

```yaml
packages:              # monorepos only
  - 'packages/*'
minimumReleaseAge: 1440
minimumReleaseAgeExclude:
  - '@ariestools/*'
verifyDepsBeforeRun: warn
```

- `minimumReleaseAge` must meet the floor in `commands.packman.minimumReleaseAge` (default 1440 minutes).
- `minimumReleaseAgeExclude` must list exactly the known scopes (`@ariestools/*`, `@xylabs/*`, `@xyo-network/*`) that the repository's package names and dependencies use. A missing scope and an unused known scope are both errors. Quote each pattern; YAML cannot start a plain value with `@`.
- `verifyDepsBeforeRun` must be set.
- Workspace globs go under `packages:`, never in package.json `workspaces` (`repo.workspaces-field-placement`). A `packages:` list makes the repository a monorepo to `xy`, so leave it out of single-package repositories.

Once the file exists, `pnpm xy packman lint --fix` (or `pnpm xy check --fix`) fills in missing settings.

## Installation

The published toolchain requires Node.js 22 or newer, and peers on TypeScript `^5.9 || ^6.0` and ESLint `^10.3`. Install it at the repository root, after `pnpm-workspace.yaml` exists:

```sh
pnpm add -D -w @ariestools/toolchain @ariestools/tsconfig typescript@^6 eslint@^10.3
```

`-w` (`--workspace-root`) is required when `pnpm-workspace.yaml` lists more than one `packages` pattern (pnpm otherwise stops with `ERR_PNPM_ADDING_TO_ROOT`) and harmless otherwise; without a `pnpm-workspace.yaml` it fails. The toolchain, config packages, ESLint, TypeScript, and Vitest belong in the root `devDependencies`, because `xy` runs from the root.

Always give `typescript` a range: an unversioned install now resolves TypeScript 7, which the toolchain cannot load ([typescript.md](typescript.md)).

Add the appropriate ESLint and TypeScript variants from [eslint.md](eslint.md) and [typescript.md](typescript.md). For Vitest presets use `@ariestools/vitest-config` ([testing.md](testing.md)); for environment-neutral ambient globals use `@ariestools/lib-neutral` ([typescript.md](typescript.md)). Pin versions according to the repository's dependency policy; do not copy the toolchain repository's current patch versions blindly.

## Root CLI versus package hooks

Use `xy` at repository/workspace scope. Run it from the repository root, and target one workspace with a package argument (`pnpm xy build <package>`). Never `cd` into a package to build it. Workspace packages define no `build` script (the `xy repo init` package template has only `package-compile`), so `pnpm --filter <package> build` fails. Use `pnpm --filter <package> run <script>` only for scripts that package actually defines. The CLI discovers workspaces, orders compilation, applies concurrency, supports incremental execution, and aggregates diagnostics.

`@ariestools/toolchain` installs two CLIs (since 9.2.0): `xy`, which is semver-stable, and `xyex`, an experimental superset whose commands and flags may change on a minor release. Prefer `xy` in scripts, CI, and examples. Run `pnpm xyex <command>` only for commands that `pnpm xy --stability` marks experimental; under `xy` they still run, with a warning. See [channels](commands.md#stable-and-experimental-channels) and the toolchain's [stability policy](https://github.com/ariestools/toolchain/blob/main/docs/STABILITY.md).

| Command | Actual purpose |
|---|---|
| `xy compile [package]` | Validate TypeScript and emit package output |
| `xy recompile [package]` | Clean, then compile |
| `xy build [package]` | Compile, then run publint, deplint, and ESLint |
| `xy rebuild [package]` | Clean, then run a non-incremental build |
| `xy clean [package]` | Remove build artifacts; optional `--full` / `--full-all` for gitignored hygiene (see [commands.md](commands.md#clean)) |
| `xy test [target]` | Run Vitest for a workspace or path (prefer `@ariestools/vitest-config`; see [testing.md](testing.md)) |
| `xy check` | Run repository/configuration policy checks, including agent lint (since 10.1.1; since 10.1.2 only when AGENTS.md exists or `commands.agentLint` is declared); see [commands.md](commands.md) |
| `xy fix [package]` | Run the standard fixable policy and source checks |
| `xy deplint …` | Dependency policy analysis; `xy deplint pick` for interactive placement (see [commands.md](commands.md)) |
| `xy agent …` | AGENTS.md and docs convention: `lint`, `init`, `audit`, `index`, `archive` (since 10.1.1); see [commands.md](commands.md) and the [xy-agent](../xy-agent/SKILL.md) skill |
| `xyex work …` | Experimental repo-local work tracking with optional GitHub Issues dual-write/sync and multi-folder `--workspace` scope; flags and storage may change on a minor (see [commands.md](commands.md#skills-and-work-tracking)) |

`xy build` does not run tests, license checks, security metadata checks, or every check in `xy check`. Run the required gates explicitly.

The `package-*` binaries are per-package hooks that root orchestration invokes and package scripts can extend. They are an implementation detail of `xy`, not a semver-stable surface: prefer `xy` in docs, scripts, and CI, and call a hook directly only where no `xy` equivalent exists (for example `package-sync-layout --check`).

| Hook | Purpose |
|---|---|
| `package-compile` | Validate and emit one package |
| `package-recompile` | Clean and compile one package |
| `package-build` | Compile and publint one package |
| `package-lint` / `package-fix` | Lint or fix one package |
| `package-publint` | Validate one package's publish surface |
| `package-clean` | Clean one package |
| `package-sync-layout` | Generate or `--check` a monolith layout without compiling; `xy compile` already re-syncs it |

The `-only` binaries are not reduced pipelines. `package-compile-only`, `package-build-only`, and `package-recompile-only` invoke the toolchain implementation while bypassing a same-named package script override. Use them when extending a package hook without recursion:

```json
{
  "scripts": {
    "package-compile": "package-compile-only && tsx scripts/generate-types.ts"
  }
}
```

Never call `pnpm run package-compile` from inside the `package-compile` script; that re-enters itself.

## Root scripts

Preserve existing repository script names. When adding minimal wrappers, point each at `xy`, as the `xy repo init` scaffold does:

```json
{
  "scripts": {
    "build": "xy build",
    "compile": "xy compile",
    "lint": "xy lint",
    "fix": "xy fix",
    "test": "xy test",
    "check": "xy check"
  }
}
```

`xy <command>` hands off to a same-named root script and forwards the rest of the command line, so `pnpm xy test <path>` runs `pnpm run test <path>`. A wrapper such as `"test": "xy test"` is safe: the hand-off sets `XY_LOCAL_SCRIPT=1`, and the inner `xy` runs the built-in command. A script such as `"test": "vitest run"` would receive the target as a Vitest filename filter instead. `--no-defer` or `XY_NO_DEFER=1` forces the built-in command; since 10.1.1, `publish` and `deploy` hand off only with `--defer`. See [commands.md](commands.md#global-behavior).

Compile and build are incremental by default for all-workspace runs. Use `--no-incremental` when validating a clean full run. Use `xy rebuild` when artifacts must be removed first.

## New project baseline

`xy repo init [template] [name]` scaffolds a repository. Without a template it runs an interactive wizard: `pnpm xy repo init`, or `npx --package=@ariestools/toolchain xy repo init` in an empty directory. `cli` is the only template. The defaults are scope `@ariestools`, license MIT, author Aries Tools, pnpm, a monorepo, and skills tier `xy`, so a non-interactive run should pass every choice that differs for the target organization:

```sh
pnpm xy repo init cli <name> --scope <scope> --license <spdx> --skills-tier <none|xy|xyo|xl1> [--skills-optional] --yes
```

`--skills-optional` also installs the tier's optional skills: xy-agent on every tier except `none` (since 10.1.2), plus xl1-dapp-kit, xl1-scaffold, and xl1-build on `xl1`. Its `--help` text still mentions only the XL1 skills.

Inspect the generated output before committing. A 10.1.2 scaffold pins `vitest` and `@vitest/coverage-v8` at `~5.0.3` (satisfying the `@ariestools/vitest-config` peer), `volta.node` at the toolchain's current Node release, and `packageManager` in both layouts. It also writes an AGENTS.md, a CLAUDE.md adapter, papers/README.md, and docs/README.md that pass `xy agent lint --strict`. Two gaps remain:

- A single-package pnpm scaffold has no `pnpm-workspace.yaml`, so `xy packman lint` fails until you create it ([Package manager](#package-manager)).
- A pnpm monorepo scaffold's `minimumReleaseAgeExclude` lists only `@ariestools/*`. With `--scope @xylabs` or `--scope @xyo-network`, run `pnpm xy packman lint --fix` to add that scope.

A scaffold from 10.1.1 or earlier needs more: raise `vitest` to the `^5` peer, set a current `volta.node`, add `packageManager` and `volta` to a single-package repo, add the release-age settings, and bring AGENTS.md up to agent lint. Then bring the repository up to the baseline below.

Whether scaffolded or set up by hand, a new TypeScript repository needs, in every topology:

1. Pin Node 26 and pnpm 12 in root `devEngines` (`runtime` `>=26.0.0 <27.0.0`, `packageManager` `>=12.0.0 <13.0.0`, both `onFail: "error"`) and create the root `pnpm-workspace.yaml` with the release-age settings ([Package manager](#package-manager)). Do not set the legacy `packageManager` field or `volta`. Since 10.3.0, `xy repo init` writes that `devEngines` block and omits `packageManager` and `volta`. A 10.1.2 pnpm monorepo scaffold has the workspace file; a single-package scaffold still needs it.
2. Install `@ariestools/toolchain`, the correct config packages, ESLint, and TypeScript at the root ([Installation](#installation)).
3. Prefer `@ariestools/vitest-config` at the root; a single-package repo passes an explicit `include` ([testing.md](testing.md)). For neutral packages that need common timers/abort globals, add `@ariestools/lib-neutral`.
4. Set `"type": "module"`.
5. Put application or library source under `src/`.
6. Create `xy.config.ts`, `tsconfig.json`, and `eslint.config.ts` at the appropriate root.
7. Generate `eslint.config.ts` with `pnpm xy lint init` (interactive; see [eslint.md](eslint.md#use-the-active-flat-config) for the non-TTY path and the follow-up fixes) rather than copying an old ESLint configuration.
8. Run `pnpm xy agent init` (since 10.1.1), then fill in AGENTS.md ([xy-agent](../xy-agent/SKILL.md)). It scaffolds AGENTS.md, a CLAUDE.md adapter, and the docs/ layout without overwriting. A 10.1.2 `xy repo init` scaffold already has a lint-clean AGENTS.md, CLAUDE.md, papers/README.md, and docs/README.md; there, `agent init` only adds the docs/ subfolders. Agent lint errors when the root AGENTS.md is missing or links to a path that does not exist. It warns when AGENTS.md lacks the orient, authority, repository map, commands, or failures section, or when a CLAUDE.md is neither a symlink to AGENTS.md nor a file whose first non-comment line is an `@AGENTS.md` import (Claude-specific notes may follow). Since 10.1.2, `xy check` skips agent lint until AGENTS.md exists or `commands.agentLint` is declared (10.1.1 runs it in every repository), and `xy check --fix` cannot create these files. The scaffolded papers/README.md carries a `date`, so `docs.stale` warns 180 days later, failing `--strict`, until you update `date` or add `reviewed`.
9. Run `pnpm xy skills lint --fix` to install the skills the repository requires.
10. Add `**/.xy/cache/` to the root `.gitignore`; a bare `.xy/cache` entry covers only the root package.

Single-package repositories: the root is the package, and a published one declares `"engines": { "node": ">=22" }`. Do not apply the monorepo-only rules below, such as root `private: true`.

Monorepos: repo lint, part of `xy check`, also enforces:

- The root is `private: true`; workspace packages live under `packages/`, are covered by the `pnpm-workspace.yaml` globs, and keep specs in `spec/` folders.
- The root declares `devEngines` for Node 26 and pnpm 12 and does not declare `volta` or the legacy `packageManager` field. The root and private packages declare no `engines`.
- Every publishable package declares `engines.node`, for example `">=22"`, and the range must include the latest Node release. Repositories that deliberately track Node LTS set `nodeTrack: 'lts'` ([commands.md](commands.md#repository-policy)). Do not strip `engines` from neutral or browser packages to satisfy `xy node lint`.
- Every workspace package has a consumer README.md, listed in `files` when publishable (since 10.0.5; `xy repo lint --fix` scaffolds one).

Raise the Node floor when a dependency needs a newer runtime; for example, `@ariestools/sdk` 9.x requires Node 26.

Finish a new repository with `pnpm xy check --fix`, then `pnpm xy build`, `pnpm xy test`, and `pnpm xy check` before handing it off. That is the new-repository pass in [Verify the selected profile](project-profiles.md#verify-the-selected-profile). A later source change uses the [Definition of Done](../xy-development/workflow.md#definition-of-done). `--fix` regenerates docs/README.md from document front matter, so in an existing repository with a hand-written docs index read [commands.md](commands.md#repository-policy) first. For CI gate order, see [commands.md](commands.md#ci-gates).

## Migration and troubleshooting

### Migrating from `@xylabs/*`

The retired toolchain packages are `@xylabs/toolchain`, `@xylabs/ts-scripts-common`, `@xylabs/ts-scripts-pnpm`, `@xylabs/ts-scripts-yarn3`, `@xylabs/ts-scripts-react-pnpm`, `@xylabs/ts-scripts-react-yarn3`, and the `@xylabs` ESLint-config and tsconfig packages. The compatibility stubs are no longer built in the active monorepo. Running `xy` never migrates these packages for you (no command calls the toolchain's `deprecationMigrate` helper; only the experimental `packman convert` in step 4 swaps the toolchain and ts-scripts packages; the ESLint-config and tsconfig packages are always manual). Migrate by hand, following the toolchain's [migration guide](https://github.com/ariestools/toolchain/blob/main/docs/migrate-xylabs.md):

1. Replace the legacy packages in `devDependencies` with `@ariestools/toolchain`.
2. Point the ESLint config and tsconfig `extends` at the `@ariestools/*` packages.
3. Move scripts to `xy build`, `xy compile`, `xy lint`, and `xy test`, run from the repository root.
4. Adopt pnpm (`packageManager` plus one lockfile). `pnpm xyex packman convert pnpm` is an experimental helper that converts the repository to pnpm and swaps the managed `@xylabs` toolchain packages for `@ariestools/toolchain`.

Then run `pnpm xy skills lint --fix`. Since 9.2.0, `skills.migrated-source` is an error until xy-development and xy-toolchain are installed from ariestools-skills. Since 10.1.2 it also flags a copy installed from an xyo-skills redirect stub, even one with no skills-lock.json entry.

### Upgrading 9.x to 10.x

10.0.0 removed four top-level aliases. Through 10.1.1 each old name prints `Command not found` and exits 0, so a script, CI step, or agent command that still uses one passes without checking anything. From 10.1.2 they exit 1, and `gitlint` and `lintlint` name their replacement:

| Removed | Use |
|---|---|
| `xy gitlint` | `xy git lint` |
| `xy lintlint` | `xy lint lint` |
| `xy node-lint` | `xy node lint` |
| `xy republint` | `xy publint --fresh` |

9.2.0 removed `xy skills updo`; use `xy skills lint --fix`. Search package.json scripts, `.github/workflows/`, `.claude/commands/`, and legacy skills for the old names, for example with `git grep -nE 'xy (gitlint|lintlint|node-lint|republint)|skills updo'`.

10.x patch releases also change gates: most add error-level rules, and 10.1.2 makes unknown commands fail while relaxing four agent-lint rules to warnings ([Version notes](#version-notes)). Rerun `pnpm xy build` and `pnpm xy check` after every toolchain bump, not only after a major.

### Legacy agent files from `xy claude`

Toolchains before 8.2.8 had an `xy claude` command that wrote agent files, and many repositories still carry its output:

- the skills `xylabs-xy-cli`, `xylabs-xy-deplint-fix`, `xylabs-e2e-setup`, and `xylabs-refactor-cohesion`;
- `.claude/rules/xylabs-*.md`;
- `.claude/commands/xy-*.md` and `.claude/commands/xylabs-*.md`.

They describe `@xylabs/ts-scripts-yarn3`, Yarn, tsup, and commands that no longer exist, such as `compile-only`, `lintlint`, `gitlint`, `deploy-minor`/`-major`/`-next`, `gen-docs`, `readme`, `knip`, and `dupdeps`. This skill supersedes them wherever they conflict; do not run their commands. From 10.1.2 those commands exit 1: `xy compile-only`, `xy lintlint`, `xy gitlint`, and `xy deploy-minor` name their replacement, and any `xy claude-*` command points to `xy skills`.

Since 10.1.2, `skills.legacy-generated` (warn) reports each such file in `xy skills lint` and `xy check`, at the repository root and in every `packages/*` directory. It matches the four skills under `.agents/skills/` or `.claude/skills/`, the rule and command files `xy claude` wrote by name, and any other `.claude/rules/xylabs-*.md` that contains the generator's `Auto-managed by` marker. A `xylabs-*.md` rule it does not name and that lacks the marker, or an `xy-*.md` command it does not list, is left alone. `pnpm xy skills lint --fix` (or `xy check --fix`) deletes the reported files without listing them, so review the lint output with the owner first. It does not remove everything: it leaves skills-lock.json unchanged, and where `.claude/skills/<name>` is a symlink into `.agents/skills/<name>`, it deletes the directory and then skips the now-dangling link, which a rerun no longer reports. Run the `xy skills remove` line below before `--fix`, or afterwards `git rm` any `.claude/skills/xylabs-*` link left behind and drop the four names from skills-lock.json.

On 10.1.1 and earlier nothing reports these files. With the owner's agreement, remove the ones present. Preview what the patterns match by adding `-n` to the `git rm` line first:

```sh
pnpm xy skills remove xylabs-xy-cli xylabs-xy-deplint-fix xylabs-e2e-setup xylabs-refactor-cohesion -y
git rm --ignore-unmatch '.claude/rules/xylabs-*.md' '.claude/commands/xy-*.md' '.claude/commands/xylabs-*.md'
```

The quotes let git expand the patterns against tracked files, and `--ignore-unmatch` keeps a pattern that matches nothing from aborting the whole command (unquoted, zsh stops with `no matches found` and bash hands git a pathspec it rejects).

### Troubleshooting

If installation returns 404 or 403, first verify the exact package name and version, registry configuration, and lockfile. The `@ariestools` toolchain/config packages are public; request authentication only when the repository is intentionally configured for a private registry or private package.

If a package command unexpectedly recurses, inspect same-named package scripts and use the matching `-only` binary. If a workspace is skipped, verify workspace discovery, the package name, and the root package-manager configuration before changing filters.

## Version notes

This skill is verified against `@ariestools/toolchain` 10.3.0; anything without a version marker exists from 9.0.0. Find the installed version with `pnpm list @ariestools/toolchain --depth 0`; `pnpm xy --version` reports it only from 10.0.6. A top-level command the installed version lacks prints `Command not found`. From 10.1.2 it exits 1; through 10.1.1, where newer commands are the ones missing, it exits 0, even under `--strict`. A missing subcommand may be silently ignored (for example, `xy node <typo>` prints only its banner and exits 0) or read as a package target, so check the output and the table below, not only the exit code.

| Since | Change |
|---|---|
| 9.0.1 | `xy secure deps` and `xy secure dependabot` (9.0.0 has only `xy secure [package]`); `repo.dependabot-enabled` |
| 9.0.2 | `xy enable ts-native` (run as `xyex enable ts-native` from 9.2.0) |
| 9.0.3 | `xy lint --mode` |
| 9.1.1 | `git.ignore-toolchain-cache` (`.xy/cache` ignored in every package) |
| 9.2.0 | `xyex` and `xy --stability`; experimental commands warn under `xy`. `xy skills lint --fix` also updates outdated skills, `skills.migrated-source` requires ariestools-skills as the source, and the catalog adds the optional xl1-dapp-kit; `xy skills updo` removed. `xy publish --tag`. `compile.mode: 'tsc'` fails the compile. `**/.claude/**` in the vitest preset excludes. `xy repo init` scaffolds `@ariestools/vitest-config` with an explicit `include` (both layouts) and a `test` script that runs `xy test` |
| 9.2.1 | `xyex plan init` and `xyex plan lint` |
| 10.0.0 | Removed the `gitlint`, `lintlint`, `node-lint`, and `republint` aliases ([Upgrading 9.x to 10.x](#upgrading-9x-to-10x)) |
| 10.0.2 | `@ariestools/vitest-config` peers `vitest` `^5.0` (`^4.1` before) |
| 10.0.3 | Deplint `dep.dependencies.not-public` and `dep.peerDependencies.not-public` (errors) |
| 10.0.5 | Repo lint `repo.package-readme` and `repo.package-readme-files` (errors); `commands.skillsLint.additionalSkills`; `xyex plan lint` root-document rules |
| 10.0.6 | `xy --version` reports the toolchain version |
| 10.0.7 | `nodeTrack` under `commands.repoLint` and `commands.nodeLint`; `xyex npm-org lint` |
| 10.0.8 | package.json `xy.skills` (`skills.package-recommended`, error); skills lint requires xl1-dapp-kit when the repo produces or depends on `@xyo-network/dapp-kit` packages |
| 10.0.9 | Publint `pub.importsMatchExports` (error), and `publint --fix` will not add an export condition that the matching `#alias` does not select. Monolith platform declaration trees share the modules-platform declarations, and layout sync warns about identity-splitting shims |
| 10.1.0 | `@ariestools/vitest-config` default include adds `packages/*/spec/**` and `.tsx`/`.mts`/`.cts` specs. Unicorn v77 rules staged across ESLint tiers (off at 2, warn at 3, error at 4). Compile source directories, entries, and `outdir` / `outfile` / `inject` paths must resolve inside the package. `xyex work sync` edits or closes only issues whose body marker and URL match |
| 10.1.1 | `xy agent` family, with agent lint inside `xy check` (errors); `xy skills pick` and per-skill presence in `commands.skillsLint.skills`; `commands.updo.ignoreDeps`; `publish` and `deploy` hand off to a root script only with `--defer` |
| 10.1.2 | An unknown top-level `xy` or `xyex` command exits 1, and retired names such as `gitlint` print their replacement; `xy git <typo>` exits 1. `xy check` runs agent lint only when AGENTS.md exists or `commands.agentLint` is declared. `agents.adapter-thin`, `agents.required-sections`, `agents.no-absolute-paths`, and `docs.index-current` drop to warn; `CLAUDE.md` and `GEMINI.md` may add notes after a leading `@AGENTS.md` import, and `.github/copilot-instructions.md` may link to `../AGENTS.md`; and agent lint prints its findings without `--json`. Other agent-lint changes: `agents.required-sections` also matches authoritative, what not to do, and pitfall; `agents.authority-rows-resolve` reads each row's path from the Authority column's link; the `docs.front-matter` fix infers `kind` from the folder and no longer writes `kind: doc`; `docs.stale` skips evidence, decisions, archive, and superseded or retired files; `docs.orphan` no longer counts a mention in the docs/README.md index; `docs.superseded-archived` also covers `retired`, requires the file to sit under `docs/archive/`, and accepts a repository-root `supersededBy`; and `decisions.naming` parses prefixed ids such as `XY-D001`. `xy agent archive` keeps the path below docs/ (`docs/guides/x.md` moves to `docs/archive/guides/x.md`) and sets `state: retired` or keeps `superseded`, where 10.1.1 wrote `archived`. The `xy agent init` AGENTS.md stub lints clean. `xyex plan lint` `plan.root.claude-imports-agents` passes only when `@AGENTS.md` is CLAUDE.md's first visible line; an inline or later import passed in 10.1.1. `--strict` and `XY_STRICT=1` escalate agent-lint and skills-lint warnings, including inside `xy check`, and `xy check --json` lists `errors` and `warnings`. Skills lint adds `skills.legacy-generated` (warn, fixable), takes xy-agent into the catalog (optional on every tier except `none`, so an installed xy-agent on a tier-`none` repo now warns `skills.unnecessary`), and flags redirect-stub installs under `skills.migrated-source`. `xy skills pick` merges presence into the existing config and has its own `--help`. A typed `XyConfig` accepts `commands.dependabot` and `commands.workLint`. `xy repo init` pins `vitest` `~5.0.3`, the current Node in `volta.node`, and `pnpm@12.10.1` (single-package layouts now keep `packageManager` and `volta`); adds the release-age settings to a pnpm monorepo's `pnpm-workspace.yaml`; writes an AGENTS.md that passes agent lint, with papers/README.md and docs/README.md; and hardens the CI workflow. Its `--skills-optional` adds xy-agent |
| 10.1.3 | `xyex work sync` pushes the rendered body to issues `xy work` owns whenever it differs (local wins), and `work.github-synced` reports body drift; `work update` keeps priority fields it is not given; `--blocked-reason ""` clears the reason |
| 10.1.4 | The skills catalog adds ariestools-sdk-react and ariestools-actor (thirteen skills): `xy skills pick`, `commands.skillsLint.additionalSkills` and `skills` presence, and package.json `xy.skills` entries without a `source` accept them, and lint version-checks them. Skills lint requires ariestools-sdk-react where a workspace package produces or depends on `@ariestools/sdk-react` or an `@ariestools/sdk-react-*` package, and ariestools-actor for the actor-kit, cli-kit and browser-kit packages, each together with ariestools-sdk; an installed one in a repository without those packages now warns `skills.unnecessary`. The `xy skills defaults`, `lint` and `pick` help lists all six ariestools-skills skills |
| 10.1.5 | Experimental `xy agent lint --fix-interactive`: applies `--fix`, then asks on the terminal for what twelve rules need; it needs a TTY and cannot run with `--json`, and `--rules` shows `ask` or `yes, ask` in the Fix column. `--fix` also repairs `agents.adapter-thin` where no text is lost (it moves a later `@AGENTS.md` line to the top of `CLAUDE.md` or `GEMINI.md`, replaces a byte-for-byte copy of AGENTS.md there with the import, and adds a link to AGENTS.md to `.github/copilot-instructions.md`), and the `docs.front-matter` fix also adds `kind` to front matter that has other fields but no `kind`. `docs.index-current` runs last, and front-matter and adapter fixes skip a symlink instead of writing through it |
| 10.2.0 | Agent lint reads Markdown as CommonMark and front matter as YAML (top-level fields only; a block with errors is read field by field), and skips files `.gitignore` excludes, although the root `AGENTS.md` and adapters are still checked for structure, not for machine paths. Every `xy agent` command, and agent lint inside `xy check`, runs on the repository root when started in a package folder, and `xy agent archive <path>` reads `<path>` relative to the current folder. `--fix`, `xy agent index` and `xy agent archive` regenerate `docs/README.md` only when it is missing or wholly generated, or between `<!-- xy agent index: start -->` and `<!-- xy agent index: end -->`; a hand-written index is reported, and `xy agent index` refuses it. No fix writes through a symlink or hard link, `--fix` lints again and reports only what remains, `agents.adapter-thin` compares files so `--fix` never rewrites an adapter that AGENTS.md links to, and `xy agent archive` refuses archived documents and nested checkouts. `agents.size-budget` counts like `wc -l`. `agents.links-resolve` reads CommonMark links and reference definitions, resolves `/` paths from the root, and reports links that leave the repository, with file and line. `docs.orphan` counts a link, a path, or a file name unique among the checkout's Markdown files, never a generated index row. `papers.header` reads front matter or labeled header fields above the first thematic break and reports version and date mismatches. `decisions.naming` counts archived decision ids and ignores stubs of another kind. `docs.evidence-immutable` counts body versions along the first-parent history of `docs/evidence/`. `agents.no-live-state` also checks package AGENTS.md files, ignores code blocks, and matches narrower patterns; `agents.no-absolute-paths` ignores web URLs and relative paths; `agents.authority-rows-resolve` skips a URL in the authority table and reports a path that leaves the repository. `xy agent audit` accepts `commands.agentLint.rules` for any rule |
| 10.2.1 | Unicorn migration queues and their versioned public exports are removed: upstream unopinionated severities apply from tier 2, opinionated rules are errors from tier 3, and tiers 3/4 share Unicorn severities. `no-restricted-syntax` also flags `value.constructor.name`; use a stable identifier. |
| 10.2.2 | Removed `compile.tsup`, compile `outDir`, the tsup compile type/function aliases, `createBuildConfig`, `defaultBuildConfig`, and `xyex eject`; use esbuild options and lowercase `outdir`. Multi-format arrays fail; selected-package bundling uses a resolver plugin composed with user plugins. Compile, clean and workspace containment follow real filesystem paths; local deplint plugins resolve from their declaring config and stay within its checkout. Compile no longer falls back to a `tsc` on `PATH`. `xy skills lint --offline` now skips upstream version checks, and `xy check --offline` forwards it only to skills lint. Work sync also requires the `xy-work` label before attaching, editing or closing a marked issue. Package-manager argument guards reject flag-like workspace names and invalid publish tags; registry lookups reject non-HTTPS URLs and package subpaths. `xy repo init` pins pnpm 12.15.0 and its generated CLI build workflow adds `xy check`. |
| 10.3.0 | Experimental `xyex verify` (also `xy verify`, which warns): compile, then test, then check, for the whole repository, stopping at the first non-zero exit. `--fix` and `--offline` apply to the check step. It does not run ESLint, deplint, or publint, and it takes no package target. `--json` prints one `schemaVersion: 1` envelope on stdout (`command`, `durationMs`, `exitCode`, `success`, `errorCount`, `warningCount`, plus `data`, `errors`, and `warnings` when present) and sends human logs to stderr, including unknown-command and CLI-validation failures. `xy updo` refuses `--json`; `xy skills pick` refuses it unless `--skill` is passed. `xy repo init` writes root `devEngines` (Node `>=26.0.0 <27.0.0`, pnpm `>=12.0.0 <13.0.0`) and no longer writes `packageManager` or `volta` |
