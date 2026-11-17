# Command and Policy Catalog

## Contents

- [Global behavior](#global-behavior)
- [Lifecycle gates](#lifecycle-gates)
- [Dependency and publish analysis](#dependency-and-publish-analysis)
- [Repository policy](#repository-policy)
- [Documentation conventions](#documentation-conventions)
- [Skills and work tracking](#skills-and-work-tracking)
- [Clean](#clean)
- [Releasing (owner-directed)](#releasing-owner-directed)
- [Dependency maintenance and utilities](#dependency-maintenance-and-utilities)
- [Configuration and automation](#configuration-and-automation)

## Global behavior

Use `pnpm xy --help` and `pnpm xy <command> --help` from the repository's installed toolchain. Commands evolve faster than copied command lists.

### Stable and experimental channels

Since 9.2.0 the toolchain package ships two binaries:

| Binary | Contract |
|---|---|
| `xy` | Semver-stable. Breaking changes to commands, flags, or stable `xy.config.ts` fields need a major release. |
| `xyex` | Experimental superset of `xy`. Experimental commands, their flags, and their config may change or disappear on a minor release. |

- `pnpm xy --stability` (add `--json`) lists the tier of every command, package, and experimental config surface. Treat it and the toolchain's [STABILITY.md](https://github.com/ariestools/toolchain/blob/main/docs/STABILITY.md) as the source of truth.
- Run `pnpm xyex <cmd>` only for commands the catalog marks experimental. Prefer `xy` in scripts, CI, and examples.
- Experimental commands still run under `xy` with a warning; that path may become a hard error in a future major.
- 9.0.x and 9.1.x have no `xyex` binary; run the same commands as `pnpm xy <cmd>` there.
- Experimental config surfaces (for example `compile.compiler: 'native'`, ESLint tier 4, non-pnpm package managers, and the settings of experimental commands) follow the same minor-release contract.

### Experimental commands

| Command | Purpose | Hazard |
|---|---|---|
| `xyex dead` | Declaration liveness; see [`xyex dead`](#xyex-dead-package-experimental) | `--fix-remove` deletes code |
| `xyex work` | Repo-local work items; see [`xyex work`](#xyex-work-experimental) | Storage and GitHub sync still evolving |
| `xyex plan init` / `plan lint` | Plan manifest and a papers/docs/notes layout | Conflicts with `xy agent lint`; see [Documentation conventions](#documentation-conventions) |
| `xyex npm-org lint [org]` | Stale packages in an npm organization; see [`xyex npm-org lint`](#xyex-npm-org-lint-org-experimental) | Network-bound |
| `xyex orphan list` / `orphan clean` | Directories left holding only build output after package moves | Overlaps `xy clean --full`; `clean` deletes |
| `xyex enable ts-native [--no-install]` | Add the TypeScript 7 native compiler beside `typescript` | Experimental compiler config |
| `xyex tsc-validate [package]` | One-process type check with a shared source cache | Incompatible with the native compiler |
| `xyex packman convert <pm>` / `packman clean` | Package-manager migration aids | `packman clean` deletes `node_modules` and lockfiles; it is not a build-artifact cleaner (use `xy clean`) |
| `xyex sonar` | Quarantined Sonar check | Needs a local `sonar.eslintrc`; may be removed |
| `xyex verify` | Whole-repository compile, then test, then check; stops at the first failure (since 10.3.0) | Skips ESLint, deplint, and publint; always runs `xy check`; not the [completion gate](../xy-development/workflow.md#definition-of-done) |

React projects also get the stable `xy start` and the experimental `analyze` and `sitemap`; `start` wraps CRA `react-scripts` and does not apply to Vite or Next. `xyex eject` was removed in 10.2.2. `xy relint` is deprecated in favor of `xy lint --fresh`. Read experimental flags from `pnpm xyex <cmd> --help` rather than copying them.

### Global flags

| Flag | Behavior |
|---|---|
| `--jobs <n>` | Limit parallel work; defaults to the machine's available CPU parallelism |
| `--json` | Emit one `schemaVersion: 1` envelope on stdout and send human logs to stderr (since 10.3.0) |
| `--rules` | List supported rules and effective levels for a rule-bearing command |
| `--stability` | List command, package, and experimental config stability (since 9.2.0) |
| `--strict` | Treat warnings as failures (also `XY_STRICT=1`) |
| `--profile` | Emit package/phase timing information where supported |
| `-v, --verbose` | Verbose logging |
| `--no-defer` | Run the built-in command even when the root `package.json` has a same-named script (also `XY_NO_DEFER=1`); overrides `--defer` |
| `--defer` | Let `publish` and `deploy` run a same-named root script (off by default since 10.1.1) |
| `--no-incremental` | Force a full run where the command is incremental by default (compile, build, lint, publint) |

A top-level command with no subcommand, including one given a positional such as `xy test <target>`, defers to a same-named root `package.json` script and forwards its arguments. Subcommands such as `xy lint lint` never defer.

Do not infer that a zero exit code means zero warnings unless `--strict` was active. For automation, read the `--json` envelope. Since 10.3.0 that envelope is the only thing on stdout: `command`, `durationMs`, `exitCode`, `success`, `errorCount`, `warningCount`, and `schemaVersion: 1`, plus `data`, `errors`, and `warnings` when the command has them. Human logs go to stderr. An unknown command and a CLI validation failure are envelopes too. `xy updo` cannot run with `--json`. `xy skills pick` cannot run with `--json` unless `--skill <name>` is passed. Since 10.1.2, `xy check --json` carries the sub-linters' diagnostics beside the counts; a linter that reports only counts adds none, so `errors` and `warnings` can be shorter than the counts.

## Lifecycle gates

| Command | Included work | Important exclusions |
|---|---|---|
| `xy compile` | Type validation and package emission | Lint, tests, publish checks |
| `xy build` | Compile, publint, deplint, ESLint | Tests, `xy check`, license, secure |
| `xy rebuild` | Clean plus a full non-incremental build | Tests, license, secure |
| `xy test [target]` | Vitest for a workspace or path | Compile and lint |
| `xy check` | Agent docs (AGENTS.md and docs convention, since 10.1.1; since 10.1.2 only with a root `AGENTS.md` or a declared `commands.agentLint`), Git, package-manager, publish, repo-layout, ESLint-config, and skill policy | Compile, source ESLint, deplint, node lint, tests |
| `xy fix [package]` | Git lint, deplint, repo lint, publint, ESLint, and ESLint-config (`lint lint`) fixes | Packman, skills, and agent fixes (use `xy check --fix`), node lint, tests, compile |

For an ordinary code change, the agent completion gate is the [Definition of Done](../xy-development/workflow.md#definition-of-done): from the repository root, `pnpm xy build <package>` and `pnpm xy test <package-or-path>`. `xy build` already includes compile, publint, deplint, and ESLint. Add `pnpm xy check` when the change touches repository policy, `AGENTS.md`, `docs/`, skills, or package-manager configuration. `--strict` belongs to CI. Experimental `xyex verify` (since 10.3.0) is the whole-repository compile, test, and check sequence in the table above. It is not this gate.

The table says what each command includes. It is not a list of commands to run on every task. Run a wider set when the repository's CI or `AGENTS.md` requires it. The sequence below is what those library workflows run.

### CI gates

The Aries Tools library repos run this sequence with `NODE_OPTIONS=--max-old-space-size=8192`:

```sh
pnpm install --frozen-lockfile
pnpm xy build --jobs 1
pnpm exec playwright install chromium   # browser-realm repos only
pnpm xy test
```

- Take the Node version from the repository (for example `node-version-file: package.json`) rather than hard-coding it.
- `--jobs` defaults to the runner's core count, and every lint worker inherits `NODE_OPTIONS`, so a large heap multiplied by many workers can exhaust runner memory; that is why these repos pass `--jobs 1`. `xy test` ignores `--jobs`.
- A fresh checkout has no `.xy/cache/incremental` snapshot, so `xy build` runs in full. Do not restore a stale `.xy/cache`.
- Never pass `--fix` in CI.

To also gate repository policy, run `pnpm xy check --strict` after the build (publint compares export maps with compiled output):

- First set git config with plain git: `git config core.autocrlf false && git config core.eol lf`, plus `git config core.ignorecase false` on case-insensitive filesystems. A fresh clone has neither of the first two keys, so `git.autocrlf` and `git.eol` warn and fail `--strict`. Do not use `xy git lint --fix` for this; it can also rewrite `.gitignore`.
- Since 10.1.2, `--strict` and `XY_STRICT=1` also escalate agent-lint and skills-lint warnings, both inside `xy check` and in the standalone linters. Before 10.1.2, `xy check --strict` leaves them as warnings and the standalone linters ignore `XY_STRICT=1`, so when those warnings must block on those versions, also run `pnpm xy agent lint --strict` and `pnpm xy skills lint --strict`.
- `xy check` is not hermetic. Since 10.2.2, `xy check --offline` passes through to skills lint, and `xy skills lint --offline` correctly skips upstream skill version checks; other check steps are unchanged. Through 10.2.1 the skills CLI accepted `--offline` but did not pass it to the version checker, and `xy check` had no offline option. Without it, `skills.required-current` fetches upstream skill versions: a failed lookup passes silently, while a new upstream skill release can fail CI with no repository change. Once agent-lint warnings gate, as they do under `xy check --strict` since 10.1.2, `docs.stale` depends on today's date and `docs.evidence-immutable` needs full history (`fetch-depth: 0`).

## Dependency and publish analysis

### `xy deplint [package]`

Analyze imports against `dependencies`, `devDependencies`, and `peerDependencies`. Detect unlisted, unused, misplaced, redundant, unsatisfied, unrequested, version-mismatched, range-style, and workspace-protocol problems. Use `--fix` for supported changes, then inspect `package.json` and rerun cleanly. Narrow a run with `-d` / `-D` / `-P` (one manifest section) or `-e, --exclude <paths>` (skip source paths). `pnpm xy deplint --rules` lists the catalog; old `deplint.*` rule ids are deprecated aliases of `dep.*`.

The `range-style` rules, which are warnings unless configured, expect full-patch tilde ranges (`~X.Y.Z`) for external `dependencies` and `devDependencies`. For `peerDependencies` they expect the shorthand form instead of a broad comparator range, and the `form` and `bound` options of `dep.peerDependencies.range-style` configure that. Workspace and opaque specs are skipped: `workspace:`, `catalog:`, `npm:`, `file:`, `link:`, `patch:`, `portal:`, and URL, git, or hosted specs. `pnpm add` saves `^X.Y.Z`, so run `pnpm xy deplint --fix` after adding a dependency.

Most deplint rules default to warnings. Since 10.0.3, `dep.dependencies.not-public` and `dep.peerDependencies.not-public` are errors with no auto-fix, so they block `xy build`:

- A package is public when it is not `private` and is either unscoped or sets `publishConfig.access: 'public'`. A scoped package without `access` counts as restricted.
- A public package may not list, in `dependencies` or `peerDependencies`, a package that is not publicly published on npm, a private or restricted workspace sibling, or a non-registry spec (`file:`, `link:`, `portal:`, `catalog:`, `patch:`, `npm:` aliases, git).
- Fix by hand: publish the dependency, switch to a published registry range, drop it, or make the consumer private.

Choose the dependency/peer classifier deliberately. The default is `legacy`; override it per repository with `commands.deplint.classifier` or per run with `--classifier`:

- `legacy` promotes external runtime dependencies of libraries toward peers.
- `aei` uses API Exposure Index evidence and leaves borderline cases for review.
- `aei-next` also supports `peer-with-default` when the install-strategy heuristics match.

#### Package roles

Deplint auto-detects a package **role** (`library`, `library/cli`, `cli`, `service`, `app`, `workspace-root`, `tooling`) and applies policy facets. Agents must not treat every private package as free to demote runtime deps to `devDependencies`.

Critical cases:

- **`service` / `cli` with a trusted runtime graph:** keep real runtime deps in `dependencies`. Demoting them breaks `pnpm install --prod` and Docker slim images.
- **`private: true` is not a service signal.** A private package with a real `main` / `exports` surface remains a **library**.
- Progress labels use role ids (`service`, `cli`, …), not legacy `terminal[private]` / `terminal[cli]`.
- Prefer `commands.deplint.role` (and optional `runtimeRoots` / facets) over deprecated `terminal: true`.

Full role table, facets (`prodInstallMatters`, trusted graphs, `runtimeEntry`), and override examples: [project-profiles.md](project-profiles.md#package-roles-and-dependency-policy).

#### Package placement and presence

Configure exceptional packages through `commands.deplint.packages`. Separate where a package belongs from whether its declaration must exist:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    deplint: {
      packages: {
        typescript: { placement: 'dev' },
        'eslint-plugin-example': {
          placement: 'dev',
          presence: 'allowed',
        },
        react: {
          placement: 'peer',
          presence: 'required',
        },
      },
    },
  },
}

export default config
```

Use `placement` to control the manifest section whenever a dependency is declared or discovered:

- `dep` selects `dependencies`.
- `dev` selects `devDependencies`.
- `peer` selects `peerDependencies`; when deplint adds a required or promoted peer, it also adds the development companion.
- `peer-with-default` intentionally selects both `dependencies` and `peerDependencies`.

Use `presence` independently:

- `inferred` is the default. Source and peer-chain evidence decide whether the declaration exists; `placement` alone does not retain an unused declaration.
- `allowed` retains a declaration that static analysis cannot justify but does not add it when absent. Use it for dynamically or convention-loaded plugins and similar dependencies invisible to source scanning.
- `required` adds and retains a missing declaration. Always pair it with `placement`; `dep.package.required` reports and can fix the missing manifest entry.

A per-package entry also accepts `peerOptional` to force `peerDependenciesMeta[<name>].optional`; by default it is optional only when every requiring dependency marks it optional.

Treat `refType` as deprecated. Its historical behavior combines placement with allowed presence: `refType: 'dev'` is equivalent to `{ placement: 'dev', presence: 'allowed' }`. Do not migrate mechanically to `{ placement: 'dev' }` unless unused-removal behavior is intended.

Placement overrides also inform `xy api-exposure`. Root and package `commands.deplint.packages` entries deep-merge, so a root placement can combine with a package-level presence override. Keep package-role classification separate from these per-dependency policies, and do not distort source imports to satisfy an inappropriate classifier default.

Other `commands.deplint` fields: `classifier` (default `legacy`), `exclude` (workspace-relative globs skipped by source scanning, for generated trees such as release folders), `plugins` (extra rule modules; since 10.2.2 relative paths resolve from the config that declares each plugin, and local paths must stay inside its Git checkout), `rules`, and the role facets `role`, `hasImportConsumers`, `peerTarget`, `allowMoveToDev`, `prodInstallMatters`, `runtimeEntry`, and `runtimeRoots`, which derive from the role when unset.

#### Interactive pick

Use `xy deplint pick` for an interactive table of borderline AEI packages (`dep.dependencies.aei-review`, reported only under the `aei` and `aei-next` classifiers) plus every package already listed under `commands.deplint.packages` in the monorepo's `xy.config` files:

```sh
pnpm xy deplint pick
pnpm xy deplint pick @scope/package
```

Space cycles each row through `none` / `dep` / `dev` / `peer`; Enter writes the chosen placements into the appropriate `xy.config`. `none` removes a `dep` / `dev` / `peer` entry but keeps existing `peer-with-default` and presence-only entries. After picking, run `xy deplint --fix` to apply placements to `package.json` manifests. Redundant placement overrides that match the active classifier can be cleaned with `--fix` via `dep.package.redundant-placement`.

### `xy api-exposure [package]`

Measure how a package's public runtime and type surface couples consumers to each dependency. Use `--dep` to narrow analysis, `--min-band` to filter output, and `--fail-on` for an explicit automation threshold. Treat results as dependency-placement evidence, not as a mechanical peer-dependency mandate.

### `xy publint [package]`

Validate the npm package surface, including upstream publint checks, compiled output/export-map parity, platform portability, export condition order, published files, source leakage, side effects, root legacy fields, dependency resolutions, workspace peer ranges, and `#imports`/exports alias parity. `pub.publint`, `pub.platform`, and `pub.importsMatchExports` are errors by default.

`pub.importsMatchExports` (since 10.0.9) requires every exact `#alias` in `package.json` `imports` to select the same runtime file as its same-named public subpath under every condition; otherwise a consumer that reaches both loads two module instances. It has no auto-fix; see [Monolith mode](compilation.md#monolith-mode).

Use `--fix` for XY-managed fixable rules; it cannot fix every upstream publint error, and it will not add an export condition that the subpath's `#alias` does not also select. Narrow a run with `--include` / `-e, --exclude <checks>` (comma-separated check names; `peerDeps` runs only on all-workspace runs), and use `--fresh` to clear the incremental snapshot. `--no-pack` skips published-files verification, so do not use it for gates.

### `xyex dead [package]` (experimental)

Analyze declaration liveness at package, repository, and active editor-workspace scope; `--workspace <file>` names the `*.code-workspace` file used by workspace-scoped rules. Use `--deprecated` to report consumed deprecated exports. Run `--fix` first; it adds deprecation markers. `--fix-remove` removes dead declarations and cascades supported cleanup: run it only on a clean git tree, review the diff, then rerun compile and tests. Flags and `commands.dead` settings may change on a minor release.

### `xy license` and `xy secure`

Use `xy license` to check production dependency licenses against the configured allowlist.

Since 9.0.1, `xy secure` is an overview that runs both security audits and prints a summary line each, pointing at the subcommands for detail (9.0.0 has only the dependency audit):

| Command | Behavior |
|---|---|
| `xy secure deps [package]` (since 9.0.1; on 9.0.0 run `xy secure [package]`) | Audit direct dependency age and download metadata. Not a vulnerability scanner — it reports no CVEs. |
| `xy secure dependabot` (since 9.0.1) | Report GitHub Dependabot security alerts via the `gh` CLI |

`xy secure dependabot` needs `gh` installed and authenticated; the standard `repo` scope suffices. Alerts are enabled per repository, and a repo with the feature off is reported as such, not as a failure. Flags: `--org <name>` (sweep a whole org), `--scope`, `--relationship`, `--state`, `--summary`, `--rules`.

Findings are rule-bearing: `dependabot.critical` / `.high` / `.medium` / `.low`, plus `dependabot.alerts-enabled`. Alerts are overwhelmingly transitive lockfile findings, so nothing fails by default (`critical` and `high` warn; `medium` and `low` are off) — raise levels under `commands.dependabot.rules` to gate. A typed `XyConfig` accepts that key since 10.1.2; before that, use the [untyped command keys](#untyped-command-keys) workaround. Console output caps at 50 alerts and reports how many were held back; `--json` carries every finding.

### `xyex npm-org lint [org]` (experimental)

Since 10.0.7, lint every package published in an npm organization (`ariestools` or `@ariestools`). It is not part of `xy check`.

| Rule | Default | Meaning |
|---|---|---|
| `npm-org.stale-usage` | warn | Last-week downloads at or below `minWeeklyDownloads` (default 10) |
| `npm-org.stale-development` | warn | Latest version published at least `maxAgeDays` ago (default 365) |

Configure under `commands.npmOrgLint` (`minWeeklyDownloads`, `maxAgeDays`, `includeDeprecated`, `rules`); `--min-downloads`, `--max-age-days`, and `--include-deprecated` override them per run. Packages whose latest version is deprecated are skipped by default. Weekly download counts are cached for 12 hours under `.xy/cache/npm-downloads/` (`XY_NPM_DOWNLOADS_CACHE=0` disables it), and a downloads-API 404 counts as zero.

## Repository policy

Use the focused command when diagnosing one policy family:

| Command | Policy | In `xy check` |
|---|---|---|
| `xy agent lint` | AGENTS.md, tool adapters, and the `docs/` / `papers/` convention (since 10.1.1); see [Documentation conventions](#documentation-conventions) | Yes, first; since 10.1.2 only with a root `AGENTS.md` or a declared `commands.agentLint` |
| `xy git lint` | Git config (`core.autocrlf` false, `core.eol` lf, `core.ignorecase` false) and a `.gitignore` entry that ignores `.xy/cache` in every package (`git.ignore-toolchain-cache`, since 9.1.1) | Yes |
| `xy packman lint` | pnpm `minimumReleaseAge`, `minimumReleaseAgeExclude`, and `verifyDepsBeforeRun`, and Yarn `enableScripts: false`; all errors, fixable once `pnpm-workspace.yaml` exists. It does not check pnpm `allowBuilds`: add an entry by hand for a dependency that needs install scripts | Yes |
| `xy repo lint` | Monorepos only: workspace layout (`packages/` folder, glob coverage), versions and internal ranges, engines, root `devEngines` (Node 26 and pnpm 12), no legacy `packageManager` or `volta`, pnpm release age and overrides, spec layout, a consumer `README.md` per package and its `files` entry (since 10.0.5), and Dependabot enablement | Yes |
| `xy lint lint` | Local ESLint config package, `.gitignore` parity, redundant rules, and overrides | Yes |
| `xy skills lint` | Required catalog skills, versions, duplicate global installs, catalog skills that are neither required nor optional for the tier nor `allowed` in config, and leftover `xy claude` output (since 10.1.2); see [`xy skills`](#xy-skills) | Yes |
| `xy node lint` | Package `engines.node` portability | No; run `xy node lint [--fix]` on its own |

`xy check` also runs publint. `xy check --fix` applies the fixable forms of the families `xy check` runs; `xy fix` covers a different set (see [Lifecycle gates](#lifecycle-gates)). Since 10.1.2 that includes deleting leftover `xy claude` output (`skills.legacy-generated`, see [`xy skills`](#xy-skills)). Run it locally, never in CI, review the diff, then rerun without `--fix`. For CI, see [CI gates](#ci-gates).

Since 10.1.1, `xy check --fix` also runs agent lint's fixers wherever `xy check` runs agent lint. Through 10.1.5 they replace `docs/README.md` with the generated index, discarding a hand-written one; since 10.2.0 they regenerate only a missing or wholly generated index, or the table between its `<!-- xy agent index: start -->` and `<!-- xy agent index: end -->` markers, and report a hand-written one. They also add front matter to `docs/`, `papers/`, and `specs/` files that have none. Since 10.1.2 the fixer infers `kind` from the folder (`decision`, `evidence`, `runbook`, or `plan` under `docs/decisions/`, `docs/evidence/`, `docs/runbooks/`, or `docs/plans/`; `paper` under `papers/`; `spec` under `specs/`), leaves any other file unmodified and still warning, and regenerates the index from the fixed front matter in the same run. On 10.1.1 it writes `kind: doc` to every such file. Before the first fix in a repository that runs agent lint:

1. Run `pnpm xy agent lint` without `--fix`.
2. Scaffold missing files with `pnpm xy agent init`, which never overwrites.
3. On 10.1.5 and earlier, in a repo with a hand-maintained docs index, set levels under `commands.agentLint.rules` before fixing.
4. On 10.1.1, run `pnpm xy agent index` after a front-matter fix. That release builds the index from the pre-fix documents, so an immediate rerun still fails `docs.index-current`.

A new workspace package needs a `README.md` or `xy check` fails; `xy repo lint --fix` scaffolds one. List every repo rule with `pnpm xy repo lint --rules`.

`xy repo lint` includes `repo.dependabot-enabled` (since 9.0.1), which warns when GitHub Dependabot alerts are switched off for the repository and enables them under `--fix` (needs admin on the repo; reports the finding as still open when the token cannot). It stays silent when `gh` is missing, unauthenticated, or the remote is not GitHub.

`repo.engines-lts` (error) compares `engines` ranges against the latest Node **Current** release by default. `repo.dev-engines` (error) requires the root `devEngines` block to pin Node `>=26.0.0 <27.0.0` and pnpm `>=12.0.0 <13.0.0` with `onFail: "error"`. Repos that deliberately track Node LTS for published `engines` ranges set `commands.repoLint.nodeTrack` to `'lts'` (since 10.0.7):

```ts
const config: XyConfig = {
  commands: {
    repoLint: { nodeTrack: 'lts' },
  },
}
```

## Documentation conventions

### `xy agent`

Since 10.1.1, the stable `xy agent` family checks and maintains the AGENTS.md and `docs/` convention described by the [xy-agent skill](../xy-agent/SKILL.md). `xy check` runs `agent lint` first. Since 10.1.2 it does so only when the repository has a root `AGENTS.md` (a symlink counts) or declares `commands.agentLint` in the root or workspace config, and otherwise prints `No AGENTS.md — skipping agent lint`; on 10.1.1 it runs in every repository. Declaring the key at all, even only to turn rules off, opts `xy check` in. A direct `xy agent lint` always runs, including the missing-file check. Since 10.1.2, text output lists each finding and each passing rule. Since 10.2.0 every `xy agent` command, and the agent-lint step of `xy check`, works on the repository root (the nearest workspace root inside the Git checkout, else the Git top level) when started in a package folder, and agent lint skips files `.gitignore` excludes, apart from the root AGENTS.md and adapters.

| Command | Behavior |
|---|---|
| `xy agent lint [--fix] [--fix-interactive] [--strict] [--rules]` | Lint AGENTS.md, tool adapters, and `docs/` / `papers/` / `specs/` documents. `--fix-interactive` is experimental (since 10.1.5) |
| `xy agent audit [--strict]` | Report stale, orphaned, superseded-but-unarchived, live-state, and edited-evidence documents (a five-rule subset) |
| `xy agent init` | Scaffold AGENTS.md, a `CLAUDE.md` containing only `@AGENTS.md`, `docs/{decisions,runbooks,plans,evidence,archive}/`, and `docs/README.md`; never overwrites |
| `xy agent index` | Regenerate `docs/README.md` from document front matter. Since 10.2.0 it rewrites only the table between the index markers of a hand-written index, and refuses one without markers |
| `xy agent archive <path>` | Move a document under `docs/archive/` and refresh the index. Since 10.1.2 it keeps the path under `docs/` (`docs/plans/x.md` becomes `docs/archive/plans/x.md`), sets `state: retired` unless the document is already `superseded`, leaves the rest of the front matter alone, and adds a dated banner naming the original path. 10.1.1 moves the file flat, sets `state: archived`, writes a generic banner, and rewrites the front matter, dropping quotes and block lists. Neither rewrites links to or from the moved file. Archiving a document that AGENTS.md links to fails `agents.links-resolve` until the link is updated, and a `supersededBy` relative to the document's folder no longer resolves from `docs/archive/`, so `docs.superseded-archived` warns. Before archiving a superseded document, give `supersededBy` as a repository-root path such as `docs/plans/NEW.md` (accepted since 10.1.2). Since 10.2.0 `<path>` is relative to the current folder, and it refuses a symlink, a document already under `docs/archive/`, and one in a nested Git checkout |

Since 10.1.2 only `agents.file-present` and `agents.links-resolve` are errors. `agents.required-sections` (orient, authority, repository map, commands, and failures sections), `agents.adapter-thin`, `agents.no-absolute-paths`, and `docs.index-current` were errors on 10.1.1 and now warn like the rest, so they fail only under `--strict`, `XY_STRICT=1`, or a level raised in `commands.agentLint.rules`. `agents.adapter-thin` accepts no adapter, a symlink to AGENTS.md, or a `CLAUDE.md` / `GEMINI.md` whose first visible line is `@AGENTS.md` or `@./AGENTS.md`. Since 10.1.2 tool-specific notes may follow that import, provided they do not restate AGENTS.md, and `.github/copilot-instructions.md` may instead link to `../AGENTS.md`; on 10.1.1 nothing may follow the import. `commands.agentLint.rules` sets levels, and unknown rule ids are errors. List the catalog with `pnpm xy agent lint --rules`.

`--fix`, which `xy check --fix` also runs wherever it runs agent lint, regenerates `docs/README.md` (`docs.index-current`) and gives a document under `docs/`, `papers/` or `specs/` the `kind` its folder implies (`docs.front-matter`): through 10.1.4 only a file with no front matter, since 10.1.5 also front matter that has other fields but no `kind`. Since 10.1.5 it also fixes `agents.adapter-thin` where no text is lost: it moves a later `@AGENTS.md` line to the top of `CLAUDE.md` or `GEMINI.md`, replaces a byte-for-byte copy of AGENTS.md in either with the import, and prepends a link to `../AGENTS.md` to a `.github/copilot-instructions.md` that lacks one. An adapter with no import line, or one that restates AGENTS.md below its import, stays a finding. Since 10.1.5 `docs.index-current` runs after every other rule, and the front-matter and adapter fixes leave a symlink alone instead of writing through it. Since 10.2.0 no fix writes through a symlink or into a hard-linked file, `--fix` lints again and reports only what remains, and it never rewrites an adapter that AGENTS.md is a symlink or hard link to; through 10.1.5 it erases the instructions there.

Since 10.1.5, the experimental `--fix-interactive` applies `--fix`, then asks on the terminal for the answers twelve rules need: a title and description for a missing AGENTS.md, which it then creates as `xy agent init` would; whether to prepend the import to an adapter that lacks it or replace the adapter with the import, and whether to replace one that restates AGENTS.md; a product name for an H1 that names the file; one line for each missing required section; a replacement for each broken link; front matter for a document that lacks it; a paper's version, status and date; a successor, then the move into `docs/archive/`; a new `reviewed` date for a stale document; an `amends` entry for edited evidence; a decision's state; and an AGENTS.md authority row for an orphaned document. Each question offers a default where the checkout suggests one, such as a title built from the root README H1 or `package.json` `name`, or a date from Git. Enter accepts it, `-` skips the question, and Ctrl-D skips the rest. It needs a TTY, exits 1 with a pointer to `--fix` without one, and cannot run with `--json`. `--rules` marks those twelve rules `ask`, or `yes, ask` where `--fix` also repairs them, in the Fix column. The toolchain lists the flag as an experimental surface, so its questions may change on a minor release. An agent's non-interactive shell cannot run it: run `--fix`, then make the remaining edits by hand or hand the command to the owner.

### `xyex plan` (experimental)

Since 9.2.1, `xyex plan init` writes a non-governing `.xy/plan.json` bootstrap, and `xyex plan lint [--fix]` checks a fixed root / `papers/` / `docs/` / `notes/` layout (its root-document rules since 10.0.5) configured by `commands.planLint.rules` (levels only). Neither runs in `xy check`, and `plan lint` is not authoritative for the xy-agent convention. Its layout differs: it requires `papers/WHITE-PAPER.md`, `papers/YELLOW-PAPER.md`, `notes/README.md`, `docs/README.md` and `docs/ROADMAP.md` to exist (only `--fix` writes them, from templates, and never overwrites), while `docs.index-current` requires `docs/README.md` to equal the generated index. Since 10.1.2 its `plan.root.claude-imports-agents` uses agent lint's predicate (the first visible line of `CLAUDE.md` is the import, and notes may follow), but plan lint still requires a regular `CLAUDE.md`, so a symlinked adapter fails it. Do not run `plan lint --fix` in a repo that passes `xy agent lint`. For a repository that follows the xy-product-plan process, [Plan tooling](plan.md) lists the rules that conflict with it, how to turn them off, and how the manifest maps to its roadmap.

## Skills and work tracking

### `xy skills`

`xy skills` wraps the bundled Skills.sh CLI. Only `defaults`, `lint`, and `pick` are XY-specific; `add`, `update`, `list`, `remove`, `find`, and the other subcommands pass through to Skills.sh, so `xy skills --help` prints Skills.sh help. Use `xy skills lint --help`, `xy skills defaults --help`, and (since 10.1.2) `xy skills pick --help` for the XY options.

| Command | Behavior |
|---|---|
| `xy skills defaults [-g] [-a <agent>] [--copy]` | Install every ariestools-skills skill plus the xyo-skills XYO/XL1 stack |
| `xy skills lint [--fix] [--offline] [--strict] [--rules]` | Check required skills, versions, duplicates, and leftover `xy claude` output; runs in `xy check` |
| `xy skills add <source> --skill <name> -y` | Install one skill (passthrough) |
| `xy skills remove <name> -y` | Remove one skill (passthrough) |

Without `-a`, `xy skills defaults` installs ariestools-skills with Skills.sh `--all` (`--skill '*' --agent '*' -y`), which writes into every agent Skills.sh supports, not only the detected ones. Pass `-a <agent>` (for example `-a claude-code codex`) to limit it; it then uses `--skill '*'`. Only `--all` implies `-y`, and the second, xyo-skills step never adds it, so pass `-y` yourself to run without Skills.sh prompts. Either way it installs every skill in ariestools-skills. Since 10.1.4 `xy skills defaults --help` names all six; earlier versions name four, without ariestools-sdk-react and ariestools-actor, but install them too. `xy skills lint` then warns `skills.unnecessary` for each installed catalog skill the repository neither requires nor treats as optional, such as ariestools-sdk in a repository without sdk-js packages and, since 10.1.4, ariestools-sdk-react and ariestools-actor in one without their packages. Remove those with `xy skills remove <name> -y`, or keep one by setting its presence to `allowed`.

`xy skills lint` manages a catalog of thirteen skills (eleven before 10.1.4, without ariestools-sdk-react and ariestools-actor; ten before 10.1.2, without xy-agent; nine before 9.2.0, without xl1-dapp-kit): the six ariestools-skills skills (xy-development, xy-toolchain, xy-agent, ariestools-sdk, ariestools-sdk-react, ariestools-actor), and xyo-knowledge and the six xl1-* skills from xyo-skills. A skill reaches the required set in four ways:

1. **Tier detection.** The lint detects a repo tier from package.json and toolchain signals (unrelated to the package profiles in [project-profiles.md](project-profiles.md)). It also requires ariestools-sdk when the repo produces or uses sdk-js packages and, since 10.0.8, xl1-dapp-kit when it produces or depends on `@xyo-network/dapp-kit` packages. Since 10.1.4 it requires ariestools-sdk-react when a workspace package produces or depends on `@ariestools/sdk-react` or an `@ariestools/sdk-react-*` package, and ariestools-actor for the actor-kit, cli-kit and browser-kit packages: `@ariestools/actor`, `actor-model`, `actor-engine`, `actor-system`, `provider`, `provider-model`, `cli-kit`, `cli-kit-node`, `cli-kit-yargs`, `cli-kit-daemon`, `browser-kit`, `browser-kit-page`, `browser-kit-worker`, `browser-kit-service-worker` and `browser-kit-plugin`. Each of the two also requires ariestools-sdk, which it builds on.

   | Tier | Required | Optional |
   |---|---|---|
   | `xy` | xy-development, xy-toolchain | xy-agent (since 10.1.2) |
   | `xyo` | adds xyo-knowledge | xy-agent (since 10.1.2) |
   | `xl1` | adds xl1-knowledge, xl1-patterns, xl1-testing | xl1-dapp-kit, xl1-scaffold, xl1-build, and xy-agent (since 10.1.2) |

   An optional skill is not required, and an installed one does not count as `skills.unnecessary`. A repo with no detected tier (`none`) has no optional skills, so an installed xy-agent warns there unless config requires or allows it.

2. **`commands.skillsLint.additionalSkills`** (since 10.0.5) lists catalog skills to require regardless of tier. Root and workspace lists are unioned, and unknown names are config errors.
3. **`commands.skillsLint.skills`** (since 10.1.1) sets `{ '<name>': { presence: 'required' | 'allowed' | 'off' } }`. `required` adds the skill. `off` drops a tier requirement; a still-installed skill then warns as `skills.unnecessary`, and `off` never silences `skills.package-recommended`. `allowed` only suppresses `skills.unnecessary`, and the skill is not version-checked.
4. **package.json `xy.skills`** (since 10.0.8) lists `[{ name, source? }]` on workspace packages and direct dependencies. `source` is needed only for a skill outside the catalog. The config loader reads a package.json `xy` key before any xy.config file and stops there, so the key becomes that directory's entire xy config. It hides a sibling xy.config.ts, and in a package without one it also hides the root config from `xy compile`, which then ignores the root `compile` block (see [Configuration](compilation.md#configuration)). Add `xy.skills` only to a package with no xy.config.ts that needs no root compile settings, or repeat those settings, such as `compile: { node: true }`, inside the same package.json `xy` object.

A published package can recommend a skill to the repositories that use it. Skills lint reads `xy.skills` from the installed `package.json` of each direct dependency (in any workspace's `dependencies`, `devDependencies`, or `peerDependencies`), so `"xy": { "skills": [{ "name": "<skill>", "source": "ariestools/ariestools-skills" }] }` makes `skills.package-recommended` require the skill in every repository that depends on the package directly. A skill outside the catalog needs the `source`; a catalog skill always installs from its catalog source, and a differing `source` only warns. Packages from sdk-js need no entry, nor, since 10.1.4, sdk-react, actor-kit, cli-kit and browser-kit packages, because tier detection already requires their skills. In the producer's own repository the key is also that package's entire xy config, so apply the caveat above.

| Rule | Level | Meaning |
|---|---|---|
| `skills.required-installed` | error | Required skills are installed |
| `skills.required-current` | error | Installed required skills match upstream (network; skipped with `--offline`) |
| `skills.migrated-source` | error | xy-development and xy-toolchain come from ariestools-skills, not xyo-skills |
| `skills.package-recommended` | error | Skills named in `xy.skills` are installed |
| `skills.unnecessary` | warn | Installed catalog skills that are not required, optional, `allowed`, or package-recommended |
| `skills.duplicate-install` | warn | Project skills are not also installed globally |
| `skills.legacy-generated` | warn | Leftover `xy claude` skills, rules, and commands are absent (since 10.1.2; fixable) |

`xy skills lint --fix` works in project scope. It installs missing required and package-recommended skills, migrates xyo-skills-sourced xy-development and xy-toolchain installs to ariestools-skills, and updates outdated required skills (migration and updates since 9.2.0). Since 10.1.2, `skills.migrated-source` also reads each installed copy's `SKILL.md`: one with `metadata.status: redirect` (an xyo-skills redirect stub), or, when online, a `metadata.version` ahead of ariestools-skills main, is reported against that file instead of being listed as current, and `--fix` reinstalls it from ariestools-skills.

Since 10.1.2, `skills.legacy-generated` warns for each leftover file from the retired `xy claude` command, in the repository root and each `packages/*` directory: the skills `xylabs-xy-cli`, `xylabs-xy-deplint-fix`, `xylabs-e2e-setup`, and `xylabs-refactor-cohesion` under `.agents/skills` or `.claude/skills`; the generated `.claude/rules/xylabs-*.md` files (a fixed list, plus any other containing the `Auto-managed by` marker); and a fixed list of `.claude/commands/xy-*.md` and `xylabs-*.md` files. `--fix`, including `xy check --fix`, deletes them recursively without listing each one and leaves `skills-lock.json` untouched, so review the lint output first. Rules on the fixed list are reported and deleted even when hand-edited. Other `xylabs-*.md` rules without the marker, and command files not on the list, stay. To remove the files by hand, see [legacy agent files](toolchain.md#legacy-agent-files-from-xy-claude). Other skills outside the catalog are never version-checked, and are reported only when a package.json `xy.skills` entry names one that is missing; remove unwanted ones with `xy skills remove <name> -y`.

Since 10.1.2, xy-agent is a catalog skill from ariestools-skills. To require it, which also version-checks it, name it in `commands.skillsLint.additionalSkills`, set `'xy-agent': { presence: 'required' }` under `commands.skillsLint.skills`, or run `pnpm xy skills pick --skill xy-agent`. A package.json `xy.skills` entry needs no `source` for it. `xy skills defaults` installs it with the rest of ariestools-skills, and `xy repo init --skills-optional` installs it on any tier except `none`, although that flag's help still describes only XL1 skills. On 10.1.1 it is outside the catalog: naming it in `additionalSkills` or `skills` is a config error that makes `xy skills lint` and `xy check` exit 1, and `xy skills pick --skill xy-agent` fails with `Unknown skill` before installing anything. On that version, add it with `pnpm xy skills add ariestools/ariestools-skills --skill xy-agent -y` or list it with its `source` in a package.json `xy.skills` (mind the config caveat above).

Since 10.1.4, ariestools-sdk-react and ariestools-actor are catalog skills too. `pnpm xy skills pick --skill <name>` installs one and records it as required, both `commands.skillsLint` keys accept them, a package.json `xy.skills` entry needs no `source` for them, and lint version-checks a required one. Through 10.1.3 they are outside the catalog: naming one in `additionalSkills` or `skills` is a config error, `xy skills pick` fails with `Unknown skill`, and lint ignores an installed copy. On those versions, add one with `pnpm xy skills add ariestools/ariestools-skills --skill <name> -y`, or list it with its `source` in a package.json `xy.skills` (mind the config caveat above).

`xy skills pick [--skill <name>]...` (since 10.1.1, needs `--skill` without a TTY) installs catalog skills and records each as `required` under `commands.skillsLint.skills`. Record `allowed` or `off` by hand. Since 10.1.2 the prompt table shows configured `allowed` and `off` (`not-needed`) states, and pick merges into the existing config in the current directory:

- It looks for `xy.config.{ts,mts,cts,js,mjs,cjs}`, `.xyrc.json`, and `.xyrc`, and writes a minimal `xy.config.ts` only when none exists. It ignores a package.json `xy` key, which the loader reads first (see the caveat above).
- In a TS or JS config it edits `export default {…}`, else `const config = {…}`, else the first variable initialized with an object literal, keeping comments, other settings, and existing presence entries. Check the diff when the config object is built another way. A JSON config is re-serialized with two-space indentation.
- When it finds no such object literal, as in `export default defineConfig({…})`, it leaves the file unchanged, prints a snippet to paste, and exits 1 after installing the skills.
- It edits only a literal `commands` property. On a config that assigns a hoisted `commands` const (the [untyped command keys](#untyped-command-keys) workaround), it adds a second `commands` key, which TypeScript rejects; inline the object first.

On 10.1.1, pick overwrites the whole `xy.config.ts` when it has no `skills:` text, and otherwise replaces the first `skills:` block with only this run's picks, dropping earlier `allowed` / `off` entries. On that version, edit `commands.skillsLint.skills` by hand and install with `xy skills add`.

### `xyex work` (experimental)

`xy work` stores AI-friendly work items under `.xy/work/` (canonical local storage: `.xy/work/items/*.json`). Prefer it over free-form TODO notes when the repository adopts work tracking. It is experimental: run it as `pnpm xyex work …` (see [channels](#stable-and-experimental-channels)), and expect flags and storage to change on a minor release.

```sh
pnpm xyex work init
pnpm xyex work add bug "Describe the problem" --area deplint --file src/index.ts --line 42 \
  --acceptance "Reproduction passes" --verify "pnpm xy build" --impact 4 --urgency 2
pnpm xyex work list --status open --sort priority
pnpm xyex work list --all
pnpm xyex work sync
pnpm xyex work triage
pnpm xyex work queue --limit 10
pnpm xyex work next --claim
pnpm xyex work done <id> --evidence "pnpm xy build passed"
pnpm xyex work update <id> --status blocked --blocked-reason "…"
pnpm xyex work lint
```

| Command | Purpose |
|---|---|
| `work init` | Create the repo-local work store and config |
| `work add <type> <title>` | Capture a bug, todo, feature, idea, debt, research, question, or risk |
| `work list` | List local items; filter with `--status` and `--type`, order with `--sort created\|priority` |
| `work list --all` | Also list open GitHub issues **not** created by `xy work`, normalized as `GH-<number>` |
| `work sync` | Bidirectional reconcile of local items and GitHub Issues when available |
| `work triage` | List open items missing triage fields |
| `work queue` / `next` | Build a priority-sorted queue (`--name`, `--limit`, `--status`) and show its next item |
| `work claim` / `update` / `done` / `show` | Lifecycle operations; `done` requires `--evidence` |
| `work move <id> --to <folder>` | Move an item between multi-root workspace folder repos |
| `work lint` | Store health (gitignore, GitHub availability, sync drift) |

`add` and `update` take the triage fields `--description`, `--area`, `--tag`, `--acceptance`, `--verify` (the last three repeatable), and `--impact` / `--urgency` / `--effort` / `--risk` / `--confidence` (each 1–5). On `add`, setting any one priority flag gives the item a priority, and each priority field you leave out is stored as 3. Only `add` takes the anchor flags `--file`, `--line`, and `--inline`. An open item missing area, priority, acceptance criteria, or verification is under-triaged and shows in `work triage`.

Choose the type by intent: `bug` (existing behavior is wrong), `todo` (known concrete work), `feature` (new capability), `idea` (speculative, no acceptance criteria yet), `debt` (internal cleanup), `research` (investigation before implementation), `question` (unresolved decision), or `risk` (known risk to track).

Record verification evidence when completing an item. Do not initialize work tracking merely because the command exists; follow repository policy.

**Claiming is not atomic.** `claim` overwrites the item with a timestamp; there is no lock or lease. Use `claim` and `next --claim` only in single-agent, single-worktree flows. Across worktrees or concurrent agents, queue work instead.

For machine-generated items, such as audit findings:

- **Get consent before the first `work` command.** In a repository with no `.xy/work/config.json`, any `work` command (`list` included) creates the store with GitHub dual-write on. From then on, each new item opens a real issue whenever `gh` is authenticated, or at the next `work sync` if it was not. GitHub dual-write has no per-item opt-out. The only switch is `stores.github.enabled: false`, which is repo-wide and also stops `work sync`, so it is the operator's call.
- **Deduplicate by anchor and tag, not by id.** Ids are a date plus a random suffix, generated fresh on every call. `work add` has no `--id` flag, and `@ariestools/toolchain` ships no runtime API to pass one. Anchor each item with `--file` and give the batch a fixed `--tag`. Before adding, look in `pnpm xyex work list --json` for an item whose `anchors[].path` and `tags` match, and run `pnpm xyex work update <id>` on it instead of adding a second one.
- **Supply the triage fields** (area, priority, acceptance criteria, verification) so the items do not drown `work triage`.
- **Close the loop.** `work done <id> --evidence …` and `work update <id> --status wontfix` change only the local item. Run `work sync` to close the linked GitHub issue.

| Lint rule | Level | Meaning |
|---|---|---|
| `work.store-not-gitignored` | error | `.xy/work` is tracked; ignore only `**/.xy/cache/`, never `.xy` |
| `work.github-available` | warn | GitHub Issues are reachable when dual-write is enabled |
| `work.github-synced` | warn | Local items and GitHub Issues are in sync |

Set levels under `commands.workLint.rules`. A typed `XyConfig` accepts that key since 10.1.2; before that, use the [untyped command keys](#untyped-command-keys) workaround.

#### GitHub Issues integration

When `stores.github.enabled` is true (the default for new stores) and the GitHub CLI (`gh`) is installed, authenticated, and the repo has a GitHub remote:

- **`work add`** dual-writes a GitHub issue marked as created by `xy work`:
  - label: `xy-work`
  - body marker: `<!-- xy-work: <id> -->`
  - footer noting creation by the `xy work` tool
  - link stored on the local item under `stores.github` (`number`, `url`, `createdByXyWork: true`)
- If GitHub is unavailable or create fails, the local item is still written.
- **`work list --all`** includes open external GitHub issues (no `xy-work` label/marker, not already linked) as normalized `GH-<number>` rows for display; type is inferred from labels when possible.
- Only `work add` and `work move` write to GitHub immediately. `work update`, `claim`, and `done` change the local item only; run `work sync` afterwards.
- **`work sync`** reconciles when available:
  - Local active items without a GitHub link → create a marked issue
  - GitHub issues not present locally → import (`XYW-…` id when marked, else `GH-<number>`)
  - Linked pairs: newer title wins; local `done`/`wontfix` closes the issue; closed GitHub issues mark local done
  - Since 10.1.0, sync edits or closes a GitHub issue only when its body marker and stored URL match the local item. Since 10.2.2, the issue must also retain the `xy-work` label; a marker without that label is not attached to an existing local item.
  - Since 10.1.3, sync pushes the rendered body to every issue `xy work` owns whenever it differs, and the local item always wins: edits made to that issue body on GitHub are overwritten. `work.github-synced` reports the body drift. Change the item locally, then sync.
- Since 10.1.3, `work update` changes only the priority fields you pass (earlier versions reset the others to 3), and `--blocked-reason ""` clears the reason.

Disable dual-write and sync in `.xy/work/config.json`:

```json
{
  "stores": {
    "github": { "enabled": false }
  }
}
```

Use inline source markers only as anchors (`// xy-work: <id>`, or `<!-- xy-work: <id> -->` in Markdown and HTML, which `--inline` inserts); keep priority, acceptance, and verification on the work item.

#### Multi-folder editor workspaces

When several git repos are open together (for example `GitHub.code-workspace`), work subcommands accept scope flags:

| Flag | Behavior |
|---|---|
| `--workspace` | Operate across folders in the active/local `*.code-workspace` |
| `--workspace-file <path>` | Explicit workspace file (implies `--workspace`) |
| `--repo <name>` | Limit or target a single workspace folder by name |

```sh
pnpm xyex work list --workspace
pnpm xyex work list --workspace --repo toolchain
pnpm xyex work move XYW-20260724-A145D1 --to sdk-js --from toolchain
```

`work move` relocates a work item between workspace folder repos. Use `--from` when the id is ambiguous across folders. Do not invent cross-repo moves without an actual multi-root workspace layout.

## Clean

### `xy clean [package]`

Remove build artifacts (`dist`, `build`, and configured patterns). Array fields in config cascade (union) from root to package.

| Flag | Behavior |
|---|---|
| *(default)* | Clean built-in and configured patterns, subject to safety rules and excludes |
| `--full` | Also remove all gitignored files under each package (fresh-clone hygiene); still honors `commands.clean.exclude` and default excludes such as `node_modules` |
| `--full-all` | Like `--full`, but also ignores `exclude` / default excludes; only `.git` remains protected |
| `--rules` | List the clean rules and their effective levels |

Configure under `commands.clean` in `xy.config.ts`:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    clean: {
      patterns: ['coverage', '.turbo'],
      include: ['tmp/**'],
      exclude: ['.cache'],
      rules: {
        'clean.gitignored-only': 'error', // default: only delete gitignored matches for configured patterns
        'clean.gitignored-all': 'off', // default: off; enable to wipe every gitignored path under the package
      },
    },
  },
}

export default config
```

- `patterns` — extra package-relative globs beyond builtins.
- `include` — always cleaned; bypasses `clean.gitignored-only`, still subject to hard safety and `exclude`.
- `exclude` — never cleaned (plus immutable `.git` and default `node_modules` excludes).
- Hard rules `clean.inside-root` and `clean.relative-pattern` always apply and cannot be turned off. Since 10.2.2, containment follows real filesystem paths and clean skips symlink targets, including paths that escape through a symlinked directory.

Prefer `xy clean` over ad-hoc `rm -rf dist`. Use `--full` only when you intend fresh-clone hygiene; use `--full-all` only when you intentionally want to delete excluded trees such as `node_modules` under packages.

## Releasing (owner-directed)

Check the repository's release workflow first; release-please or CI may own versioning and publishing. Run these commands only when the owner directs it.

| Command | Behavior |
|---|---|
| `xy deploy [patch\|minor\|major\|prerelease]` | Bump every lockstep package (default `patch`), run `xy clean` and `xy build`, then apply the version |
| `xy publish [--tag <dist-tag>] [--chunk-size <n>]` | Publish workspaces to npm; `--chunk-size` is pnpm-only, and each chunk triggers its own 2FA prompt |

Publish prereleases under an explicit dist-tag (`pnpm xy publish --tag next`, since 9.2.0) so `latest` stays on stable cuts. Since 10.1.1, both commands ignore a same-named root `package.json` script and run the toolchain implementation unless `--defer` is passed (see [Global flags](#global-flags)). A repo whose root `deploy` script does something else, such as a hosting deploy, must pass `--defer` or run that script directly.

## Dependency maintenance and utilities

| Command | Behavior |
|---|---|
| `xy install` | Install with the detected package manager |
| `xy reinstall` | **Destructive:** delete `node_modules` and lockfiles (`packman clean`), then install |
| `xy up` | Report outdated dependencies |
| `xy updo [--latest] [--next] [--risk green\|yellow\|red]` | Update dependencies interactively; never offers `typescript` past major 6 |
| `xy gitignore` | **Destructive:** regenerate the root `.gitignore` and delete package `.gitignore` files |
| `xy npmignore-gen` | Generate `.npmignore` files |
| `xy statics` | Report singleton dependencies (such as `react`) installed in more than one version; fails only under `--strict` |
| `xy copy-assets [package]` | Copy assets from `src` to `dist` |

Since 10.1.1, `commands.updo.ignoreDeps` keeps declarations out of the updo chooser, for example `updo: { ignoreDeps: ['satori', '@vendor/*'] }`:

- Entries are exact `package.json` keys or positive globs; an `npm:` alias matches by its alias key.
- Root and package lists add together.
- Matching declarations are never rewritten, but the installed tree is not pinned.
- updo ignores pnpm's `update.ignoreDeps`; pnpm's `minimumReleaseAge` still filters candidate versions.
- An invalid entry (a negation, an empty string, or a non-array) fails before any manifest is written.

## Configuration and automation

Put rule levels and command settings under `commands` in `xy.config.ts`:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    deplint: {
      classifier: 'aei',
      rules: {
        'dep.workspace.protocol': 'error',
      },
    },
    publint: {
      rules: {
        'pub.sideEffects': 'error',
      },
    },
  },
}

export default config
```

The default `dep.workspace.protocol` is `workspace:~`. The rule also accepts a `protocol` option (`'workspace:*' | 'workspace:^' | 'workspace:~'`), but a typed `XyConfig` rejects the `[level, { protocol }]` form with TS2322 (through 10.2.0), so set only the level.

| Key | Fields (defaults) |
|---|---|
| `commands.deplint` | See [`xy deplint`](#xy-deplint-package) |
| `commands.publint` | `include` or `exclude` check names, `pack` (`true`), `rules` keyed `pub.<check>`. `publint: false` type-checks but is ignored; turn checks off with `rules` or `exclude` |
| `commands.apiExposure` | `packages[name].classification`, `peerForwarding` (`'when-exposed'`, or `'always'` / `'when-used'`), `peerWithDefault` (`false`), `rules`, `thresholds` (39 / 79 / 119 / 179), `treeShaking` (`true`). Deplint also reads it under `aei` / `aei-next` |
| `commands.license` | `allow` (added to the defaults), `allowOnly` (replaces them), `deny`, `ignorePackages` (`name` or `name@version`) |
| `commands.packman` | `minimumReleaseAge` (minutes, `1440`), `minimumReleaseAgeExclude`. The lint requires exactly the `@ariestools/*`, `@xylabs/*`, and `@xyo-network/*` scopes the repo uses |
| `commands.repoLint` / `commands.nodeLint` | `nodeTrack` (`'current'` or `'lts'`, since 10.0.7), `rules` |
| `commands.agentLint` | `rules`, levels only (since 10.1.1). Since 10.1.2, declaring the key at all also makes `xy check` run agent lint |
| `commands.skillsLint` | `additionalSkills` (since 10.0.5), `skills` presence map (since 10.1.1), `rules` |
| `commands.updo` | `ignoreDeps` (since 10.1.1) |
| `commands.dependabot` | `rules`; see [`xy license` and `xy secure`](#xy-license-and-xy-secure). In a typed `XyConfig` since 10.1.2 |
| `commands.clean` | See [Clean](#clean) |
| `commands.dead`, `commands.workLint`, `commands.planLint`, `commands.npmOrgLint` | Experimental-command settings; may change on a minor release. `commands.workLint` is in a typed `XyConfig` since 10.1.2 |

Inspect the installed catalog before inventing rule IDs:

```sh
pnpm xy --rules
pnpm xy deplint --rules --json
pnpm xy check --rules
```

Validate every fixer with three checks: the finding appears before the fix, `--fix` makes the intended scoped edit, and a second non-fix run is clean.

### Untyped command keys

Since 10.1.2, `CommandsConfig` types `dependabot` and `workLint`: write them inline and skip this section, which also keeps `xy skills pick` able to edit the config. Before 10.1.2, `CommandsConfig` has neither key, so a literal `commands: { dependabot: … }` in a typed `XyConfig` fails with TS2353 (and breaks package type validation when `xy.config.ts` sits inside a package tsconfig). The runtime still reads both. Hoist the whole `commands` object into a const that keeps at least one typed key (for example `deplint: {}`) and assign it. A non-literal object is not excess-property checked. Do not spread an inline literal: `unicorn/no-useless-spread` errors on it, and its autofix restores the TS2353 form.

```ts
const commands = {
  deplint: {},
  dependabot: { rules: { 'dependabot.high': 'error' as const } },
}

const config: XyConfig = { commands }
```
