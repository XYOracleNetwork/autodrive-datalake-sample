# TypeScript Configuration

## Select the environment config

| Package | Extends | Use when |
|---|---|---|
| `@ariestools/tsconfig` | Base | Environment-neutral code, Node code with explicit Node types, libraries, services, and CLIs |
| `@ariestools/tsconfig-dom` | Base | Browser-targeted code that uses DOM APIs |
| `@ariestools/tsconfig-react` | DOM | React applications and component libraries |
| `@ariestools/lib-neutral` | *(types only)* | Neutral packages that need WinterTC common globals without Node or DOM types |

The DOM and React packages declare their parent configs as peers. Install the complete chain explicitly at the repository root (add `-w` in a pnpm workspace), with a pinned TypeScript range:

```sh
# Base / environment-neutral
pnpm add -D @ariestools/tsconfig typescript@^6

# Browser / DOM
pnpm add -D @ariestools/tsconfig @ariestools/tsconfig-dom typescript@^6

# React
pnpm add -D @ariestools/tsconfig @ariestools/tsconfig-dom @ariestools/tsconfig-react typescript@^6
```

The parent-config peers are tilde ranges on the exact lockstep release (`@ariestools/tsconfig-react@10.1.2` peers `@ariestools/tsconfig` and `@ariestools/tsconfig-dom` at `~10.1.2`), so bumping one package alone leaves its peers unsatisfied. Upgrade `@ariestools/tsconfig`, `-dom`, and `-react` together (for example with `pnpm xy updo`), and keep `@ariestools/lib-neutral` and `@ariestools/toolchain` on the same release.

Keep `typescript` within the toolchain's peer range, `^5.9 || ^6.0`, and follow the consuming repository's exact range policy. Never upgrade it to 7: npm `latest` for `typescript` is the 7.x native (Go) compiler, so an unversioned install pulls it in, and it exports no compiler API for ESLint, deplint, dead-code, and API-exposure checks to load. `xy updo` will not offer that bump, even with `--latest`. TypeScript 7 is supported only as an experimental side-by-side alias (`typescript-native: npm:typescript@~7.0.2` with `compile.compiler: 'native'`), set up with `pnpm xyex enable ts-native` (since 9.0.2; before 9.2.0, when `xyex` was added, run it as `pnpm xy enable ts-native`). It is incompatible with `compile.validator: 'shared'` ([type validation](compilation.md#type-validation)), and shared examples must not require it.

## Understand the base config

The base currently supplies strict, ESM-oriented settings including:

- `target`, `lib`: ESNext
- `module`, `moduleResolution`: NodeNext
- `strict`, `noImplicitAny`, `noImplicitOverride`
- `allowImportingTsExtensions` (write relative imports with the source extension, `./thing.ts`; the toolchain resolves them on emit; see the [xy-development TypeScript conventions](../xy-development/typescript.md#esm-only)), `allowJs`, `resolveJsonModule`
- `isolatedModules`, `erasableSyntaxOnly`
- `experimentalDecorators` (legacy decorator semantics, not TC39 decorators) and `importHelpers`
- `esModuleInterop`, `allowSyntheticDefaultImports`, `skipLibCheck`
- declarations, declaration maps, and source maps; `removeComments: false`, `incremental: false`
- `outDir: "dist"`
- `noEmit: true`
- `exclude`: `.github`, `.vscode`, `.yarn`, `dist`, `node_modules`, `storybook-static`, `build`

`noEmit: true` is intentional: TypeScript validates the full package while the toolchain's selected compile mode emits publishable JavaScript and declarations. Do not remove it merely because raw `tsc` produces no files.

`erasableSyntaxOnly` makes enums, constructor parameter properties, runtime namespaces, and `import x = require()` compile errors (TS1294); use the alternatives in the [xy-development TypeScript conventions](../xy-development/typescript.md). Turn it off only in the package tsconfig that needs it, with a stated reason.

Because `importHelpers` is on, a package that uses decorators needs `tslib` resolvable (normally a devDependency), or validation fails with TS2354. deplint accepts `tslib` as an implicit devDependency when it sees decorators.

A package-level `exclude` replaces the base list rather than extending it.

## Basic configuration

Use the smallest applicable config, the shape `xy repo init` scaffolds:

```json
{
  "extends": "@ariestools/tsconfig",
  "exclude": ["dist"]
}
```

For React:

```json
{
  "extends": "@ariestools/tsconfig-react",
  "exclude": ["dist"]
}
```

The React config adds `jsx: "react-jsx"`; the DOM config adds DOM and DOM iterable libraries. A monorepo root uses the same shape with `"exclude": ["dist", "docs", "**/dist", "**/docs", "coverage", "**/coverage"]`.

Do not narrow `include` to `src`. Full-package validation checks exactly the files the package `tsconfig.json` selects (minus nested `packages/`), so `include: ["src"]` drops `xy.config.ts`, `vitest.config.ts`, `eslint.config.ts`, and `.storybook/` from validation. Emission inputs are derived from `src` automatically, without specs, stories, or examples.

Every package needs its own `tsconfig.json`; without one, `xy compile` skips validation with only a warning.

## Node types

The base is not a license to expose Node globals everywhere. For a Node package, install Node types, declare them explicitly, and opt in the node target with `compile.node: true` in `xy.config.ts` ([target selection](compilation.md#target-selection)):

```sh
pnpm add -D @types/node
```

```json
{
  "extends": "@ariestools/tsconfig",
  "compilerOptions": {
    "types": ["node"]
  },
  "exclude": ["dist"]
}
```

### Per-target type passes

`xy compile` writes a check and a declaration tsconfig per target, `build/tsconfig.package-{check|dts}-<platform>-<src>.json`, each extending the package `tsconfig.json`:

1. Browser and neutral passes drop `node` from `types` (and use `[]` when `types` is unset). Browser passes also force `moduleResolution: "Bundler"` and the `browser` condition.
2. Pair `types: ["node"]` with `compile.node: true`. Only `neutral` builds unless another target is opted in, so source that uses Node globals without a node target fails declaration emit ("Compile:Declaration emit had N errors") even though raw `tsc` passes.
3. Without a node target, do not list `node` in `types`; the `xy publint` `platform` rule (an error in `xy build`) rejects it. Even with a node target, browser and neutral entry points must not import `node:*` or expose Node ambient types.
4. Do not set `module` in a package that emits a browser target. When it is unset, the toolchain uses `ESNext` for browser and `NodeNext` for node; an explicit `NodeNext` conflicts with the browser pass's Bundler resolution (TS5095).
5. When declaration emit fails but validation passes, inspect `build/tsconfig.package-dts-<platform>-<src>.json`.

## Neutral ambient globals (`@ariestools/lib-neutral`)

For packages that claim an environment-neutral runtime (browser + Node common surface), use [`@ariestools/lib-neutral`](https://github.com/ariestools/toolchain/tree/main/packages/lib-neutral) instead of `@types/node` or DOM libs.

It is a types-only package: ambient globals for a curated subset of the [WinterTC Minimum Common Web Platform API](https://min-common-api.proposal.wintertc.org/), typed with signatures valid in every environment.

```sh
pnpm add -D @ariestools/lib-neutral
```

```json
{
  "extends": "@ariestools/tsconfig",
  "compilerOptions": {
    "types": ["@ariestools/lib-neutral"]
  },
  "exclude": ["dist"]
}
```

On TypeScript 5.9, setting `compilerOptions.types` turns off automatic `@types/*` inclusion; on TypeScript 6, nothing from `@types/*` is included unless it is listed (or `types` contains `"*"`). Either way, list Node, test-global, and lib-neutral types explicitly. Accidental references to Node-only (`process`, `Buffer`) or browser-only (`window`, `document`) globals become compile errors — the compiler is the first line of defense for the neutrality claim. Environment test matrices remain the runtime proof.

Currently declared surface (grow only with WinterTC common APIs as packages need them):

- `setTimeout` / `clearTimeout` / `setInterval` / `clearInterval` — opaque handle type (`number` in browsers, object in Node). Divine the concrete type where needed: `type TimeoutHandle = ReturnType<typeof setTimeout>`.
- `AbortController` / `AbortSignal`

Not declared, and therefore compile errors in a neutral package: `console`, `URL`, `TextEncoder` / `TextDecoder`, `queueMicrotask`, and the static `AbortSignal.timeout()` / `AbortSignal.any()`. Inject the capability instead (for example, accept a logger rather than calling `console`), or extend `lib-neutral` upstream with the WinterTC common API. ESLint suggests two of these: since 10.2.1, `unicorn/prefer-abort-signal-any` and `unicorn/prefer-abort-signal-timeout` are errors from tier 3 under the opinionated preset (off at tier 2) (earlier migration queues held them at warning or off). Where they fire in a neutral package, turn them off with a scoped, commented override for that package's files.

Do not add `@types/node` or DOM libs to a neutral package to silence these errors. Do not use `lib-neutral` on Node-only or DOM/React packages that intentionally depend on those platforms.

## Overrides and multiple configs

Override only the option the package needs. Do not reset strictness, module resolution, or emit behavior by copying a large standalone compiler-options block from an older repository.

Keep `tsconfig.json` broad for validation and let the toolchain derive its emission inputs, rather than excluding specs from validation or adding a separate build tsconfig.

Configure output platforms and compiler modes in `xy.config.ts`, not by creating ad hoc CommonJS and ESM tsconfigs. See [compilation.md](compilation.md).

## Troubleshooting

For module-resolution errors, inspect the complete `extends` chain, installed peer configs, package export maps, path aliases (in `compile.monolith` packages, tsconfig `paths` and package.json `imports` are generated; fix the monolith config and re-sync instead of editing them, see [monolith mode](compilation.md#monolith-mode)), and source import extensions. For missing Node globals, add explicit Node types only to the Node package; on TypeScript 6, a missing `process` or `Buffer` usually means `types` was never declared. For missing timers/AbortController in a neutral package, install and declare `@ariestools/lib-neutral`. For errors in specs or configs during `xy compile`, remember that full-package validation includes non-emitted TypeScript files by design.

Use `xy clean` or `xy recompile` when stale declarations are the credible cause. Do not delete lockfiles or reinstall dependencies as the first response to a TypeScript diagnostic.
