# Behavior-Preserving Refactors

A refactor reorganizes code without changing what it does. Use this file when moving code between files or packages, splitting or merging packages, breaking dependency cycles, or auditing a monorepo's package graph for misplaced exports. The goal is a package graph where a package's name predicts what it exports and what it may import.

## The Invariant

- Change location, never behavior: no edits to logic, signatures, return types, or test assertions as part of a refactor.
- Do not rename symbols while moving them. If a move would collide with an existing name in the destination, ask the owner instead of renaming.
- Keep each move its own `refactor(scope): …` commit, separate from fixes and features ([Atomic Commits](git.md#atomic-commits)).
- Note bugs, performance problems, or style issues you see along the way, but do not fix them in the same change. Report them at the end.

## Before the First Change

1. Find the repo's build, lint, and test commands ([Discovery Checklist](workflow.md#discovery-checklist)).
2. Run all three on the untouched tree and record the result. A later failure counts as caused by the move only if the baseline passed.
3. If the baseline is red, stop and let the owner decide whether to proceed and which failures are pre-existing.
4. Record the conventions to match: package naming, how each package's entry point exports its surface, file naming, and where tests live.

## Auditing a Package Graph

Build the internal dependency graph from the workspace manifest (`pnpm-workspace.yaml` or the `workspaces` field) and each package's dependencies, and infer the intended layer order (foundations first, apps last). Summarize each package's single responsibility, working from leaf packages toward the most-depended-on, then look for:

| Finding | Signal | Default severity |
|---|---|---|
| Circular dependency | Two packages depend on each other, directly or transitively | High |
| Inverted dependency | A lower-layer package imports from a higher layer | High |
| Grab-bag package | One package (often `utils`, `helpers`, `common`) exports three or more unrelated concerns | High |
| Misplaced export | An export whose concern matches another package's responsibility better than its own | Medium |
| Reach-through | A imports from B something that belongs to C, so A's real dependency on C is missing | Medium |
| Missing package | Outliers from several packages share a concern that has no home | Medium |
| Debatable placement | A single outlier export or a naming inconsistency | Low |

These are not findings: a types, config, or constants package that everything imports; a `utils` package with fewer than three distinct concerns; shared test utilities, unless they are mixed with runtime code.

Present the findings sorted by severity. For each one, give the proposed move, the files and tests it touches, the number of import sites, and its risks. **Change nothing until the owner has approved, vetoed, modified, or deferred each item.** Then work through the approved items in that order.

(XY repos: `pnpm xy cycle` checks import cycles to depth 25, deeper than the shared lint config; see [xy-toolchain ESLint › Commands](../xy-toolchain/eslint.md#commands).)

## Moving Code Between Packages

Before the move, check that it creates no new cycle or inverted dependency. The destination must not depend, directly or transitively, on any package that will import the moved code. Then do all of the following as one unit:

1. Move the source file and its tests together, following the repo's test layout (XY repos: [Spec location](../xy-toolchain/testing.md#spec-location)).
2. Remove the exports from the source package's entry point and add them to the destination's.
3. Update every import site to the destination package. Inside the destination package itself, import the moved file directly ([Import Style](typescript.md#import-style)).
4. Fix the manifests: add the destination package to each importer, in the form the repo uses for internal dependencies (such as `workspace:`); give the destination the dependencies the moved code imports; and drop dependencies the source no longer uses (XY repos: `pnpm xy deplint`).
5. Update any `tsconfig` path aliases that pointed at the old location.

A new package copies the scaffolding of a similar existing package (`package.json`, `tsconfig`, lint and test config) and adds nothing that package lacks. Show it to the owner before you create it.

### Published packages

Removing an export from a published package breaks its consumers even when nothing in the repo breaks. Choose one:

- Keep a re-export at the old location, marked `@deprecated`. This works only if the old package can depend on the new one without a cycle or an inverted dependency.
- Ship the removal as a breaking change: `!` and a `BREAKING CHANGE:` footer ([Conventional Commits](git.md#conventional-commits)).

If a root barrel package re-exports both packages, its consumers do not see the move. Consumers who import the sub-package directly still do.

## Verifying Each Move

Run build, lint, and tests after every move, before you start the next one. Test the affected packages first, then run the full suite.

- **Failure caused by the move** (a broken import path, a missing export, an outdated alias or manifest entry): fix it, verify again, and say what you corrected.
- **Any other failure**, including one whose fix would change logic, a signature, or a test assertion: stop and report it. Do not continue to the next item until the owner decides.

A move is done when build and lint pass and every previously passing test still passes, as the [Definition of Done](workflow.md#definition-of-done) requires. At the end, report each item's outcome (done, vetoed, deferred), what moved, and the out-of-scope issues you noted.
