# ESLint Configuration

## Contents

- [Use the active flat config](#use-the-active-flat-config)
- [Manual configuration](#manual-configuration)
- [Rule tiers](#rule-tiers)
- [Rules you will hit at the default tier](#rules-you-will-hit-at-the-default-tier)
- [Included concerns](#included-concerns)
- [Commands](#commands)
- [Overrides and troubleshooting](#overrides-and-troubleshooting)

## Use the active flat config

Use `@ariestools/eslint-config-flat` for non-React repositories and `@ariestools/eslint-config-react-flat` when React packages are present. Both are ESLint flat configs with two peer dependencies: `eslint` ^10.3 and `eslint-import-resolver-typescript` ^4.4. The import rules resolve through that resolver, and `xy deplint` reports it when it is missing.

The generator writes `eslint.config.ts`:

```sh
pnpm xy lint init
```

It is interactive and has no non-interactive mode. When your shell cannot answer prompts, ask the user to run it, or hand-write the [manual configuration](#manual-configuration). It:

- asks before replacing an existing `eslint.config.ts` or `eslint.config.mjs`, and deletes the legacy `.mjs` after replacing it;
- detects React, picks the config package, and for React always adds `configReactStorybook`;
- includes the root `.gitignore` when one exists;
- asks y/N for each hard-coded SDK barrel whether to steer sub-package imports to it. A barrel that is not installed is added at `latest` and installed, so decline the deprecated `@xylabs/sdk-js`, `@xylabs/sdk-react` and `@xyo-network/sdk-js`, and the unpublished `@xyo-network/react-chain`. `@ariestools/sdk` is not offered;
- adds the config package and `eslint` `^10.0.0` to devDependencies when they are missing, then installs.

Afterwards, review `git diff`, raise `eslint` to `^10.3`, add `eslint-import-resolver-typescript`, and, if you accepted any barrel, move the generated block to another rule id (see [Overrides and troubleshooting](#overrides-and-troubleshooting)).

Do not install retired `@xylabs/*` config packages; `pnpm xy lint lint --fix` migrates an existing config off them. Do not use the deprecated static `config` or named tier exports in new configurations; use `recommendedConfig`.

## Manual configuration

Install at the repository root (add `-w` in a pnpm workspace). For React, install `@ariestools/eslint-config-react-flat` instead of `@ariestools/eslint-config-flat`:

```sh
pnpm add -D @ariestools/eslint-config-flat eslint@^10.3 eslint-import-resolver-typescript@^4.4
```

Use the generator's output as canonical. With a root `.gitignore`, it is:

```ts
import { fileURLToPath } from 'node:url'

import { recommendedConfig } from '@ariestools/eslint-config-flat'
import type { Linter } from 'eslint'
import { includeIgnoreFile } from 'eslint/config'

const config: Linter.Config[] = [
  globalThis.process.env.XY_LINT_GITIGNORE === 'false'
    ? { ignores: [] }
    : includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url)), {
        gitignoreResolution: true,
        name: 'XY repository .gitignore',
      }),
  { ignores: ['.yarn/**', 'build', '**/build/**', '**/dist/**', 'dist', 'node_modules/**', '**/node_modules/**', '**/*.md', '.claude/worktrees/*'] },
  ...recommendedConfig({ tier: 3, isTypeChecked: true }),
]

export default config
```

Without a root `.gitignore`, drop the first entry and the `node:url` and `eslint/config` imports. The `**/*.md` ignore means the shared Markdown rules never run; remove it to lint Markdown.

Do not hand-repair the `.gitignore` entry when the toolchain can normalize it:

```sh
pnpm xy lint lint --fix
```

For React, import `recommendedConfig` from `@ariestools/eslint-config-react-flat`. The generator always adds `configReactStorybook`; remove it when the repository has no Storybook stories:

```ts
import {
  configReactStorybook,
  recommendedConfig,
} from '@ariestools/eslint-config-react-flat'

export default [
  ...recommendedConfig({ tier: 3, isTypeChecked: true }),
  ...configReactStorybook,
]
```

## Rule tiers

Each tier includes the tiers below it:

| Tier | Purpose |
|---|---|
| 0 | Correctness: type safety, bug prevention, import restrictions, Markdown |
| 1 | Consistency: formatting, ordering, complexity |
| 2 | Best practices: Unicorn, import validation, workspace rules; React begins here |
| 3 | Opinionated default: optional rules and stricter promotions |
| 4 | Experimental canary rules for migration testing; may change on a minor |

Higher tiers add errors, not just warnings. Since 10.2.1, Unicorn migration queues no longer hold rules at lower severities: unopinionated rules take their upstream levels from tier 2, and opinionated rules are errors from tier 3, subject to the shared explicit overrides. Tier 4 currently has the same Unicorn severities as tier 3; it remains an experimental surface. The old versioned migration-queue and migration-layer exports were removed. With type checking, tier 3 also promotes `strict-boolean-expressions`, `no-deprecated`, `unicorn/filename-case` and the `workspaces/*` rules to errors. Preview the actual installed config with `pnpm xy lint --analyze` before changing tier, and use tier 4 for evaluation, not as an automatic default. Use `pnpm xy lint --strict` or `XY_STRICT=1` when warnings must fail CI.

Set `isTypeChecked: false` when the repository intentionally avoids parser type information. Change the persisted setting safely with:

```sh
pnpm xy lint config get type-checked
pnpm xy lint config set type-checked false
```

Use `pnpm xy lint --type-checked false` for a one-run override.

## Rules you will hit at the default tier

At tier 3 with type checking, these are errors:

| Rule | Write instead |
|---|---|
| `@typescript-eslint/strict-boolean-expressions` | Compare nullable booleans, strings and numbers explicitly in conditions: `isVerbose === true`, `name !== undefined`, `(count ?? 0) > 0` |
| `@typescript-eslint/no-explicit-any` | `unknown` plus a type guard |
| `@typescript-eslint/consistent-type-definitions` | `interface` for object shapes |
| `@typescript-eslint/no-floating-promises`, `no-misused-promises` | Await, return or `void` every promise; do not pass an async function where a void callback is expected |
| `unicorn/import-style`, `unicorn/prefer-node-protocol` | `import PATH from 'node:path'`; always use the `node:` prefix |
| `unicorn/prefer-export-from` | `export { x } from './x.ts'` instead of importing then exporting |
| `no-restricted-imports` | Import the defining file, never an `index.ts` barrel (`./index.ts`, `../index.ts`, …); files under `src/` never import a `src/` path |
| `workspaces/no-relative-imports`, `workspaces/require-dependency` | Reach another workspace package by its package name, and declare it in `package.json` |
| `complexity` 18, `max-depth` 6, `max-statements` 32, `max-nested-callbacks` 6, `max-lines` 512 | Split functions and files (`max-lines` counts code lines only) |
| `@typescript-eslint/member-ordering` | Fields, constructor, accessors, then methods; static before instance, public before private; alphabetical within each group |
| `unicorn/filename-case` | camelCase, kebab-case or PascalCase file names |

Fix these too: `@typescript-eslint/consistent-type-imports` (separate `import type`), `simple-import-sort` import and export order, `@stylistic/max-len` 200, `@typescript-eslint/explicit-member-accessibility` (omit `public`), the `enum` ban in `no-restricted-syntax` (use a string-literal union or a `const` object), its ban on `value.constructor.name` since 10.2.1 (use an explicit stable identifier), and `import-x/no-cycle`. `pnpm xy lint --fix` sorts imports and splits type imports. Run `pnpm xy lint --rules` for the effective level of every rule.

## Included concerns

The non-React config composes TypeScript ESLint, core JavaScript and Markdown rules, Import X, simple import sorting, Unicorn, workspace rules, and stylistic rules. JSON duplicate-key checks are opt-in: add `jsonConfig`, `jsoncConfig` or `json5Config`, or spread `docsConfig` (Markdown plus all three), from `@ariestools/eslint-config-flat`. It does not currently bundle SonarJS, Prettier, or `eslint-plugin-no-secrets`.

The React config adds React X, React DOM, React Hooks, naming-convention, React Refresh, Web API, and optional Storybook layers. It does not re-export the flat package's building blocks, so a React repository that imports them must also list `@ariestools/eslint-config-flat` as a direct devDependency.

## Commands

| Command | Use |
|---|---|
| `xy lint [package]` | Run ESLint using the content cache; without a package, only changed workspaces |
| `xy lint --fix` | Apply ESLint fixes |
| `xy lint --fresh` | Clear lint caches and run from a fresh snapshot; run it on its own |
| `xy lint --analyze` | Project current findings across tiers using a tier-4 run |
| `xy lint --no-incremental` | Lint every workspace, not only changed ones |
| `xy lint --no-cache` | Run without the ESLint content cache |
| `xy lint --no-gitignore` | Temporarily disable repository `.gitignore` filtering |
| `xy lint --no-skip-empty` | Also lint packages with no lintable source files |
| `xy lint --meta skip` | Skip monorepo meta/root packages that have no `src/` (default `full`) |
| `xy lint --mode <mode>` (since 9.0.3) | `package-workers` (default), `workspace-eslint` (the ESLint CLI directly), or the experimental `shared-typecheck` |
| `xy lint --rules` | List effective ESLint rules for the project |
| `xy lint lint` | Check the local config against toolchain conventions |
| `xy lint lint --fix` | Normalize supported config-package, rule, and `.gitignore` issues |
| `xy cycle [package] [--depth 25]` | Lint with `import-x/no-cycle` deeper than the shared config's depth of 5 |

`xy relint` is a deprecated alias for `xy lint --fresh`. `--fresh` ignores `--fix`, `--type-checked`, `--analyze`, `--skip-empty` and `--meta`, so follow it with a separate `xy lint --fix` run when you need fixes.

The content cache lives under `.xy/cache/eslint` at the repository root. Use `--fresh` when config changes or stale snapshots make results suspect; do not routinely delete all dependencies.

For lint performance, tune parallel package workers with the global `--jobs` flag and find slow packages and phases with `--profile` (see [global behavior](commands.md#global-behavior)).

## Overrides and troubleshooting

Place justified local overrides after the recommended config. Run `xy lint lint` to distinguish intentional additions from redundant shared rules and overrides requiring review.

**Never override `no-restricted-imports`.** A later `no-restricted-imports` entry with options replaces the shared `paths` and `patterns` instead of merging with them, even when scoped with `files`. That silently drops the `index.ts` barrel and `src/` bans. The block `xy lint init` generates for accepted barrels does exactly this, and `xy lint lint` does not report it. Put barrel steering under `@typescript-eslint/no-restricted-imports`, scoped to TypeScript files, which leaves the core rule intact:

```ts
{
  files: ['**/*.ts', '**/*.tsx'],
  rules: {
    // formerly 'no-restricted-imports' in the generated block
    '@typescript-eslint/no-restricted-imports': ['warn', { paths: [...disallowedImportsXyoXl1] }],
  },
},
```

Write such a block by hand to steer imports toward `@ariestools/sdk`. The alternative is to rebuild the core rule at `error` from the exported `correctnessRulesConfig` (all files) and `srcImportsConfig` (with its `files` glob), appending the barrel paths to both.

`xy lint lint`, which `xy check` also runs, has four rules, all `warn` by default. Change their levels under `commands.lintLint.rules` in `xy.config.ts`, and list them with `xy lint lint --rules`:

| Rule | Checks |
|---|---|
| `lintlint.config-package` | The config imports the package matching the repo (React or not). `--fix` also moves retired `@xylabs/eslint-config(-react)-flat` imports and devDependencies to `@ariestools/*`, then installs |
| `lintlint.gitignore` | The config includes the root `.gitignore`. Fixable |
| `lintlint.redundant-rule` | Local entries identical to the shared config. Fixable (removes them) |
| `lintlint.rule-override` | Local entries that differ from the shared config. Report only |

The redundancy and override checks compare against the tier-2 type-checked baseline (plus Storybook for React), not the repository's tier. In a tier-3 or tier-4 repository, review `redundant-rule` findings before `--fix`, because an entry that deliberately restores a tier-2 level is reported as redundant.

If no files are linted, remember that `xy lint` without a package, `--fix` or `--analyze` lints only the workspaces changed since the last clean run. When none changed, it prints `No changed packages to lint.` and exits 0; use `--no-incremental` or `--fresh` for a full run. Otherwise verify workspace discovery, source globs, meta-package handling, and `--skip-empty`.

If type-aware lint is slow or fails on config files, verify the applicable tsconfig before disabling type checking. For files outside every tsconfig, such as scripts or templates, turn off only the type-aware rules for that glob, after the recommended config:

```ts
import { buildTypeCheckGateLayer } from '@ariestools/eslint-config-flat'

// in the config array, after ...recommendedConfig(...)
{
  files: ['scripts/**/*.ts'],
  languageOptions: { parserOptions: { projectService: false, project: false } },
  rules: buildTypeCheckGateLayer().rules,
},
```

If ignored files differ between the editor and CLI, run `xy lint lint --fix` and verify both the default run and `--no-gitignore` behavior.
