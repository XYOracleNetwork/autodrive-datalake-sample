# Compilation and Package Output

## Contents

- [Configuration](#configuration)
- [Target selection](#target-selection)
- [Compile modes](#compile-modes)
- [Type validation](#type-validation)
  - [Native compiler (experimental)](#native-compiler-experimental)
- [Monolith mode](#monolith-mode)
- [Vendor mode](#vendor-mode)
- [Troubleshooting](#troubleshooting)

## Configuration

Create `xy.config.ts` and type it from the active toolchain:

```ts
import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  compile: {
    mode: 'library',
  },
}

export default config
```

Root and package configs combine differently by section:

- `commands.*` settings cascade. Root and package configs merge: arrays concatenate, maps merge, and `rules` entries replace per rule id. Put command-specific settings under `commands` rather than deprecated top-level `deplint` or `publint` fields.
- `compile` does not merge. Each package compiles with the nearest `xy.config` file, so a package `xy.config.ts` replaces the root `compile` block entirely, even when it holds only `commands`. A package without one uses the root file. Repeat shared compile fields such as `compiler` in every package config that exists.
- Set `compile.validator` at the root only; it is read from the root config.

`dev` (including `dev.compile` and `dev.build.*`), `compile.bundleTypes`, and `compile.outDirAsBuildDir` type-check, but no `xy` command reads them; put compile settings under `compile`. Top-level `liveShare` and `dynamicShare` are not read by `xy` either, but they are pass-through settings for `@xylabs/meta-server`; do not remove them as dead config.

## Target selection

Compile targets use opt-in semantics:

- If no target is enabled and `neutral` is unset, build `neutral`. `neutral: false` with no other target builds nothing.
- Enable a target with `true` or a source-directory map such as `{ src: {} }` or `{ src: { entry: [...] } }`. The keys are source directories, not esbuild options: `node: { minify: true }` enables node, turns neutral off, finds no `minify/` directory, and silently emits nothing.
- Omit a target or set it to `false` to disable it.
- Treat `{}` as disabled and deprecated. An object holding only the legacy `esbuildOptions` key is also disabled.
- Once any target is enabled, every unlisted target is off.

Examples:

```ts
// neutral only (default)
const neutral: XyConfig = { compile: {} }

// node only
const node: XyConfig = { compile: { node: true } }

// node and neutral
const nodeAndNeutral: XyConfig = {
  compile: { node: true, neutral: true },
}
```

Expect platform output under `dist/neutral`, `dist/node`, or `dist/browser`.

Use `entryMode` deliberately. Entries are relative to each source directory:

- `single` (default) builds `index.ts`.
- `all` builds every source file except specs, stories, and `.d.ts` files; it is the default for `transpile`.
- `platform` builds `index-node.ts` and `index-browser.ts`.
- `custom` starts empty and builds only each source directory's `entry` list, given as strings or `{ in, out }` objects.
- `auto` currently behaves like `single`; do not use it.

```ts
const custom: XyConfig = {
  compile: {
    entryMode: 'custom',
    node: { src: { entry: ['index-node.ts', { in: 'worker/w.ts', out: 'worker' }] } },
  },
}
```

In other modes, string `entry` items are added to the mode's defaults, and an `{ in, out }` item throws. Monolith mode computes its own entries and rejects `compile.entryMode` and any target `entry`.

## Compile modes

`xy compile` emits JavaScript with esbuild (bundled ESM `.mjs` with sourcemaps, `target: 'esnext'`) and declarations with tsc, or with the [native compiler](#native-compiler-experimental) when enabled. Do not describe the current compiler as tsup or as a dual `dist/esm` and `dist/cjs` pipeline. Put esbuild overrides in `compile.esbuild.options` (shared) or a source-directory map (per directory). Since 10.2.2, `compile.tsup`, the compile `outDir` alias, `XyTsupConfig`, `PackageCompileTsupConfig`, `packageCompileTsup`, and `tsupOptions` are removed. Migrate shared options to `compile.esbuild.options`, use esbuild's lowercase `outdir`, and use `XyConfig` or `XyEsbuildConfig`. `tsup.config.*` no longer affects incremental hashes. Pass one `format` (`'esm'`, `'cjs'`, or `'iife'`); a multi-format array throws.

Every configured source directory, entry, `outdir`, `outfile`, and `inject` path must resolve inside the package directory, or compile throws (since 10.1.0). Since 10.2.2 this check follows real filesystem paths, so a symlink cannot escape the package; it also covers custom output names, `entryNames`, `chunkNames`, `assetNames`, `nodePaths`, path-valued aliases, and `stdin.resolveDir`. The compiler owns `absWorkingDir`, `entryPoints`, `outbase`, and `tsconfig`; supply entries through the target's source-directory map instead. Function-form `outExtension` is ignored with a warning; use an object such as `{ '.js': '.mjs' }`.

| Mode | Use when |
|---|---|
| `library` | Publishing normal package entries while keeping npm dependencies external; this is the default |
| `bundle` | Intentionally inlining npm or workspace packages into the output |
| `transpile` | Emitting one output per source file without rolling up the import graph; defaults `entryMode` to `all` |
| `monolith` | Publishing many logical modules from one physical package with generated internal aliases and subpaths; `@ariestools/sdk` uses it |
| `vendor` | Publishing one umbrella package that physically incorporates precompiled private workspace packages |

Configure bundle selection through `compile.bundlePackages` (`all`, `workspace`, `scopes`, and `external`). `library` mode honors it to inline only selected packages, and `transpile` ignores it. `mode: 'bundle'` with no `all`, `workspace`, or `scopes` rule inlines every npm package, so pair `bundle` with explicit `scopes`, `workspace`, or `external`. Avoid bundling dependencies accidentally merely to silence resolution errors.

Since 10.2.2 selected-package bundling uses an esbuild resolver plugin, composed with user plugins; preserve that composition when customizing the build.

`mode: 'tsc'` is reserved in the public type but is not wired into compilation; the compile fails on it (since 9.2.0). Do not recommend it as an operational mode.

## Type validation

`xy compile` runs a no-emit TypeScript validation pass over the full package, including specs, stories, configs, and Storybook files, as a phase separate from emit. The order depends on scope:

- A single-package compile (`xy compile <pkg>`) validates, then emits. Monolith mode syncs the layout first.
- A workspace `xy compile`, `xy build`, or `xy rebuild` emits every package first, in dependency order (`dependencies` and `devDependencies`) with `--emit-only`, then validates each package with `--validate-only` or runs the shared host once. Emit skips full validation, but declaration emit still type-checks each source folder, so source type errors still fail emit and stop dependents. A workspace compile that fails validation can leave fresh `dist` output.
- A workspace `xy recompile` cleans, then runs each package's full compile in dependency order. With the shared validator, packages emit only and one shared validation follows.

A successful raw `tsc` validation is therefore not proof that package emission or publish checks pass. Since 10.2.2 compile resolves the chosen TypeScript package explicitly and fails when it is unavailable; it no longer falls back to whichever `tsc` is on `PATH`.

Use these controls narrowly:

- `compile.validate: false` skips full validation; treat it as a temporary migration escape hatch. A single-package compile then still type-checks each source folder before emit, while a workspace compile skips that package's validate phase.
- `package-compile --validate-only` validates without emitting.
- `package-compile --emit-only` emits without the package validation pass.
- `compile.validator: 'per-package'` uses one TypeScript process per package and is the default.
- `compile.validator: 'shared'` uses the experimental shared-host validator for an all-workspace compile. With `compile.compiler: 'native'` it falls back to per-package validation with a warning.
- `xy compile --validator shared` and `xy recompile --validator shared` override the root setting for that run.
- `pnpm xyex tsc-validate [package]` runs the shared-host engine on its own as a type-check-only pass. It respects `compile.validate: false` and skips packages without a `tsconfig.json`.

Single-package compilation always validates in the package rather than using the shared-host path.

### Native compiler (experimental)

`compile.compiler` selects the TypeScript that runs type-check and declaration emit: `'typescript'` (default) or `'native'`, the TypeScript 7 Go compiler. The native compiler exports no compiler API, so it is installed beside the JS `typescript` package, not instead of it. ESLint, deplint, dead, and api-exposure still load `typescript`, which stays within the toolchain peer range (`^5.9 || ^6.0`). Compile resolves the native compiler from the package under the alias `typescript-native` (`"typescript-native": "npm:typescript@~7.0.2"`); `compile.nativePackage` changes the alias name.

Enable it with `pnpm xyex enable ts-native [--no-install]` (since 9.0.2; before 9.2.0, when `xyex` was added, run it as `pnpm xy enable ts-native`). The command adds the alias devDependency, sets `compile.compiler: 'native'` in the root config, and removes `compile.validator: 'shared'`. It does not edit package configs, so add `compiler: 'native'` to every package `xy.config.ts` that exists (see [Configuration](#configuration)).

The setting is experimental, and shared examples must not require it. When a repository already sets it, keep it.

## Monolith mode

Use monolith mode when one published package hosts logical modules under `src/modules/<name>` and must expose stable subpaths without maintaining many publishable packages. `@ariestools/sdk` is built this way: `packages/sdk/xy.config.ts` in ariestools/sdk-js is the full reference, and `packages/sdk-react-core/xy.config.ts` in ariestools/sdk-react is the browser and React reference.

Configure `compile.monolith`:

| Option | Default | Purpose |
|---|---|---|
| `modules` | required | One entry per `src/modules/<name>` |
| `platforms` | `['neutral', 'node', 'browser']` | Platforms that build at least the master barrel |
| `modulesPlatform` | `'neutral'` | Platform that hosts the module subpath entries; `'browser'` for React packages |
| `moduleLinkage` | `'bundle'` | `'external'` keeps `#module` imports at runtime so each module has one bundle per platform |
| `conditionalImports` | none | Platform-conditional `#<name>` imports: `package` (condition to source), `tsconfig` (type-check fallback), `distImports` (condition to dist file) |
| `platformEntries` | none | Extra per-platform entry shims: platform, then shim name, then re-export target |
| `aliasImports` | none | Extra `#alias` to source path imports |
| `barrelImports` | none | External packages re-exported from the master barrel |
| `barrelPlatforms` | every platform | Platforms that compile the master barrel |
| `index` | generated barrel | `custom: true` for a hand-written `src/index.ts`; `entries` for per-platform barrel files |
| `copyEntries` | none | Opaque, already-built runtime files that must land at exact public output paths |

Module options: `name` (required), `barrel` (re-export from `src/index.ts`), `export` (root subpath shim), `model` (`model.ts` type barrel and `/model` subpath), `subpaths` (extra value subpaths), `internal` (reachable only through `#imports`), `reexport` (facade over external package subpaths), and `barrelFrom` / `shimFrom` (override the barrel or shim re-export target).

Use `moduleLinkage: 'external'` when subpaths must preserve shared runtime identity across `instanceof`, contexts, registries, or singletons; the default bundled linkage duplicates shared code across entries. Platform declaration trees reuse the modules-platform declarations, so each class has one declaration (since 10.0.9). Under bundle linkage this hides the runtime duplication from tsc, so choose `external` for any package that exports classes, contexts, or module state across subpaths. External linkage adds two rules:

- Every `conditionalImports` entry needs `distImports`, or layout sync throws.
- Declare a real platform variant in both `conditionalImports` and `platformEntries`, never as a shim that forwards to the modules-platform source. Layout sync warns about identity splits, and `pub.importsMatchExports` fails an `#alias` and subpath that load different files (both since 10.0.9).

Monolith compile fails when emitted `.mjs` keeps a `#module` specifier that no dist `imports` mapping resolves; under external linkage only exported modules and conditional imports with `distImports` resolve. Do not hand-copy `.d.ts` files.

Layout sync generates package.json `imports`, tsconfig `paths`, `src/index.ts`, `src/model.ts`, and the subpath, model, and platform shims. Every emitting compile re-syncs them automatically, but `--validate-only` never writes, so commit the generated files. `package-sync-layout` reads the config in the current directory, so run it inside the package:

```sh
pnpm --filter <pkg> exec package-sync-layout          # sync without compiling
pnpm --filter <pkg> exec package-sync-layout --check  # drift check
```

Do not edit generated barrels, aliases, paths, or shims by hand unless `index.custom` marks the master barrel as hand-written; change the config and re-sync instead.

## Vendor mode

Use vendor mode when a public umbrella package should expose private workspace implementations without requiring consumers to install those private packages. `@ariestools/sdk` uses monolith mode, not vendor mode.

Configure:

```ts
const config: XyConfig = {
  compile: {
    mode: 'vendor',
    vendorPackages: {
      scopes: ['@internal'],
      selfScope: '@scope/public-sdk',
    },
  },
}
```

| Field | Default | Purpose |
|---|---|---|
| `vendorPackages.scopes` | required | Private scopes to vendor |
| `vendorPackages.selfScope` | none | Umbrella name whose subpath imports are rewritten |
| `vendorPackages.exclude` | none | Short package names to skip |
| `vendorPackages.conditionalSubpaths` | inferred from multi-platform exports | Subpaths that emit `node`/`browser`/`neutral` conditions |
| `vendorBarrel.runtime` / `vendorBarrel.model` | `src/index.ts` / `src/model.ts` | Barrels used to discover the vendored set |
| `vendorDir` | `_pkg` | Directory under `dist/` for vendored packages |
| `vendorSyncExports` | `true` | Rewrite package.json `exports` to match the generated layout |

Vendor mode copies already-compiled package `dist` trees, rewrites internal imports, emits public subpath shims, and normally synchronizes the umbrella export map. It does not compile private source directly, and it fails the compile when any private-scope import remains in `dist`. Declare each vendored private package as a `workspace:~` devDependency of the umbrella so the workspace emit orders it first; when compiling only the umbrella, compile those packages first. Inspect the packed consumer surface, not only the source barrels.

## Troubleshooting

When output is missing, inspect target opt-in semantics and source-directory keys before changing entry paths. Declaration emit runs before esbuild in each source folder, so a declaration failure also blocks that folder's JavaScript; when declarations fail but raw `tsc` passes, inspect the per-target `build/tsconfig.package-dts-<platform>-<src>.json`. When `xy publint` expects outputs that compile never built, check whether a package `xy.config.ts` replaced the root `compile` block: publint merges root and package config, while compile uses only the nearest file.

When a monolith or vendor package works inside the workspace but fails for consumers, run `pnpm xy publint` and read the `pub.platform` and `pub.importsMatchExports` findings before hand-editing exports. `xy publint --fix` can add missing monolith subpaths but does not add a condition that the matching `#alias` does not select (since 10.0.9). Then inspect packed files, export maps, and remaining bare internal imports.
