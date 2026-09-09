# Auto Drive datalake sample

Private planning-stage monorepo for an XYO SDK sample using selective Auto Drive
storage. This initial repository contains tooling and implementation documents;
it does not yet run a dApp, write payloads, or implement PermaStore behavior.

See [the product requirements](PRD.md) and
[the implementation plan](docs/IMPLEMENTATION_PLAN.md) for the intended behavior,
boundaries, and milestones.

## Planned packages

| Directory | Intended role |
| --- | --- |
| `packages/protocol` | Environment-neutral schemas and shared contracts |
| `packages/web` | React browser application |
| `packages/server` | Node service for authenticated, selective storage |

These directories currently hold design READMEs, not executable workspaces. Add
their package manifests and runtime-specific configuration when implementing each
package. The root workspace glob already reserves `packages/*`.

## Tooling

Use Node 24.14.1 and pnpm 12.3.4, as recorded in the repository. From the root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test
```

The root uses the published Aries Tools toolchain, TypeScript, ESLint, and Vitest
configuration packages. `pnpm check` runs strict repository policy checks;
`pnpm build` runs native compilation, dependency, package, and lint checks;
`pnpm test` runs the shared Vitest preset. With no application sources or tests,
these commands validate the foundation only. `passWithNoTests` is explicitly
enabled for initialization and must be removed when the first behavior is added.

CI runs these gates on GitHub-hosted Ubuntu. No deployment or package publication
workflow is configured. Default test discovery excludes `spec/live` and `.live.ts`
files. Credentialed provider or chain tests will require a separate explicit
configuration and command when implemented.

## License

The sample source is under the [MIT license](LICENSE). Repository visibility is
private; the license does not change its access settings.
