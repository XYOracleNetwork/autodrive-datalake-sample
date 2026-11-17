# Conventions

## Import style

- Import **named exports** from the root `@ariestools/sdk` by default. Libraries built on it (actor-kit, sdk-react, XYO/XL1) import the root.
- Every entry is a separate bundle, so a class or module state reached through a subpath is a different object from the root's: `instanceof` fails across them, and `initDefaultLogger` from `/base` does not set the root's `Base.defaultLogger`.
- Use subpaths only for `import type` (`@ariestools/sdk/model`, `@ariestools/sdk/<module>/model`) and stateless functions (`assertEx`, `exists`, `delay`, `typeof` guards, `toSafeJsonObject`, `fetchJson*`).
- Never import classes or stateful setup through a subpath (`AbstractCreatable`, `Base` / `initDefaultLogger`, `BaseEmitter` / `Events`, `PromiseEx`, `TimerScheduler`, `ApiClient`, logger classes). Never combine two class-bearing subpaths, and use one import style per package across the dependency graph.
- Across packages, use the `is*` brand guards (`isFetchError`), not `instanceof`.
- `@ariestools/storage-adapters` is the opposite case: import its backend subpath, never its root (see [packages.md](packages.md#ariestoolsstorage-adapters)).
- Do **not** import from package-internal paths such as `@ariestools/sdk/dist/...` or `#assert` (those `#` aliases are for the sdk package's own source tree).
- Do **not** import from another package's `src/` in a published consumer.

Types split too. In 9.0.1 the root's types come from `dist/node` or `dist/browser` and the subpaths' from `dist/neutral`, so a class with private or protected members (`AbstractCreatable`, `PromiseEx`, `Base`, `ApiClient`, …) imported both ways fails with TS2322. Once sdk-js builds with toolchain 10.0.9 or later, declarations are shared and tsc stops reporting the mismatch, but the runtime copies remain until sdk-js adopts `moduleLinkage: 'external'` (see [xy-toolchain compilation](../xy-toolchain/compilation.md#monolith-mode)).

## ESM only

All packages are ESM. Consumers must use `"type": "module"` or equivalent ESM resolution. No `require()` of these packages. sdk-js 9.x packages declare `engines.node >=26`; see [overview.md](overview.md#runtime-baseline).

## Tree-shaking

The root is `sideEffects: false`, so bundlers drop the root exports you do not use. Subpath entries are self-contained bundles that duplicate shared code, so they save neither size nor peers once anything in the graph imports the root. Plain Node does not tree-shake: every import in the root barrel must resolve, which is why the root needs `zod` and `@opentelemetry/api` installed.

## Deprecations

| Surface | Guidance |
|---|---|
| Telemetry re-exports: `@ariestools/sdk`, `/telemetry`, `/telemetry/model`, `/telemetry-exporter` | Deprecated, removal planned in a future major. Import from `@ariestools/telemetry` |
| `@ariestools/crypto` (whole package, npm-deprecated) | Do not add it. Use `globalThis.crypto` / `node:crypto`; remove `cryptoPolyfill()` calls (no-ops) |
| `@xylabs/*` shims (npm-deprecated, frozen at 8.0.2) | Migrate per the [retired-names map](overview.md#migrating-from-retired-names), not the npm message; do not use in new packages |
| `@ariestools/{indexed-db,mongo}` 8.0.3 (retired) | `@ariestools/storage-adapters/indexed-db`, `@ariestools/storage-adapters/mongo` |
| `@ariestools/{vitest-extended,vitest-matchers}` 8.0.3 (retired) | `@ariestools/testing` (`/extended`, `/matchers`) |

API-level deprecations that are still exported (typed lint flags them through `@typescript-eslint/no-deprecated`):

| Deprecated | Use |
|---|---|
| `new XyConsoleSpanExporter(...)` | `createXyConsoleSpanExporter(logLevel, logger)` from `@ariestools/telemetry` |
| crypto-auth `encryptSeedPhrase` / `decryptSeedPhrase` | `SeedPhraseVault#encryptPhrase` / `#decryptPhrase` (or `VaultCrypto#encrypt` / `#decrypt`) |
| express `Logger` / `LogFunction` types | `import type { Logger, LogFunction } from '@ariestools/sdk/logger'` |
| eth-address `ellipsize` | `ellipsize` from `@ariestools/sdk` |
| sdk/hex `EthAddressToStringSchema` / `EthAddressFromStringSchema` | `EthAddressToStringZod` / `EthAddressFromStringZod` |
| sdk/object `PartialRecord<K, T>` | `Partial<Record<K, T>>` |

## Relationship to the toolchain

- Build, lint, test, and package policy are owned by [xy-toolchain](../xy-toolchain/SKILL.md) (`@ariestools/toolchain`, eslint configs, vitest-config).
- Language and git conventions are owned by [xy-development](../xy-development/SKILL.md).
- This skill owns **which `@ariestools/*` libraries to use and how to import them**.

When working **inside** `sdk-js` itself:

```sh
pnpm xy build
pnpm xy test
pnpm xy build @ariestools/sdk
pnpm sync-sdk-layout   # after editing compile.monolith.modules in packages/sdk/xy.config.ts
pnpm --filter @ariestools/sdk sync-sdk-layout:check
```

## Monolith layout (maintainers)

`@ariestools/sdk`, `@ariestools/storage-adapters` and `@ariestools/testing` use toolchain monolith mode with the default bundle linkage. Each declares its modules in `compile.monolith.modules` (`model` / `barrel` / `export` / `internal` flags) in the package's `xy.config.ts`. Do not hand-edit their generated `src/*.ts` shims; change the config and re-sync.

- `pnpm xy compile` / `build` re-syncs the layout (package.json `imports`, tsconfig paths, barrels and shims).
- `pnpm sync-sdk-layout` covers only `@ariestools/sdk`. For storage-adapters and testing, run `pnpm --filter <pkg> exec package-sync-layout [--check]`.
- The sync does not write `exports`; `pnpm xy publint --fix` checks and adds new subpath `exports`.

Generic monolith mechanics live in [xy-toolchain compilation](../xy-toolchain/compilation.md#monolith-mode).

## Testing consumers

- Unit-test app logic with Vitest per [xy-toolchain testing](../xy-toolchain/testing.md).
- Add `@ariestools/testing` when you need shared matchers; see [packages.md](packages.md#ariestoolstesting) for registration and the Vitest version it requires.
- Specs that touch storage adapters or workers should live under the correct `spec/node` or `spec/browser` realm.

## Checklist for new code

1. Import from the root `@ariestools/sdk`; use subpaths only for `import type` and stateless helpers.  
2. Add specialist packages only for real environment/domain needs.  
3. `@opentelemetry/api` is a required peer of `@ariestools/sdk` and `@ariestools/telemetry` — always install it. Install `zod` ^4.6 whenever anything in the graph imports the root barrel or `/hex`, `/object`, `/zod`; in practice that is almost always, because actor-kit, sdk-react and XYO libraries import the root.  
4. Keep secrets and seeds out of logs when using crypto-auth.  
5. Only terminal apps (services, CLIs, worker entrypoints) install a global Undici dispatcher. Libraries that need caching inject a module-local `fetcher` and own its lifecycle; never make Undici a dependency of a shared library just to change global fetch (see [fetch.md](fetch.md#node-http-caching-undici)).  
6. Align dependency section with package role (library vs service) via deplint.  
