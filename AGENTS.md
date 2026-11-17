# Development guidance

## Orient

This repository is one private Node CLI sample. Read PRD.md and
`docs/IMPLEMENTATION_PLAN.md` before changing behavior.

## Authority

| Document | Kind |
| --- | --- |
| [docs/README.md](docs/README.md) | index |
| [PRD.md](PRD.md) | spec |

## Repository map

- One Node package at the repository root. Source lives in `src/`.
- Package manager: pnpm. Node 26 is declared in `.node-version`.

## Commands

Run these from the repository root:

```sh
pnpm check
pnpm build
pnpm test
```

- Use Node 26 and pnpm `>=12.21.0 <13.0.0`.
- Ordinary tests are offline. `pnpm test:sample` uses dapp-kit local XL1, an
  isolated Aries wallet, and controlled storage. Never touch the user's wallet.
- `pnpm test:live` explicitly writes one bounded real Auto Drive payload on the
  disposable local-chain path. No retries, public-chain writes, or default CI inclusion.

## Failures

- Keep one Node package. Use the public AriesTools CLI wallet for signing and
  broadcast; never load user seed phrases or private keys into the sample.
- Require one quoted message. `--autoDriveKey` overrides `AUTODRIVE_API_KEY`
  from the environment or `.env`. Never log or forward provider secrets to the wallet.
- Require fresh storage read-back before broadcast and finalized inclusion before
  success. Provider read-back is not completed archival.
- Retain public evidence for uncertain operations. No ledger, writer lock,
  automatic re-upload, or automatic rebroadcast.
- Preserve unrelated work; use conventional commits; never rewrite Git history.
- Do not restore `passWithNoTests`.
