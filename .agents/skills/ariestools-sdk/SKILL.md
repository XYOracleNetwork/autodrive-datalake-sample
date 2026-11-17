---
name: ariestools-sdk
description: "Aries Tools shared TypeScript/JavaScript libraries published from the sdk-js monorepo. Covers the @ariestools/sdk umbrella (assert, delay, fetch, hex, promise, storage, zod helpers, and other modules), specialist packages (express, storage-adapters, threads, testing, telemetry, crypto-auth, eth-address, pixel, json-rpc-engine, sdk-meta), root-barrel import conventions, runtime peers (zod, OpenTelemetry), the Node 26 baseline, and migration from retired @xylabs/* names. Use when importing, installing, or choosing @ariestools/* packages published from sdk-js, wiring HTTP clients, storage adapters, workers, Express APIs, or Vitest matchers, or replacing @xylabs/* utilities."
metadata:
  # x-release-please-start-version
  version: "0.1.14"
  # x-release-please-end
---

# Aries Tools SDK

**Authority.** This skill is maintained only in [`ariestools/ariestools-skills`](https://github.com/ariestools/ariestools-skills); edit there, not in installed copies.

Use the active packages from [`ariestools/sdk-js`](https://github.com/ariestools/sdk-js) under the `@ariestools/*` scope. Do not install retired `@xylabs/*` utility names for new work, nor the frozen `@ariestools/{indexed-db,mongo,vitest-matchers,vitest-extended}` 8.0.3 packages that npm deprecation notices point to. Prefer existing repository dependencies and versions; pin according to the consuming repo.

**Scope.** Only packages published from sdk-js. React work on `@ariestools/sdk-react*` belongs to [ariestools-sdk-react](../ariestools-sdk-react/SKILL.md). Actors, providers and their CLI and browser hosts (`@ariestools/actor*`, `@ariestools/provider*`, `@ariestools/cli-kit*`, `@ariestools/browser-kit*`) belong to [ariestools-actor](../ariestools-actor/SKILL.md). Neither covers `@ariestools/cli`, the `aries` operator CLI. Toolchain and config packages belong to [xy-toolchain](../xy-toolchain/SKILL.md).

**Runtime.** This skill describes sdk-js 9.x, whose packages declare `engines.node >=26`, above the toolchain's own Node 22 floor; see [Runtime baseline](overview.md#runtime-baseline).

**Skill identity.** When you present a plan, an acknowledgement, or a completion summary, state which skills informed it as `ariestools-sdk v<version>`, and list each other active skill from this pack the same way. Read the version from this file's `metadata.version`, never from an example.

## References

### [Overview and install](overview.md)

Read first when choosing the umbrella vs specialist packages, installing `@ariestools/sdk` (with `zod` and `@opentelemetry/api`, which the root barrel loads at runtime), checking the Node >= 26 [runtime baseline](overview.md#runtime-baseline), or replacing retired `@xylabs/*` and frozen 8.x `@ariestools/*` names via the [migration map](overview.md#migrating-from-retired-names).

### [Umbrella modules](modules.md)

Read when picking a utility inside `@ariestools/sdk` (assert, delay, fetch, forget, hex, promise, retry, storage, typeof, logger, …), looking up a module's subpath or `/model` types, or using platform-conditional modules (`platform`, `url`, `subtle`).

### [Specialist packages](packages.md)

Read when you need Express helpers, IndexedDB/Mongo adapters, threads/workers, testing matchers, telemetry, crypto-auth, eth-address (`EthAddressWrapper`), pixel, json-rpc-engine, or sdk-meta (server-side HTML head / OpenGraph / Twitter meta) — packages that are **not** fully replaced by the main umbrella install alone. Also covers each package's runtime (Node, browser, or both) and dependency placement.

### [Fetch and HTTP](fetch.md)

Read when calling `fetchJson` / `FetchClient`, setting request options or handling results and `FetchError`s, bounding or cancelling response reads (`maxResponseBytes`, `signal`, client `timeout`, `readResponseText`), injecting a custom fetcher, or configuring Node HTTP caching with Undici (consumer-owned).

### [Conventions](conventions.md)

Read for import style (root barrel vs subpaths), ESM only, tree-shaking, deprecations (telemetry re-exports, `@ariestools/crypto`, retired 8.x package names, API-level deprecations), how this monorepo relates to the `xy` toolchain (including the monolith layout for maintainers), testing consumers, and the checklist for new code.

## Related skills

- **[xy-development](../xy-development/SKILL.md)** — TypeScript, Git, testing principles and the Definition of Done; this skill builds on it. Install: `npx skills add ariestools/ariestools-skills --skill xy-development`.
- **[xy-toolchain](../xy-toolchain/SKILL.md)** — the `xy` CLI, configs, Vitest, deplint and package policy that sdk-js packages and their consumers build with; this skill builds on it. Install: `npx skills add ariestools/ariestools-skills --skill xy-toolchain`.
- **[ariestools-sdk-react](../ariestools-sdk-react/SKILL.md)** — React UI on `@ariestools/sdk-react*`, which imports this SDK's root barrel without declaring it and uses `@ariestools/pixel` and `@ariestools/eth-address`; it builds on this skill. Install: `npx skills add ariestools/ariestools-skills --skill ariestools-sdk-react`.
- **[ariestools-actor](../ariestools-actor/SKILL.md)** — actors, providers and the actor engine from actor-kit, hosted by cli-kit or browser-kit, which build on this SDK's `creatable` and logger utilities; it builds on this skill. Install: `npx skills add ariestools/ariestools-skills --skill ariestools-actor`.

If a linked skill is not installed, add it with `npx skills add ariestools/ariestools-skills --skill <name>`.
