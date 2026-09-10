# Overview and install

## What this monorepo is

[`ariestools/sdk-js`](https://github.com/ariestools/sdk-js) publishes shared ESM TypeScript libraries used across Aries Tools, XY Labs, and XYO product repos.

| Package | Role |
|---|---|
| `@ariestools/sdk` | **Umbrella** — most neutral utilities in one install, with subpath exports per module |
| Specialist packages | Separate installs for environment- or domain-specific surfaces (Express, storage backends, threads, tests, …) |

All packages are **ESM only** (`.mjs` + `.d.ts`), typically compiled to `dist/neutral/`. They share a monorepo version when published from `sdk-js`.

## Default choice

For application and library code that needs common helpers:

```sh
pnpm add @ariestools/sdk
```

Import either from the root barrel or a subpath (both are supported; subpaths are clearer and tree-shaking-friendly):

```ts
import { assertEx, delay, exists, fetchJson } from '@ariestools/sdk'
// or
import { assertEx } from '@ariestools/sdk/assert'
import { fetchJson } from '@ariestools/sdk/fetch'
```

Add specialist packages only when you need their surface. See [packages.md](packages.md).

## Peers and side dependencies

From the umbrella README and package metadata:

| Dependency | Role |
|---|---|
| `async-mutex` | Direct dependency of `@ariestools/sdk` |
| `zod` | **Optional peer** — install only if you use zod helpers (`@ariestools/sdk/zod`, hex zod helpers, etc.) |
| `@opentelemetry/api` | **Required peer** while telemetry is still re-exported from the umbrella; prefer `@ariestools/telemetry` for new code |

```sh
# Only if you use zod helpers from the SDK
pnpm add zod

# Prefer for new telemetry
pnpm add @ariestools/telemetry @opentelemetry/api
```

## Retired names

Do **not** start new work on:

- `@xylabs/*` utility shims that mirror these packages
- Deprecated browser crypto polyfill packages when platform native crypto is available

Prefer `@ariestools/sdk` and the specialist `@ariestools/*` packages listed in this skill. Compatibility shims (if still published) are migration aids only.

## When not to use the umbrella alone

Install a **specialist** package instead of (or in addition to) the umbrella when you need:

- Node Express API handlers and middleware → `@ariestools/express`
- IndexedDB or Mongo storage implementations → `@ariestools/storage-adapters`
- Worker-thread / web-worker helpers → `@ariestools/threads`
- Vitest matchers / extended test helpers → `@ariestools/testing`
- First-class OpenTelemetry helpers → `@ariestools/telemetry`
- Password/seed vault crypto → `@ariestools/crypto-auth`
- ETH address helpers as a focused package → `@ariestools/eth-address`
- Browser MetaMask JSON-RPC engine surface → `@ariestools/json-rpc-engine`
- Pixel / funnel analytics client → `@ariestools/pixel`

The umbrella still re-exports some telemetry and storage **interfaces**; backend adapters and Express remain separate. See [packages.md](packages.md).

## Versioning

Follow the consuming repository's lockfile and range policy. Do not copy patch versions from `sdk-js` blindly into every app. In workspace monorepos, use `workspace:~` for internal packages per [xy-toolchain](../xy-toolchain/commands.md).
