# Testing with Vitest

## Contents

- [Use the repository test surface](#use-the-repository-test-surface)
- [Shared preset (`@ariestools/vitest-config`)](#shared-preset-ariestoolsvitest-config)
- [Hand-rolled configuration](#hand-rolled-configuration)
- [Spec location](#spec-location)
- [Running tests](#running-tests)
- [Full-app Playwright e2e](#full-app-playwright-e2e)
- [Test structure](#test-structure)
- [Troubleshooting](#troubleshooting)

## Use the repository test surface

Vitest is the standard runner, but the repository script is the first source of truth:

1. If the root `package.json` defines `test`, run it (`pnpm test`).
2. Use `xy test` when the repository exposes the toolchain directly or when targeting a path through it.
3. Use the local Vitest binary directly only for targeted flags the wrapper does not expose.

`xy test` and `xy retest`, like other top-level `xy` commands, delegate to a same-named root `package.json` script when one exists, and forward the target to it. `--no-defer` or `XY_NO_DEFER=1` forces the built-in command. Since 10.1.1, `publish` and `deploy` never defer without `--defer`. See [Global behavior](commands.md#global-behavior).

A conventional root script surface is:

```json
{
  "scripts": {
    "test": "xy test",
    "test:watch": "vitest watch"
  }
}
```

Do not write `"test": "vitest run"`. With it, `pnpm xy test @scope/package` defers to `vitest run @scope/package`, a file-name filter that matches nothing, and Vitest exits 1. `xy repo init` scaffolds a `test` script that calls `xy test` (since 9.2.0). Use `vitest watch` for watch mode, because plain `vitest` honors the preset's `watch: false`.

`xy build` does not run tests. A green build is not a green test suite.

## Shared preset (`@ariestools/vitest-config`)

Prefer [`@ariestools/vitest-config`](https://github.com/ariestools/toolchain/tree/main/packages/vitest-config) over copy-pasted Vitest projects, in monorepos and single-package repos alike. It is the Vitest-shaped sibling of the flat ESLint configs: one root config encodes node + optional real-Chromium browser projects, with environment routed by spec directory.

Install as a dev dependency at the repository root (add `-w` in a pnpm workspace). The peer is `vitest` ^5.0 (since 10.0.2; ^4.1 before), so pin `vitest` to match it (`vitest@^4.1` on an older toolchain). Add `@vitest/browser-playwright` and `playwright` only when browser projects are enabled. `@vitest/browser-playwright` peers on the exact installed `vitest` version, so upgrade the two together:

```sh
pnpm add -D @ariestools/vitest-config vitest@^5
# optional browser realm:
pnpm add -D @vitest/browser-playwright playwright
```

The npm packages do not download browsers. Run `pnpm exec playwright install chromium` once per machine. In CI, run it after `pnpm install --frozen-lockfile` and before `pnpm xy test`, adding `--with-deps` on runners missing system libraries. Rerun it after bumping `playwright`. See [CI gates](commands.md#ci-gates) for the CI order.

Monorepo root `vitest.config.ts` without browser specs:

```ts
import { defineXyVitestConfig } from '@ariestools/vitest-config'

export default defineXyVitestConfig()
```

Single-package repo. The default include targets `packages/*` and matches nothing here, so pass `include` (`xy repo init` scaffolds the preset with an explicit `include` since 9.2.0):

```ts
import { defineXyVitestConfig } from '@ariestools/vitest-config'

export default defineXyVitestConfig({ include: ['src/**/spec/**/*.spec.{ts,tsx,mts,cts}'] })
```

With headless Chromium (provider is always injected by the consumer so Playwright stays optional):

```ts
import { defineXyVitestConfig } from '@ariestools/vitest-config'
import { playwright } from '@vitest/browser-playwright'

export default defineXyVitestConfig({ browser: { provider: playwright() } })
```

Serialized e2e suites (local chains, funded wallets, long timeouts) are extra projects:

```ts
import { defineXySerializedProject, defineXyVitestConfig } from '@ariestools/vitest-config'
import { playwright } from '@vitest/browser-playwright'

export default defineXyVitestConfig({
  browser: { provider: playwright() },
  exclude: ['**/spec/**/sequence/**'],
  projects: [
    defineXySerializedProject({
      include: ['packages/e2e/src/**/spec/sequence/**/*.spec.ts'],
      name: 'sequence',
      testTimeout: 900_000,
    }),
  ],
})
```

### Defaults and options

The default include is exported as `XY_VITEST_DEFAULT_INCLUDE`:

- Since 10.1.0: `['packages/*/src/**/spec/**/*.spec.{ts,tsx,mts,cts}', 'packages/*/spec/**/*.spec.{ts,tsx,mts,cts}']`. Package-root `spec/` folders and `.tsx`/`.mts`/`.cts` specs need no override.
- Before 10.1.0: `['packages/*/src/**/spec/**/*.spec.ts']`.

Extend the constant instead of copying a glob, which would drop newer defaults: `include: [...XY_VITEST_DEFAULT_INCLUDE, 'tools/**/spec/**/*.spec.ts']`. Both realm projects always exclude `**/node_modules/**` and `**/.claude/**` (Claude Code worktrees; `.claude` since 9.2.0). These built-ins are exported as `XY_VITEST_NODE_EXCLUDE` and `XY_VITEST_BROWSER_EXCLUDE`, alongside the option types.

| Option | Default | Description |
|---|---|---|
| `include` | `XY_VITEST_DEFAULT_INCLUDE` (monorepo) | Spec globs shared by the node and browser projects; required for a single-package repo |
| `exclude` | `[]` | Extra excludes appended to both realm projects' built-in excludes |
| `browser` | omitted | `{ provider, headless?, instances?, test? }`; `provider` required, `headless` defaults to `true`, `instances` to `[{ browser: 'chromium' }]`; omit or `false` to skip |
| `node` | `{}` | `{ test? }`; `false` to skip |
| `projects` | `[]` | Extra projects appended verbatim |
| `test` | `{ watch: false }` | Top-level test options merged over the defaults |

The realm projects are named `node` and `browser`. Their per-realm `test` options are spread last, so an `include` or `exclude` set there replaces the built-ins, including realm routing and the `.claude` exclude. Use the top-level `exclude`, which appends.

The preset does not enable Vitest globals. Import `describe`, `it` and `expect` from `'vitest'`, or pass `test: { globals: true }`. On Vitest 4 the realm projects do not inherit top-level `test` options, so set them per realm instead (`node: { test: { globals: true } }`).

`defineXyVitestProjects` returns only the projects array for callers that compose their own top-level config. `defineXySerializedProject` builds a Node project with `fileParallelism: false` and org-standard long timeouts (`hookTimeout: 180_000`, `testTimeout: 240_000` unless overridden); it also takes `setupFiles` and `test`.

### Spec-directory environment routing

Under the shared preset, path segments select the realm:

| Path segment | Runs in |
|---|---|
| `…/spec/…` (no `node` or `browser` directory below `spec/`) | Both node and browser projects |
| `…/spec/**/node/…` | Node only |
| `…/spec/**/browser/…` | Browser (headless Chromium) only |

Any `node/` or `browser/` directory beneath a `spec/` directory routes the spec, so `spec/feature/node/x.spec.ts` is Node-only.

Do not select a DOM or browser environment merely because React is installed. Prefer Node for logic that does not render or access browser APIs; put browser-only suites under `spec/browser/`. In a hand-rolled config, exclude `**/spec/**/node/**` from the browser project and `**/spec/**/browser/**` from the node project.

Inspect the repository's existing `vitest.config.ts` before introducing the preset. Prefer the preset for new repositories and when consolidating duplicated configs; keep a hand-rolled config only when the repository deliberately diverges.

For product-specific browser verification procedures (for example XL1 in-page gateway suites with MSW), follow the domain skill pack when installed. This skill owns shared Vitest layout and the `@ariestools/vitest-config` surface.

## Hand-rolled configuration

For an intentional one-off, a minimal Node config is:

```ts
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    globals: true,
    watch: false,
  },
})
```

For React tests that actually require DOM APIs without the browser project:

```ts
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    exclude: [...configDefaults.exclude, '**/.claude/**'],
    globals: true,
    watch: false,
  },
})
```

The `.claude` exclude keeps Vitest from collecting specs from Claude Code background worktrees under `.claude/worktrees/`; the preset already excludes it. `watch: false` matters because `xy test` runs `vitest`, not `vitest run`, and would otherwise start watch mode in a terminal.

## Spec location

Use `.spec.ts` as the canonical XY test suffix. Place every `.spec.ts` file inside any directory named `spec/` at any depth within its package.

Valid layouts include:

```text
spec/foo.spec.ts
src/spec/foo.spec.ts
src/game/spec/foo.spec.ts
packages/example/src/spec/node/fs.spec.ts
packages/example/src/spec/browser/dom.spec.ts
```

This is invalid because no `spec/` directory is an ancestor of the file:

```text
src/game/foo.spec.ts
```

The rule does not require one package-root `spec/` directory. Nested `spec/` directories are explicitly allowed. It is enforced as `repo.spec-layout` (error) by `xy repo lint`, and therefore by `xy check` (see [Repository policy](commands.md#repository-policy)). It checks only `*.spec.ts` files in workspace packages, skipping `node_modules`, build output and nested checkouts; a root-only single-package repo is not checked. The preset also discovers `.spec.tsx`, `.spec.mts` and `.spec.cts` files (since 10.1.0). Place them under `spec/` the same way. Avoid colocated `.test.ts` files: the preset include never matches them, and the compile emit filter drops `.spec.` and `/spec/` files from package output but not `.test.` files.

## Running tests

Use the existing script for the normal suite:

```sh
pnpm test
```

Use the toolchain for all tests or one file/folder path:

```sh
pnpm xy test
pnpm xy test packages/example/src
pnpm xy test packages/example/src/spec/example.spec.ts
```

A path target runs `vitest <path>` from the current directory, so the root `vitest.config.ts` applies. A workspace target is different: a package name, a unique short name, or a path exactly equal to a workspace location (such as `packages/example`) runs `vitest .` inside that package. Vitest then loads only a package-level config. Under a root preset the run loses the browser project, realm routing (browser specs run in Node), `watch: false` and any root setup. Use `pnpm xy test @scope/package` only where the package has its own `vitest.config.ts`.

Clear the Vitest cache before rerunning when stale transformed output is credible. `xy retest` resolves targets the same way:

```sh
pnpm xy retest
pnpm xy retest packages/example/src
```

For name filters, project filters or reporters not exposed by `xy test`, invoke the installed Vitest through the package manager from the directory containing `vitest.config.ts` (the repo root under the preset):

```sh
pnpm exec vitest run packages/example/
pnpm exec vitest run -t "behavior name"
pnpm exec vitest run --project node
pnpm exec vitest run --project browser packages/example/src
```

`--project` is repeatable and accepts wildcards and `!` negation.

Do not use a globally installed Vitest or assume a package-local `test` script exists.

## Full-app Playwright e2e

Full-app UI e2e runs outside the `xy` CLI: `xy test` runs Vitest only, no `xy` command runs Playwright Test, and the toolchain ships no Playwright Test preset. Keep the suite in its own pnpm workspace package:

- Put it in a private package such as `packages/e2e`, with `@playwright/test` as a devDependency, its own `playwright.config.ts`, and a `test` script that runs `playwright test`. Install its browsers from the package: `pnpm --filter <e2e-package> exec playwright install chromium` (name every browser its `projects` use; add `--with-deps` on bare CI runners). Rerun it after bumping `@playwright/test`. The root install [above](#shared-preset-ariestoolsvitest-config) covers only the Vitest browser realm's `playwright`.
- Run it with `pnpm --filter <e2e-package> test`. Do not target it with `pnpm xy test <e2e-package>`, which runs `vitest .` inside the package.
- Its `*.spec.ts` files must live under `spec/` (`repo.spec-layout`). Use the package-root `spec/` with no `src/`: `xy compile` then emits nothing for the package, while a `src/` holding only specs fails declaration emit. The preset's default include also finds package-root specs (since 10.1.0), so exclude the package from the root Vitest config with the top-level `exclude: ['packages/e2e/**']`. If `packages/e2e` already holds Vitest serialized suites, give the Playwright package another name.
- Give it a `tsconfig.json` that extends `@ariestools/tsconfig` (`@ariestools/tsconfig-dom` when `page.evaluate` callbacks use DOM APIs; see [TypeScript configuration](typescript.md)). `xy compile` type-checks the specs and `playwright.config.ts` through it, and the root `@ariestools/eslint-config-flat` or `@ariestools/eslint-config-react-flat` config lints the package like any other workspace.
- Component-level browser tests belong in the `@ariestools/vitest-config` `browser` project (Vitest browser mode through `@vitest/browser-playwright`), not in Playwright Test.

## Test structure

Follow the [xy-development testing principles](../xy-development/testing.md): arrange/act/assert, behavior-focused naming, public-interface testing, minimal boundary mocks, and no pursuit of coverage for its own sake.

```ts
import { describe, expect, it } from 'vitest'

import { validateMove } from '../validateMove.ts'

describe('validateMove', () => {
  it('accepts supported moves', () => {
    expect(validateMove('rock')).toBe(true)
  })

  it('rejects unsupported moves', () => {
    expect(validateMove('lizard')).toBe(false)
  })
})
```

## Troubleshooting

If imports fail, compare Vitest resolution with tsconfig paths and workspace export maps. If a test file fails during `xy compile`, fix its TypeScript error even though the file is excluded from emitted package entries: full validation intentionally includes specs.

If no browser tests run, the `browser` option was omitted or set to `false`: the preset creates the `browser` project only when `browser: { provider: playwright() }` is passed. If the browser project fails to launch, the Chromium binary is usually missing; run `pnpm exec playwright install chromium`. If browser-only specs fail in Node (for example `document is not defined`), the run started outside the directory holding `vitest.config.ts`; rerun from the root with a path target. If monorepo globs miss packages, extend `include` from `XY_VITEST_DEFAULT_INCLUDE` rather than abandoning the preset wholesale.

If `pnpm xy test <target>` finds no test files, check whether it deferred to a root `test` script. If `xy test` stays in watch mode, the config lacks `watch: false`.

If tests are slow, identify network, filesystem, environment, or setup costs before adding mocks. If watch mode misses changes, verify the include pattern and restart after configuration changes. Use a clean `xy retest` only when the cache is a plausible cause, not as a substitute for diagnosing deterministic failures.
