# Plan Tooling

This file covers how `@ariestools/toolchain` supports the product-planning process in the [xy-product-plan skill](../xy-product-plan/SKILL.md): the repository scaffold, documentation lint, the experimental plan layout and manifest, and work items. The toolchain knows nothing of the paper sequence, version pins, the MVP line or PRDs. Those are conventions that skill defines. This file says where the tools help, where they are silent, and where they conflict.

| Step | Tool | Channel | Fit with the process |
|---|---|---|---|
| Create the repository | `xy repo init` | stable | Scaffolds `AGENTS.md`, `papers/README.md` and `docs/README.md`; no papers, roadmap or PRD |
| Front matter, index, staleness, archiving | `xy agent lint`, `index`, `archive` | stable (since 10.1.1) | Works as is; checks no pins |
| Layout check | `xyex plan lint` | experimental | Rejects product-prefixed, Red and Light papers; turn its paper rules off |
| Machine-readable plan | `xyex plan init`, `.xy/plan.json` | experimental | Optional; no Red slot and no MVP concept |
| Executable tasks | `xyex work` | experimental | Tracks tasks; nothing links them back to the plan |

## Scaffolding the repository

Create the repository with `xy repo init`. Its flags, defaults and the follow-up baseline are in [New project baseline](toolchain.md#new-project-baseline). Since 10.1.2 the scaffold includes:

- `AGENTS.md` with Orient, Authority, Repository map, Commands and Failures sections and a Documentation link block. Its authority table starts with rows for `papers/README.md` and `docs/README.md`.
- `papers/README.md`, with front matter (`kind: paper`, `version`, `status`, `date`).
- `docs/README.md`, the empty generated index.

It writes no paper, no `docs/ROADMAP.md` and no `notes/`. `pnpm xy agent init` then adds the `docs/` lifecycle folders (`decisions`, `runbooks`, `plans`, `evidence`, `archive`) and leaves existing files alone. The scaffold passes `xy agent lint --strict` but fails `xyex plan lint`, which also wants `CHANGELOG.md`, `CONTRIBUTING.md`, plain-named papers, a roadmap and `notes/README.md` (see below).

The xy-product-plan skill is outside the `xy skills` catalog, so `xy skills pick` rejects it and `xy skills lint` does not require or version-check it. Install it with `pnpm xy skills add ariestools/ariestools-skills --skill xy-product-plan -y`, or list it with its `source` in a package.json `xy.skills` entry (mind the config caveat in [`xy skills`](commands.md#xy-skills)).

## Papers, roadmap and PRDs under `xy agent lint`

`xy agent lint` reads every Markdown file under `docs/`, `papers/` and `specs/`, and never reads the Light Paper's PDF. What it checks for this process:

- **`docs.front-matter`** requires a `kind`. Its `--fix` infers `paper` under `papers/` and `plan` under `docs/plans/`. Nothing infers a kind for `docs/ROADMAP.md`, so write `kind: plan` yourself.
- **`papers.header`** warns when a paper does not mention the words version, status and date, in its text or front matter. It checks only that the words appear. It never reads a version, compares one paper's version with another's, or follows a `Derived from:` pin. `agents.links-resolve` checks only the links in `AGENTS.md`. **No tool detects a stale pin**; check pins by hand.
- **`docs.stale`** warns when a document's `reviewed` date, or its `date` without one, is more than 180 days old. That includes the papers and `docs/ROADMAP.md`. It skips `docs/evidence/`, `docs/decisions/`, `docs/archive/` and any `superseded` or `retired` document. When you re-check a paper or the roadmap without amending it, set `reviewed`.
- **`docs.orphan`** warns on a `docs/` file that neither `AGENTS.md` nor another document links. Link the roadmap from `AGENTS.md`, the active PRD from the roadmap and `AGENTS.md`, and an archived PRD from the roadmap's section for its version.

Close a PRD with `pnpm xy agent archive docs/plans/MVP_PRD.md`. It moves the file to `docs/archive/plans/`, sets `state: retired`, prepends a banner and regenerates the index. It does not rewrite links, so update the roadmap and `AGENTS.md` links in the same change ([`xy agent`](commands.md#xy-agent)). Run `pnpm xy agent index` after any other change under `docs/`.

## `xyex plan lint` and this layout

`xyex plan lint` (since 9.2.1) checks a fixed layout with eight rules, all errors by default. `xy check` does not run it, so nothing forces it on a repository. Its expectations conflict with this process:

| Rule | Requires | Conflict |
|---|---|---|
| `plan.papers.unexpected-files` | Under `papers/`, at any depth, only `README.md`, `WHITE-PAPER.md`, `YELLOW-PAPER.md` and an optional `GREEN-PAPER.md` | Fails on every `<PRODUCT>_*_PAPER.md`, the Red and Light Papers, and the PDF |
| `plan.papers.required-files` | `papers/README.md`, `WHITE-PAPER.md`, `YELLOW-PAPER.md` | Fails on product-prefixed names |
| `plan.notes.required-files` | `notes/README.md` | This process keeps notes under `docs/` |
| `plan.docs.required-files` | `docs/README.md`, `docs/ROADMAP.md` | Agrees |
| `plan.root.required-files` | Regular-file `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `README.md` | Neutral |
| `plan.root.claude-imports-agents`, `plan.root.agents-no-at-imports`, `plan.root.docs-index` | The adapter import, no `@` imports in `AGENTS.md`, Markdown links to `papers/` and `docs/` from `README.md` and `AGENTS.md` | Agrees |

**Never run `xyex plan lint --fix` in a repository that follows this process.** It moves every disallowed file under `papers/` (all the product's papers, and the PDF) to `notes/<basename>`. It writes "Draft." stub papers without front matter, which then warn under agent lint. It also edits `CLAUDE.md`, `README.md` and `AGENTS.md`.

To use plan lint for the rules that agree with this process, turn the conflicting rules off in `xy.config.ts`. `commands.planLint` is typed but experimental, and sets levels only, not the required file sets:

```ts
const config: XyConfig = {
  commands: {
    planLint: {
      rules: {
        'plan.notes.required-files': 'off',
        'plan.papers.required-files': 'off',
        'plan.papers.unexpected-files': 'off',
      },
    },
  },
}
```

## The plan manifest (`xyex plan init`)

`xyex plan init` (since 9.2.1) writes `.xy/plan.json`, the toolchain's machine-readable plan. It is optional. Adopt it only with the owner's agreement. In a reviewed manifest, the manifest is by its own rules the authority for phase state, so it and `docs/ROADMAP.md` must agree. State in `AGENTS.md` which one wins, and update both in the same change.

- **Initialization.** It scans git-tracked Markdown files and proposes candidates by file name. Before matching, it lowercases each name and turns `_` into `-`, so it recognizes `<PRODUCT>_WHITE_PAPER.md` and the Yellow, Green and Light papers, and `ROADMAP.md`. It ignores the Red Paper. A colour that matches more than one file is left `unresolved`. It writes `status: bootstrap`, never overwrites an existing manifest, and `--dry-run` writes nothing. A bootstrap manifest is a list of candidates, never authority.
- **Paper slots.** The version 1 schema requires `white`, `yellow` and `green` slots and allows an optional `light`. The `papers` object is closed, so there is no Red slot. Catalog the Red Paper as an ordinary entry under `documents` with `planRole: other`, and each PRD with `planRole: implementation-plan`.
- **Roadmap.** A reviewed roadmap has `asOf`, `northStar` and `phases`. Each phase has an id, title, intent, state (`planned`, `active`, `blocked`, `complete`, `deferred`, `cancelled`), dependencies, work item ids, at least one owner and at least one gate. A gate marked `met` needs evidence. There is no MVP concept. Map each roadmap milestone to a phase, and mark the MVP line with a namespaced extension on each phase, for example `"extensions": { "x-product-plan": { "version": "mvp" } }`. Extension keys must match `^x-[a-z0-9]+(?:[.-][a-z0-9]+)*$`.
- **Lifecycle metadata.** Keep it in front matter, and set the manifest's `metadata.source` to `front-matter` ([xy-agent: plan layout and manifest](../xy-agent/lifecycle.md#plan-layout-and-manifest-experimental)).

The schema and its rules are in the toolchain's [plan manifest guide](https://github.com/ariestools/toolchain/blob/main/docs/plan-manifest.md).

## Work items (`xyex work`)

A work item has no phase, milestone or PRD field, and no `xyex work` command reads `.xy/plan.json`. The only link runs the other way: a manifest phase lists the ids of its work items. To tie tasks to the plan:

- Anchor each item to the active PRD with `--file docs/plans/MVP_PRD.md`, and tag it with its milestone and version (`--tag M2 --tag mvp`).
- List the item ids in the PRD's `workItems:` front matter.
- Keep acceptance criteria in the PRD. An item's `--acceptance` and `--verify` describe that task only, not the version gate.

The commands are in [`xyex work`](commands.md#xyex-work-experimental).
