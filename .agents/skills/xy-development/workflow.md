# Development Workflow

## Use the Repo's Native Toolchain

Before running any build, lint, test, or dev command, **discover what the repo already provides** and use that. Never run ad-hoc one-off commands when the repo has a defined way to do things.

### Discovery Checklist

Before executing commands in a repo, check these in order:

1. **Repo instructions** — read the repo's `AGENTS.md` / `CLAUDE.md` first. Where they name commands or conventions, they override this checklist.

2. **Package manager and runtime** — check the root `packageManager` field first (it pins the exact version), then the lock file, and use that manager exclusively:
   - `pnpm-lock.yaml` → use `pnpm`
   - `bun.lock` / `bun.lockb` → use `bun`
   - `yarn.lock` → use `yarn`
   - `package-lock.json` → use `npm`
   - Never mix package managers. Never run `npm install` in a pnpm repo.
   - Use the Node version pinned by the `volta` field, `.nvmrc`, or `engines`.
   - CLI flags differ between package-manager majors (pnpm 12 rejects some pnpm 10 flags), so check `<pm> <cmd> --help` for the pinned version before relying on a flag.

3. **package.json scripts and CI** — read `scripts` in `package.json` before running anything:
   - In a repository that uses `@ariestools/toolchain`, task completion is the [Definition of Done](#definition-of-done): `pnpm xy build <package>` and `pnpm xy test <package-or-path>` from the root. `xy` hands off to a same-named root script unless `--no-defer` is passed. When that script is a different pipeline, run the command the repository's `AGENTS.md` names.
   - Elsewhere, if `"build"` exists, use `pnpm build` — not raw `tsc` or `esbuild`. If `"lint"` exists, use `pnpm lint` — not raw `eslint .`. If `"test"` exists, use `pnpm test` — not raw `jest` or `vitest`. If `"dev"` exists, use `pnpm dev` — not raw `ts-node` or `tsx`.
   - The scripts may include flags, configs, or pipelines that raw commands miss.
   - If the script you need is absent, look for a repo CLI among the root `devDependencies` (XY repos: `pnpm xy <command>` from the root; see [xy-toolchain](../xy-toolchain/toolchain.md#start-from-repository-truth)). A missing script never makes raw `tsc`, `eslint`, or `vitest` the answer.
   - Check `.github/workflows/*` for the commands CI treats as the gate. The local completion gate can be narrower than CI. Match CI when handing off a change CI will reject.

4. **Monorepo awareness** — check if the repo uses workspaces:
   - Look for `workspaces` in `package.json`, `pnpm-workspace.yaml`, `nx.json`, or `lerna.json`
   - Run commands at the correct scope (root vs. package)
   - Use the repo's workspace-aware entry point from the root: its CLI with a package argument (XY repos: `pnpm xy build <package>`), or `pnpm --filter <package> run <script>` only for scripts that package actually defines. Never `cd` into a package to build it.

5. **Config files** — check for existing configuration before assuming defaults:
   - `tsconfig.json` / `tsconfig.*.json` — don't assume compiler options
   - `eslint.config.*` — don't assume lint rules (`.eslintrc.*` is legacy; ESLint 10 no longer reads it)
   - `vitest.config.*` / `jest.config.*` — don't assume test setup
   - `pnpm-workspace.yaml` — workspace packages and package-manager policy
   - Repo CLI config such as `xy.config.ts` — don't assume tool defaults
   - These files are authoritative. Don't override them with CLI flags unless intentionally fixing something.

6. **Dependency versions** — add new dependencies with the package manager (`pnpm add <package>` or the equivalent) so it resolves a current version. Do not manually write version numbers in package.json from memory — they may be significantly outdated.
   - In a workspace, add to the package that owns the dependency (`pnpm --filter <package> add <dep>`, `-D` for dev); use `-w` only for root tooling.
   - Respect the repo's package-manager policy (pnpm `minimumReleaseAge`, and the build allowlist `allowBuilds`, or `onlyBuiltDependencies` on older pnpm 10). The resolved version may trail npm `latest` by design — do not override it. A dependency that needs install scripts needs an entry in that allowlist.
   - "Latest" can fall outside a tool's peer range (e.g. TypeScript 7 vs `@ariestools/toolchain`, which needs 5.9 or 6). Check the peers of the tools that consume a package before adding or bumping it. In XY repos, upgrade with `pnpm xy updo`, which keeps TypeScript below 7.
   - If a peer needs a specific version, pin to the range the dependency's `peerDependencies` declare (`pnpm view <dep> peerDependencies`, then `pnpm add <peer>@<range>`).
   - After adding, match the repo's range form; `pnpm add` saves `^` by default (XY repos check the form with `pnpm xy deplint`).

### Repo Conventions

Beyond scripts and config files, observe how the existing codebase does things:
- How are modules structured? Follow the same patterns for new code.
- How are exports organized? Match the style.
- How are dependencies declared? If the repo uses `dependencies` vs `devDependencies` with intent, respect that.
- If there are existing examples of what you're building (a similar component, endpoint, or utility), use them as a template rather than inventing a new pattern.

When in doubt, read existing code first and follow its lead.

The same applies to documents. If the repo has an `AGENTS.md`, a `docs/` tree, or a `papers/` directory, follow their existing conventions for naming, front matter, and where a new document belongs. The [xy-agent skill](../xy-agent/SKILL.md) describes the house pattern for these and is recommended where a repo has adopted it. If `../xy-agent/` is missing, install it with `npx skills add ariestools/ariestools-skills --skill xy-agent`.

### Architecture decisions

When a change introduces distributed work, a controller or exclusive claim, or new recovery and effect semantics, consult the [ariestools-architecture skill](../ariestools-architecture/SKILL.md) if available. Identify how eligible workers discover obligations, how their outcomes are accepted, how concurrent attempts remain safe at the effect boundary, and how a replacement recovers. Name the invariant or resource bound behind any required coordination and keep its authority scoped to that requirement.

This is a decision review, not a new universal completion gate or permission request. Keep ordinary changes within the repository's accepted design. If the skill is not installed, apply the concise default above and the repository's existing contracts; read an accessible canonical source when more detail is needed. Do not invent toolchain catalog support or block unrelated implementation on installing a companion skill.

### Credential Safety

Never commit secrets or authentication tokens to the repository:
- Keep registry credentials outside the repository: user-level npm configuration, or a published config file that names an environment value without storing it. A tracked project `.npmrc` may hold only non-secret settings — do not delete or untrack it, and never write a token into it.
- `.env`, `.env.*` — may contain API keys and secrets. Gitignore them, keeping the `!.env.example` exception for a committed template.
- Never log, echo, or display auth tokens in command output.
- When setting up a new project, verify `.gitignore` covers `.env` / `.env.*` and that no tracked file holds a token before the first commit.

### The Rule

If the repo has a way to do it, use the repo's way. Ad-hoc commands are for exploration only — never for producing a deliverable.

**This applies even when you just created the scripts yourself.** After scaffolding a new project, use the scripts you defined — don't bypass them with raw commands like `npx tsc -b` or `npx eslint .` for "quick checks". The scripts exist to run the correct pipeline; partial raw invocations can miss flags, configs, or pipeline steps and give misleading results.

## Definition of Done

These criteria verify implementation work. A routine deployment of already verified application source uses [Deployment conventions](deployment.md): verify the changed route and its result, and keep application and protocol invariants without adding release gates.

This section is the agent completion gate. Command lists elsewhere say what a command includes, what CI runs, and what to run after a toolchain configuration change. Finish the task with the commands here.

A feature is not complete until **all of the following are true**. The gates are tool-neutral. Where the repository's `AGENTS.md` names the completion command, or names an exception (a root script that `xy build` defers to, a lint run that is not a gate, a required package scope), follow that.

In a repository that uses `@ariestools/toolchain`, finish a code change from the repository root with:

```sh
pnpm xy build <package>
pnpm xy test <package-or-path>
```

`xy build` runs compile, publint, deplint, and ESLint, and runs no tests. Scope `<package>` to each workspace package the change affects. Pass a spec path to `xy test` when the change is narrower than the package, and run the package's tests or the whole suite when the change touches shared code or that narrow run leaves a regression in doubt. `--strict` belongs to CI.

A root `build` or `test` script receives `xy build` or `xy test` when one exists. A script that calls `xy build` or `xy test` is this gate. When the script is a different pipeline, run the command the repository's `AGENTS.md` names; `--no-defer` runs the built-in.

Also run `pnpm xy check` when the change touches repository policy, `AGENTS.md`, `docs/`, skills, or package-manager configuration. [Lifecycle gates](../xy-toolchain/commands.md#lifecycle-gates) lists what each command includes and excludes. After a toolchain configuration change, run [Verify the selected profile](../xy-toolchain/project-profiles.md#verify-the-selected-profile). That checklist is the configuration check. A source change uses the two commands above.

Experimental `xyex verify` (since 10.3.0; `xy verify` prints the experimental warning) runs compile, then test, then check for the whole repository and stops at the first failure. It is not this gate: it skips the ESLint, deplint, and publint work inside `xy build`, and it always runs `xy check`. See [Lifecycle gates](../xy-toolchain/commands.md#lifecycle-gates).

### 1. Builds Cleanly
- The completion build succeeds with zero errors
- No new TypeScript compiler errors introduced
- In a toolchain repository the command is `pnpm xy build <package>` for each package the change affects

### 2. Linter Passes
- Lint errors are zero. In a toolchain repository, `xy build` is that lint run
- A zero exit code proves zero warnings only in strict / max-warnings-0 mode. When CI lints with `--strict`, warnings fail the hand-off; otherwise read the warning count and continue
- Don't suppress lint rules to make it pass — fix the underlying issue
- If a lint rule must be disabled, use an inline comment with a justification

### 3. Tests Pass
- Existing tests that cover the change pass — no regressions
- New behavior has corresponding tests
- Tests follow the principles in [testing.md](testing.md)
- In a toolchain repository the command is `pnpm xy test <package-or-path>`. Widen it when the change is shared or a narrow run leaves a regression in doubt

### 4. Dependencies Are Correct
- New packages are added to the right place: `dependencies` for runtime, `devDependencies` for build/test-only
- Dependencies are installed via the repo's package manager — don't forget to actually run `pnpm install` (or equivalent)
- No phantom dependencies — if your code imports it, it must be in `package.json` (don't rely on transitive installs)
- Version ranges follow the repo's existing conventions (pinned, caret, tilde)
- All peer dependency issues are resolved — install the required peers at the versions the package expects, not just the latest. Install output is not a reliable peer report: a no-op install (lockfile already up to date) prints no peer warnings. After adding or changing dependencies, run an explicit check for the pinned pnpm major (`packageManager`): on pnpm 11+, `pnpm peers check` (non-zero exit on issues; `--json` for automation, `--lockfile-only` to skip reading `node_modules`); pnpm 10 has no `peers` command, so run `pnpm install --resolution-only` and read its output, because by default it reports peer issues as warnings and still exits 0.
- **Transitive peer dependencies can cause runtime failures that the compiler and linter miss.** pnpm's strict isolation means peer deps of your dependencies are not automatically available to Vite's bundler. If a dependency uses MUI, emotion, or another framework internally, your app must install those peer deps explicitly. When adding a new dependency, check its `peerDependencies` (and those of its direct dependencies) for packages your app doesn't already provide. A clean compile or type-check does not guarantee the app will run — missing peer deps surface as `Could not resolve "..."` errors at runtime.

### 5. Dev Server Starts and App Loads Cleanly (apps only)
- If the project is an application with a dev server (`pnpm dev` or equivalent), start it and confirm it launches without errors
- The production build and dev server often use different tools (e.g., Vite serves unbundled ESM in `dev` but produces a Rolldown bundle in `build`) — passing one does not guarantee the other
- **A dev server that starts is not the same as an app that runs.** Compilation success does not catch runtime errors, missing peer deps surfaced by the browser bundler, import resolution failures, or errors thrown during component mount. You must actually load the page.
- Use whatever browser automation the session provides to verify the running app:
  - Open the dev server URL, then read the console messages (errors/warnings) and network requests (failed 4xx/5xx, unresolved modules).
  - Tool names vary by host and change between releases. In Claude Code, for example, the Claude in Chrome tools (`mcp__claude-in-chrome__*`) and the desktop app's built-in browser pane (`mcp__Claude_Browser__*`) both offer `navigate`, `read_console_messages`, and `read_network_requests`.
  - Exercise the feature you just built — click the button, submit the form, navigate the route — and re-check the console. Mount-time errors often only appear after interaction.
- An app is only "done" when it loads with a clean console and no failed network requests on the golden path.
- If no browser automation is available in this session, **say so explicitly** — do not claim the app works based solely on a successful compile. State: "dev server starts, but I could not verify runtime behavior in a browser."

### 6. No Placeholders or Mocks in Delivered Code
- Every user-visible action must do what it claims. If the UI says "Saved", the code must actually persist it — not call `console.log` with a TODO comment.
- Do not stub integrations with placeholder implementations (e.g., a throwaway random key instead of a real wallet or auth connection, a no-op function behind a "Submit" button). If the real integration isn't wired up yet, the UI should not present it as functional.
- If something genuinely cannot be implemented yet (missing API, blocked dependency), disable the UI element or show an explicit "not yet available" state — never fake success.

### 7. No Regressions
- Existing functionality still works, not just the new code
- If the change touches shared utilities or interfaces, verify downstream consumers
- If unsure whether something regressed, run the full test suite — don't assume

### Applying the Definition of Done

The completion gate is **layered**. Before declaring any task complete, walk every layer that applies. (These are completion-gate layers, not the xy-development → xy-toolchain → ariestools-sdk skill stack.)

1. **Layer 1 — Generic DoD** (this file): builds, lints, tests, dependencies, dev server, no placeholders, no regressions. Applies to every project. In `@ariestools/toolchain` repos, the commands are the two above, plus `pnpm xy check` for the policy and document edits named there. [Profile verification](../xy-toolchain/project-profiles.md#verify-the-selected-profile) applies after a toolchain configuration change.
2. **Layer 2 — Domain DoD** (when a domain skill pack is installed — e.g. dApp checklists in product-specific skill repos): extends Layer 1 with domain-specific gates. Applies only when the project is in that domain.
3. **Layer 3 — Project-specific acceptance criteria**: the `## Acceptance criteria` section of the project's active PRD is also gating. The active PRD is a `PRD.md` at the working directory, or, in a product planned as a series of versions, the versioned PRD that the roadmap and `AGENTS.md` name as active (`docs/plans/MVP_PRD.md`, then `V2_PRD.md`, …). Generated at planning time per the next section.

**The rule:** if an item in an applicable layer fails, the work is not done. Fix it and re-run the gate that reported it. A source change re-runs `xy build` and `xy test` for the packages it affects. A policy or document change also re-runs `xy check`. A UI change re-checks the browser. Re-run a layer the change cannot fail only when a shared surface makes the result uncertain. Do not report complete with known-failing items rationalized as "out of scope" unless the criterion was explicitly marked optional or skipped with a reason in the layer's own conventions (e.g. dApp DoD sections tagged "if applicable").

This rule applies equally to new features, bug fixes, and refactors. It is the only definition of "done" that matters for agent-facing work.

## Writing Project-Specific Acceptance Criteria

When a project has a PRD (a `PRD.md` written at planning time by a domain planning/scaffold skill or by the project author, or a versioned PRD such as `docs/plans/MVP_PRD.md`), its `## Acceptance criteria` section is **generated** — not pulled from a fixed catalog. This is because the space of buildable projects is open-ended, and a project's success shape is best derived from its spec and the relevant domain skills loaded at planning time.

When generating Layer 3 criteria for a PRD, follow this shape:

### What goes in
- **One criterion per user-facing requirement.** If the spec says "two players can play simultaneously," that's a criterion. If the spec says "anyone can browse past games without a wallet," that's a separate criterion.
- **Both positive and negative assertions.** Positives describe what works ("the reveal phase records the outcome on-chain"). Negatives describe what is prevented ("no player can see the opponent's plaintext before both commit"). Negative criteria are often the most load-bearing — they capture the requirements the user implied but didn't articulate.
- **Domain anti-patterns translated into project assertions.** A domain pack's DoD checklist enumerates generic anti-patterns. Convert the ones that apply to this project into PRD-style criteria so the loop has a project-local form to check. Example: dApp DoD says "no hand-rolled JSON-RPC envelopes"; PRD criterion becomes "`grep -rE '\"jsonrpc\"\\s*:' src/` returns nothing."
- **Verification methodology.** When the project includes headless verification, name the script's pass condition explicitly: "`pnpm verify` exits 0 after running a full round end-to-end."

### What stays out
- **Restated DoDs.** Layer 1 and Layer 2 are already in scope by reference. Do not copy their bullets into Layer 3.
- **Per-line / per-function tests.** Those belong in test files, not the PRD. Layer 3 criteria are observable from outside the implementation — UI flow, command output, file inspection, grep.
- **Speculative requirements.** Only what the spec says or what the relevant patterns require. Do not add "while we're here" criteria.

### Sizing
- **5–10 items is the sweet spot.** Fewer suggests important user-facing behaviors are missing. More suggests the criteria are too granular.
- **Group as `Positive:` and `Negative:` subheadings** so the agent can scan them and the user can sanity-check coverage in both directions.

### Observability
Each criterion must be observable without reading the implementation:
- **UI-observable** — visible to a user in a browser session
- **Command-observable** — exit code or stdout from a script (`pnpm verify`, `pnpm test`, `pnpm lint`)
- **File-observable** — grep, file presence/absence, contents match a pattern
- **Network-observable** — HTTP response from an endpoint matches an expectation

If a criterion can't be checked without an agent re-reading the source, rewrite it until it can.
