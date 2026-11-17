# Project Profiles

## Contents

- [Classify independent axes](#classify-independent-axes)
- [Select the profile](#select-the-profile)
- [Apply common profiles](#apply-common-profiles)
- [Package roles and dependency policy](#package-roles-and-dependency-policy)
- [Handle repository topology](#handle-repository-topology)
- [Choose the production build owner](#choose-the-production-build-owner)
- [Verify the selected profile](#verify-the-selected-profile)

## Classify independent axes

Classify each package before choosing configs or commands. Do not infer one axis from another:

| Axis | Choices | Governs |
|---|---|---|
| Consumption / role | Library, library/CLI, CLI, service, app, workspace-root, tooling | Dependency placement, peer promotion, and prod-install expectations |
| Visibility | Private, restricted, or public | Publish access, and which siblings and specs a public package may depend on |
| Runtime | Neutral, Node, or browser | TypeScript libraries, compile target, and platform checks |
| Framework | React or non-React | React TypeScript, ESLint, and test support |
| Topology | Single-package or monorepo | Configuration placement and command orchestration |
| Output owner | `xy compile` or framework build | Which command produces deployable or publishable output |

Use **library** when another package imports the package's public API. Use a **terminal product role** (`cli`, `service`, `app`, `tooling`) for a final application, service, website, worker, or self-contained CLI that no consumer imports. A package with both `bin` and an importable public API is **library/CLI**, so apply library dependency rules to its public surface.

Derive **visibility** from `package.json`: `private: true` is private; otherwise `publishConfig.access` decides; without it, a scoped name is restricted (npm's default) and an unscoped name is public.

Treat **React as a browser framework**, not as a fourth compile platform. A React package still chooses browser or, less commonly, neutral/Node runtime behavior based on the code it ships.

## Select the profile

Use this order:

1. Ask whether a consumer imports the package. Classify it as library, library/CLI, or a terminal product role.
2. Identify the runtime APIs used by shipped code: environment-neutral, Node, or browser/DOM.
3. Add the React layer only when the package contains React components or an application rendered with React.
4. Identify whether the package is independently publishable, deployable, or only a private workspace orchestrator. Record the visibility of every publishable package.
5. Decide whether the toolchain emits the production package or a framework such as Vite or Next.js owns the build.
6. In a monorepo, repeat this classification for every workspace package. Do not assign one profile to the entire repository merely because the root has one runtime.

## Apply common profiles

| Profile | TypeScript | ESLint | Output | Dependency and policy emphasis |
|---|---|---|---|---|
| Neutral library | `@ariestools/tsconfig` + optional `@ariestools/lib-neutral` types | Non-React flat config | Default neutral target | Run `publint`, `deplint`, and API-exposure analysis; keep Node and DOM globals out |
| Node library | Base config plus explicit Node types | Non-React flat config | `compile.node: true` | Validate Node exports and consumer dependency/peer contracts |
| Browser library | `@ariestools/tsconfig-dom` | Non-React flat config | `compile.browser: true` | Validate browser portability and publish surface |
| React component library | `@ariestools/tsconfig-react` | React flat config | Usually `compile.browser: true` | Treat React/runtime contracts as library dependency decisions; validate packed exports |
| Node server or worker | Base config plus explicit Node types | Non-React flat config | Node output or deployment framework | Role `service`; keep runtime requirements in `dependencies` (prod install matters) |
| CLI-only package | Base config plus explicit Node types | Non-React flat config | Node output; bundle only when intentional | Declare `bin`; role `cli` unless it also exposes an importable API (`library/cli`) |
| Browser website | `@ariestools/tsconfig-dom` | Non-React flat config | Browser framework/bundler | Usually private role `app`; do not require a library export map |
| React website | `@ariestools/tsconfig-react` | React flat config | React framework/bundler | Usually private role `app`; run DOM/browser tests only where browser APIs are required |

Follow [typescript.md](typescript.md) for the exact config packages, explicit Node types, and `@ariestools/lib-neutral`. Follow [eslint.md](eslint.md) for the active flat-config packages and tiers. Follow [compilation.md](compilation.md) for target opt-in semantics and output modes.

Do not add Node types to neutral or browser packages to silence errors from a misplaced config or test. Do not add DOM types to neutral or Node libraries merely because another workspace contains a website. For neutral packages that need timers or `AbortController`, use `@ariestools/lib-neutral` rather than `@types/node`.

Choose the Vitest environment per test suite, not from the package label alone. Prefer `@ariestools/vitest-config` in both layouts (`spec/`, `spec/node/`, `spec/browser/` routing); its default include targets `packages/*`, so a single-package repo passes an explicit `include`. Use Node for logic tests and a DOM or browser environment only for tests that render or access browser APIs. Place every `.spec.ts` under any `spec/` directory at any depth as described in [testing.md](testing.md).

## Package roles and dependency policy

Use package roles only for dependency-policy behavior. They do not select a compile target or open an interactive shell.

Deplint auto-detects a **role** and derives policy **facets**. Progress output labels the effective role (`library`, `library/cli`, `cli`, `service`, `app`, `workspace-root`, `tooling`). Legacy labels `terminal[cli]` / `terminal[private]` are no longer used; they map to `cli` and to `service` / `app` / `workspace-root` / `tooling` respectively.

**Auto-detect order** (first match wins; an explicit `commands.deplint.role` skips detection):

1. `workspace-root`: the package directory has a `workspaces` field or a `pnpm-workspace.yaml` / `.yml`, and no library or `bin` surface.
2. `library`, or `library/cli` with `bin`: `main`, `module`, or `exports`. With `bin`, only `main`, `module`, or an export subpath other than `.`, `./package.json`, and `./README.md` counts.
3. `cli`: `bin` without that surface, including a bin package whose only export is `.` or whose `exports` is a string.
4. `service`: `private` with a `start`, `start:prod`, `start:production`, `start:node`, or `serve` script that runs a local file with `node`, `tsx`, or `ts-node`.
5. `app`: `private` with `vite`, `vite-node`, `next`, `nuxt`, `@sveltejs/kit`, `@remix-run/dev`, or `react-scripts` in `dependencies` or `devDependencies`.
6. `service`: any other `private` package (fails open for prod installs).
7. `library`: everything else.

`tooling` is never auto-detected. A `bin` package whose `.` export is a real importable API is detected as `cli`; set `role: 'library/cli'` so library peer rules apply.

| Role | Typical meaning | Key policy |
|---|---|---|
| `library` | Importable package | Peer promotion / AEI may apply to external runtime deps |
| `library/cli` | `bin` plus importable library | Library peer rules + CLI prod install for the bin surface |
| `cli` | Terminal CLI product | Runtime deps stay in `dependencies` when the graph is trusted |
| `service` | Long-running Node process (`scripts.start` → JS entry) | **Prod install matters** — do not demote real runtime deps to `devDependencies` |
| `app` | Frontend or full-stack app (Vite/Next/etc.) | Framework runtime in `dependencies`; test-only tooling moves to dev only once `runtimeRoots` (e.g. `src/main.tsx`) declares the entry |
| `workspace-root` | Workspace-marker directory with no library or `bin` surface: a monorepo root, or a single-package repo root with no explicit role | No runtime graph; aggressive demotion, almost nothing belongs in `dependencies` |
| `tooling` | Generators, codemods, internal bins (set explicitly) | No runtime graph by default, so deps demote; a tool run from its own prod install also sets `prodInstallMatters: true, runtimeEntry: 'manifest'` |

**Trusted runtime graph:** `prodInstallMatters` defaults to true for `service`, `cli`, `library/cli`, and `app`. For those roles, `move-to-dev` is allowed only when declared runtime roots exist: manifest entries (`exports`, `main`, `module`, `types`, `bin`), start-script entries, or `runtimeRoots`. Trust comes from the declared paths, not from files found on disk, and framework entries are not auto-discovered (`runtimeEntry: 'framework'` currently means manifest plus start scripts), so a typical Vite or Next app gets no demotion until `runtimeRoots` is set. When the graph is untrusted, deplint keeps ambiguous deps in `dependencies` rather than breaking `pnpm install --prod` or Docker slim images.

**Private is not terminal:** `private: true` alone does not make a package a service. A private workspace package with a real `main` / `exports` surface is still a **library**.

Set an explicit role when metadata cannot express the product shape:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    deplint: {
      role: 'service',
      runtimeRoots: ['src/index.ts'],
      // Facet overrides, only when one role default is wrong:
      // hasImportConsumers: false,
      // prodInstallMatters: true,
      // runtimeEntry: 'scripts', // 'manifest' | 'scripts' | 'framework' | 'none'
      // allowMoveToDev: true,
      // peerTarget: 'dep', // 'peer' | 'dep' | 'none'
    },
  },
  compile: {
    node: true,
  },
}

export default config
```

`runtimeRoots` are package-relative and count as declared even when the file is missing, so point them at files that exist. A source entry such as `src/index.ts` works before a build; a `dist/` path must match the enabled compile target (`compile.node: true` emits `dist/node/`, not `dist/neutral/`).

`commands.deplint.terminal: true` remains as a deprecated convenience that forces non-library (terminal-equivalent) facets. Prefer `role`. Put role overrides in the **package's** `xy.config.ts`, not at a mixed-monorepo root, because root command configuration cascades. A package xy.config.ts also replaces the root `compile` block for that package, because compile reads only the nearest config (see [Configuration](compilation.md#configuration)). Copy any root compile settings, such as `compile.node`, into it.

Services, CLIs, and apps keep runtime requirements in `dependencies`; consumers cannot satisfy a peer contract for an application they never import. Libraries require a deliberate dependency-versus-peer decision. Use `xy api-exposure` as evidence, then configure exceptional dependencies with `commands.deplint.packages` placement and presence (or `xy deplint pick`) as described in [commands.md](commands.md) rather than forcing the whole package into the wrong role.

## Handle repository topology

### Single-package repository

Treat the repository root as the package:

1. Keep `package.json`, `xy.config.ts`, TypeScript, ESLint, and Vitest configuration at the root unless the framework requires a narrower location.
2. Use `@ariestools/vitest-config` with an explicit `include`, such as `['src/**/spec/**/*.spec.{ts,tsx,mts,cts}']`; the default include matches nothing outside `packages/*`. See [testing.md](testing.md).
3. If the root package has no `main` / `module` / `exports` and no `bin` (a typical service, app, or tooling repo), set `commands.deplint.role` in the root `xy.config.ts`, for example `{ role: 'service', runtimeRoots: ['src/index.ts'] }`. Otherwise deplint detects `workspace-root`, because every pnpm repo keeps a `pnpm-workspace.yaml` (packman lint requires it), and `xy fix` / `xy deplint --fix` then demotes real runtime dependencies to `devDependencies`, breaking prod and Docker installs.
4. Run the repository's root scripts for normal validation.
5. Use `xy` package arguments only when they provide a useful targeted diagnostic; do not assume workspace filtering is required.
6. Apply publish gates only when the root package is actually published.

### Monorepo

Treat the root as orchestration and each workspace as an independently classified package:

1. Keep shared defaults at the root and package-specific exceptions beside the affected package.
2. Run root `xy` commands to discover workspaces, order dependent compilation, apply concurrency, and aggregate diagnostics.
3. Use a package name or path for targeted work, then rerun the required root gate when changes can affect dependents.
4. Let neutral libraries, Node services, CLIs, browser libraries, and React applications coexist; give each its own TypeScript and compile settings.
5. Keep workspace-internal runtime packages in `dependencies`; do not convert them mechanically to peers. A public package may depend only on public siblings: give each sibling `publishConfig.access: 'public'`, or bundle private implementations with [vendor mode](compilation.md#vendor-mode). `dep.dependencies.not-public` and `dep.peerDependencies.not-public` (since 10.0.3) are errors with no auto-fix; in a public package they also reject non-registry specs such as `file:`, `link:`, `catalog:`, or git URLs, and names not published on npmjs.
6. Avoid applying role, Node, DOM, or React settings at the root when only some workspaces need them.
7. Use a root `@ariestools/vitest-config`, whose default include already targets `packages/*` specs; add package-level Vitest config only when a workspace deliberately diverges.

A monorepo root without a library or `bin` surface is detected as `workspace-root`, but `private: true` on the root does not make every child workspace a service or app. Classification and package-level configuration still apply per workspace.

## Choose the production build owner

Use `xy compile` to emit publishable library output and packages whose supported toolchain compile mode owns the artifact. Select neutral, Node, or browser targets explicitly as described in [compilation.md](compilation.md).

Keep a framework's production build when the framework owns application bundling, routing, assets, server rendering, or deployment metadata. For example, retain `vite build` or `next build` for a website instead of replacing it mechanically with `xy compile`. Continue using applicable `xy` commands for linting, dependency policy, repository policy, tests, and any workspace libraries built by the toolchain.

Do not assume the script named `build` must invoke `xy build`. Inspect the existing script and distinguish:

- Toolchain package build: compile plus package policy checks.
- Framework application build: application type-check/bundle/deployment output.
- Repository aggregate build: orchestration across both kinds of workspaces.

## Verify the selected profile

Run this after a toolchain configuration change: a profile, compile target, ESLint config, package role, or export map. An ordinary source change uses the [Definition of Done](../xy-development/workflow.md#definition-of-done).

1. From the repository root, run `pnpm xy build <package>`. That covers compile, publint, deplint, and ESLint. Use `--strict` when this configuration change must fail on warnings.
2. Run `pnpm xy test <package>`. `xy build` does not include tests.
3. Run `pnpm xy check`. A configuration change is repository policy.
4. For published packages, inspect the packed artifact and test it from a clean consumer when export or dependency behavior changed.

Interpret failures through the selected profile. A peer-placement warning may mean a service or app was misclassified as a library; demoting runtime deps on a service or app may mean it was detected as `workspace-root` or its runtime graph is wrong; a Node-global error may mean a browser or neutral package inherited Node types; missing website output may mean the framework build was replaced by a library compiler.
