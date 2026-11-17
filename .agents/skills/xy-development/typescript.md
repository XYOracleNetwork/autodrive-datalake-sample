# TypeScript Conventions

## Strictness Posture

We are strict and opinionated. In XY repos the compiler (`@ariestools/tsconfig`: `strict`, `noImplicitOverride`, `erasableSyntaxOnly`) and the shared ESLint config (`@ariestools/eslint-config-flat`, tier 3 with type checking by default) enforce much of what follows. Items are marked:

- *(compile)* — `tsc` rejects it.
- *(lint)* — the default lint config flags it. Errors fail `pnpm xy build` and `pnpm xy lint`. Warnings fail `pnpm xy lint --strict` and a CI job that lints strict. The [Definition of Done](workflow.md#definition-of-done) uses `xy build` as the lint run and leaves `--strict` to CI. `pnpm xy lint --fix` autofixes import order and type-import style.
- Unmarked — a convention or judgment call that no tool checks. These need the most care.

A repo that lowers its lint tier or turns off type checking loses some of these rules; the conventions still apply. Code shape is linted too: keep functions small (complexity above 18, more than 32 statements, or nesting deeper than 6 are lint errors) and files under 512 lines of code; omit `public`; order class members by kind, then alphabetically. Full rule list: [xy-toolchain ESLint](../xy-toolchain/eslint.md). Compiler settings: [xy-toolchain TypeScript](../xy-toolchain/typescript.md).

## The `any` Policy: Exhaust Alternatives First

`any` is a last resort. It should be so painful to use that you investigate and implement alternatives before reaching for it.

When you encounter a situation where `any` seems necessary, work through this ladder:

1. **`unknown`** — the type-safe top type. Use it when you don't know the shape yet and will narrow later.
2. **Generics / type parameters** — if the type varies by call site, parameterize it.
3. **Type assertions (`as Type`)** — for narrowing when you know more than the compiler. Prefer `as` over `any`.
4. **Overloads** — for functions with genuinely different input/output type combinations.
5. **Only then: `any`** — scoped to one line with `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <why the alternatives fail>`, because `no-explicit-any` is a lint error at every tier. Never disable it file-wide. Bare `eslint-disable` comments and `@ts-ignore` are lint errors; use `@ts-expect-error <description>` only to suppress a compiler error.

If `any` starts propagating to other types (infecting inferred types downstream), that is a strong signal to reconsider. `any` should be contained, never contagious: with type-checked lint, `any` that flows onward trips the `no-unsafe-*` rules (assignment, member access, call, argument, return), so narrow to `unknown` or a concrete type at the boundary.

Never use `any` for convenience, speed, or to silence a type error you don't understand. Understand the error first.

## Return Types: Annotate Exports, Infer the Rest

**Annotate the return type of every exported function and method** — it is the module's contract. This is a convention; neither lint nor the compiler checks it.

- When a function uses `await`, declare `Promise<T>`, never `Promise<Promisable<T>>`.
- Always annotate type guards (the `value is T` return type) and recursive functions.

Everywhere else (local helpers, callbacks, inline arrows) let inference do its job. Inferred return types often produce better covariance and contravariance than manually annotated ones. Annotate a local function only when the inferred type is unexpectedly wide or complex.

## Interfaces vs Types

**Prefer `interface`** over `type` for object shapes *(lint)*.

Use `type` only when `interface` can't express it:
- Union types: `type Result = Success | Failure`
- Intersection types: `type Combined = A & B`
- Mapped or conditional types
- Aliasing primitives or tuples: `type ID = string`

Rationale: interfaces are extendable via declaration merging, produce clearer error messages, and are more idiomatic for describing object shapes.

## Readonly

Use `readonly` where it **communicates intent** — it signals that a value shouldn't be mutated after creation.

This is not a blanket rule. Apply it when it makes contracts clearer:
- Function parameters that shouldn't be modified by the callee
- Class properties set in the constructor that shouldn't change (declare them as `readonly` fields; constructor parameter properties are not allowed, see [Erasable Syntax Only](#erasable-syntax-only))
- Array/object parameters where mutation would be a bug

Don't add `readonly` reflexively to everything — use it where it tells the reader something meaningful.

## Erasable Syntax Only

`@ariestools/tsconfig` sets `erasableSyntaxOnly` and `noImplicitOverride`, so TypeScript constructs that emit runtime code are compile errors:

- **No `enum` or `const enum`** *(compile)*. Use a string-literal union (`type Status = 'active' | 'inactive'`). When you need runtime values, use an `as const` object with a derived union (or `Enum({ … })` from `@ariestools/sdk`):

  ```ts
  export const Status = { Active: 'active', Inactive: 'inactive' } as const
  export type Status = typeof Status[keyof typeof Status]
  ```

- **No constructor parameter properties** (`constructor(private readonly x: T)`) *(compile)*. Declare the fields explicitly and assign them in the constructor.
- **No runtime `namespace`** and no `import x = require()` *(compile)*.
- **Mark overriding members with `override`** *(compile)*.

## ESM Only

Always use ES modules. No CommonJS.

- Use `import` / `export`; never `require()` *(lint)* or `module.exports`.
- Set `"type": "module"` in `package.json`
- Always write an explicit extension in relative imports, matching the repo. Repos on `@ariestools/tsconfig` use the source extension (`./thing.ts`, `./Widget.tsx`): `allowImportingTsExtensions` is on because the toolchain, not `tsc`, emits the output. `.js` is only for repos whose `tsc` emits directly. In XY repos never write `.js` for a TypeScript source: it compiles, but it slips past the lint ban on `./index.ts` barrel imports.

## Imports: Root Barrel Packages and Tree Shaking

**Import from the root barrel package of each monorepo.** Many SDK monorepos publish a root package that re-exports the surface of their separately published sub-packages; reach for a named sub-package only when the symbol genuinely is not on the barrel. Tree shaking eliminates what you don't use.

```ts
// Good — root barrel import, tree shaking handles the rest
import type { Payload } from '@xyo-network/sdk'
import {
  Account, BoundWitnessBuilder, PayloadBuilder,
} from '@xyo-network/sdk'

// Avoid — importing from separately published sub-packages
import { Account } from '@xyo-network/account'
import { PayloadBuilder } from '@xyo-network/payload-builder'
import type { Payload } from '@xyo-network/payload-model'
```

This is simpler, more maintainable, and the bundler eliminates unused exports.

Some packages also publish subpath exports (`pkg/feature`) built as separate bundles, so a class, singleton, or other module state reached through a subpath can be a different object from the same name on the root, and `instanceof` checks across the two fail. **By default, do not mix a package's root and subpath imports in one dependency graph.** A package's own skill sets its barrel and can sanction narrow exceptions, so check it and follow it: the ariestools-sdk skill for the sdk-js packages (it allows `@ariestools/sdk` subpaths for `import type` and stateless functions but never for classes or stateful setup, and requires a backend subpath, never the root, for `@ariestools/storage-adapters`), the ariestools-sdk-react skill for `@ariestools/sdk-react*` (apps import umbrella subpaths, libraries the owning focused package's subpath, and nothing imports a focused package's root), and domain packs such as `XYOracleNetwork/xyo-skills` for theirs. Otherwise, follow the style the package's other consumers use.

## Import Style

- **Inside a package**, import the defining file directly (`./thing.ts`), never an `index.ts` barrel. Lint rejects `./index.ts` and `../…/index.ts`, but not subfolder barrels such as `./sub/index.ts`. Reach other workspace packages by package name, never by relative path or through their `src/` *(lint)*.
- **Node built-ins** take the `node:` prefix, and `node:path` takes a default import: `import PATH from 'node:path'` *(lint)*.
- **Type-only imports** are marked as types, preferably as a separate `import type { … }` statement *(lint, autofixed)*.
- **No namespace imports** (`import * as X`); import named symbols.
- **Order** *(lint, autofixed)*: simple-import-sort groups side-effect imports, `node:` built-ins, packages, absolute paths, then relative paths, with a blank line between groups. Run `pnpm xy lint --fix` rather than ordering by hand.

## Conditions, Nullish Values, and Promises

- Prefer optional chaining (`?.`) and nullish coalescing (`??`) over manual null checks *(lint)*.
- Don't rely on truthiness of nullable strings, numbers, or booleans; write the comparison *(lint)*: `name !== undefined && name.length > 0`, `count !== undefined && count > 0`, `isVerbose === true`.
- Compare with `=== undefined`, not `typeof x === 'undefined'` *(lint)*.
- Prefer `undefined` for absent values; `null` is allowed where an API calls for it.
- Await every promise, or mark a deliberate fire-and-forget with `void` *(lint)*. Don't pass an async function where a void-returning callback is expected *(lint)*.

## Other Conventions

- **Naming**: PascalCase for types and interfaces, camelCase for variables and functions
- **Booleans** and boolean-returning predicates start with `is`, `has`, `should`, or `can`
- **Files**: camelCase for modules, PascalCase for class and component files (lint checks the case but also accepts kebab-case)
- **Named exports** over default exports, except where a tool requires a default export (`eslint.config.ts`, `vitest.config.ts`, `xy.config.ts`, Storybook `*.stories.tsx`)
- **Functions**: `function` declarations at top level; arrow functions only for callbacks
- **Unused bindings**: prefix intentionally unused parameters and variables with `_` *(lint)*
