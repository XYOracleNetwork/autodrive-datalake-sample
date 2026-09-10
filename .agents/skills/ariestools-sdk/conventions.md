# Conventions

## Import style

- Prefer **named exports** from `@ariestools/sdk/<module>` or the root barrel.
- Prefer **subpath imports** for clarity and smaller mental graphs (`@ariestools/sdk/assert` vs a large root import) when only a few symbols are needed.
- Use `./model` subpaths for type-only imports when available (`@ariestools/sdk/fetch/model`).
- Do **not** import from package-internal paths such as `@ariestools/sdk/dist/...` or `#assert` (those `#` aliases are for the sdk package's own source tree).
- Do **not** import from another package's `src/` in a published consumer.

## ESM only

All packages are ESM. Consumers must use `"type": "module"` or equivalent ESM resolution. No `require()` of these packages.

## Tree-shaking

Subpath exports map one-to-one with modules. Bundlers can drop unused modules when you import subpaths or when the root barrel is tree-shakeable. Prefer subpaths in libraries that care about minimal dependency graphs.

## Deprecations

| Surface | Guidance |
|---|---|
| `@ariestools/sdk` / `@ariestools/sdk/telemetry` re-exports | Prefer `@ariestools/telemetry` for new code; umbrella telemetry re-exports are deprecated |
| `@ariestools/crypto` polyfill-oriented use | Prefer platform native Web Crypto / Node crypto |
| `@xylabs/*` utility shims | Migrate to `@ariestools/*`; do not use in new packages |

## Relationship to the toolchain

- Build, lint, test, and package policy are owned by [xy-toolchain](../xy-toolchain/SKILL.md) (`@ariestools/toolchain`, eslint configs, vitest-config).
- Language and git conventions are owned by [xy-development](../xy-development/SKILL.md).
- This skill owns **which `@ariestools/*` libraries to use and how to import them**.

When working **inside** `sdk-js` itself:

```sh
pnpm xy build
pnpm xy test
pnpm xy build @ariestools/sdk
pnpm sync-sdk-layout   # after editing sdkModules / monolith layout
```

Do not hand-edit generated monolith shims under `packages/sdk/src/*.ts` barrels produced by layout sync.

## Monolith layout (maintainers)

`@ariestools/sdk` uses toolchain **monolith** compile mode. Module membership is declared in `packages/sdk/xy.config.ts`. After changing modules, run a build or `pnpm sync-sdk-layout` so imports, shims, and exports stay consistent. See the package README "Monolithic layout" section.

## Testing consumers

- Unit-test app logic with Vitest per [xy-toolchain testing](../xy-toolchain/testing.md).
- Add `@ariestools/testing` when you need shared matchers or extended helpers.
- Specs that touch storage adapters or workers should live under the correct `spec/node` or `spec/browser` realm.

## Checklist for new code

1. Prefer `@ariestools/sdk` + subpath for neutral helpers.  
2. Add specialist packages only for real environment/domain needs.  
3. Install optional peers (`zod`, OTel) only when used.  
4. Keep secrets and seeds out of logs when using crypto-auth.  
5. For Node HTTP caching, own Undici in the app — not in shared libraries.  
6. Align dependency section with package role (library vs service) via deplint.  
