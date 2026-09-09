# Development guidance

This repository is a planning-stage private sample. Read `PRD.md` and
`docs/IMPLEMENTATION_PLAN.md` before implementing product behavior.

- Use Node 24 and the pinned pnpm version. Run all `xy` commands from the root.
- Use `pnpm check`, `pnpm build`, and `pnpm test` for the repository gates.
- Keep the future protocol package environment-neutral, the web package React/browser,
  and the server package Node-only. Give each implemented package its own runtime config.
- Preserve unrelated work and use conventional commits. Do not rewrite Git history.
- Keep credentials server-side and out of tracked files. Ordinary tests must not
  contact Auto Drive or a chain. Live tests require a separate explicit command.
- Never report a provider receipt as archival confirmation or an unimplemented
  flow as successful. This scaffold provides no application or storage behavior.
- Replace the documented `passWithNoTests` initialization allowance when the first
  implemented behavior supplies its tests.
