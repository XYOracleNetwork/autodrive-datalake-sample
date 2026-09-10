# Development guidance

This repository is a private sample under implementation. Read `PRD.md` and
`docs/IMPLEMENTATION_PLAN.md` before implementing product behavior.

- Use Node 24 and the pinned pnpm version. Run all `xy` commands from the root.
- Use `pnpm check`, `pnpm build`, and `pnpm test` for the repository gates.
- Keep the protocol package environment-neutral, the client and web packages browser-compatible,
  and the server package Node-only. Give each implemented package its own runtime config.
- Preserve unrelated work and use conventional commits. Do not rewrite Git history.
- Keep credentials server-side and out of tracked files. Ordinary tests must not
  contact Auto Drive or a chain. Live tests require a separate explicit command.
- Never report a provider receipt as archival confirmation or an unimplemented
  flow as successful. Keep local-chain, controlled-storage, and live-provider evidence distinct.
- `pnpm test:sample` explicitly starts the disposable local XL1 chain through
  dapp-kit's Vitest installer. It must not contact Auto Drive or a public chain.
- Do not restore `passWithNoTests`; implemented behavior must supply meaningful tests.
