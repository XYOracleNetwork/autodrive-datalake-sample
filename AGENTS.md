# Development guidance

This repository is one private Node CLI sample. Read PRD.md and
`docs/IMPLEMENTATION_PLAN.md` before changing behavior.

- Use Node 24 and pinned pnpm. Run root `pnpm check`, `pnpm build`, and `pnpm test`.
- Keep one Node package. Use the public AriesTools CLI wallet for signing and
  broadcast; never load user seed phrases or private keys into the sample.
- Require one quoted message. `--autoDriveKey` overrides `AUTODRIVE_API_KEY`
  from the environment or `.env`. Never log or forward provider secrets to the wallet.
- Ordinary tests are offline. `pnpm test:sample` uses dapp-kit local XL1, an
  isolated Aries wallet, and controlled storage. Never touch the user's wallet.
- `pnpm test:live` explicitly writes one bounded real Auto Drive payload on the
  disposable local-chain path. No retries, public-chain writes, or default CI inclusion.
- Require fresh storage read-back before broadcast and finalized inclusion before
  success. Provider read-back is not completed archival.
- Retain public evidence for uncertain operations. No ledger, writer lock,
  automatic re-upload, or automatic rebroadcast.
- Preserve unrelated work; use conventional commits; never rewrite Git history.
- Do not restore `passWithNoTests`.
