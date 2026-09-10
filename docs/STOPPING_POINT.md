# Current CLI checkpoint

Updated September 10, 2026. The CLI supersedes all previous website/server designs.
This checkpoint accompanies the single-package CLI revision.

## Delivered

- One Node package at the repository root, with `src/`, a `sample-cli` bin,
  and `dist/node/cli.mjs`. All four former workspace packages and web/server
  code are removed. No React, HTTP listener, JWT, ledger, or writer lock.
- `sample-cli "<message>" --autoDriveKey <key>`. One nonempty quoted message is
  required; provider key precedence is flag, process environment, then `.env`.
  `AUTODRIVE_BUCKET` is optional. No user seed phrase or XL1 endpoint configuration.
- AriesTools CLI wallet owns the keys, password prompt, transaction signing,
  and broadcast. The sample invokes public wallet commands, validates their
  output, and never reads the wallet store. Provider secrets are removed from
  child environments and never appear in wallet arguments or audit records.
- Sequence is the default. `--network mainnet` is explicit. The active wallet
  network is selected automatically after wallet/account menus. The chosen
  wallet and network remain active in Aries. Offset `0` is offered when there
  are no saved accounts; all subsequent commands use the selected offset.
- A `com.example.message` payload contains `data.message` and a new 256-bit salt
  per invocation, with a 4,096-byte canonical bound. Signing is verified before
  storage; exact read-back is required before broadcast and after finality.
- Exit zero only for verified storage plus finalized inclusion; progress on
  stderr and result JSON on stdout followed by the transaction explorer URL as
  the final line after cleanup. Failure never automatically repeats a write
  or broadcast. Public evidence remains under `.sample/runs/run-*`.
- The local Auto Drive SDK patch and `patches/` folder were removed at user
  request. The unmodified published adapter writes zero-byte sequence index
  files again. Tests verify those indexes and duplicate suppression.
- README includes installation, provider configuration, Aries wallet setup and
  funding, interactive runs, explorer output, recovery, and troubleshooting.

## Verification

Runtime: Node 24.14.1, pnpm 12.3.4, pinned development Aries CLI 0.1.20.

| Command / check | Result |
| --- | --- |
| `pnpm check` | Passed; single-package CLI profile |
| `pnpm build --no-incremental` | Passed, zero lint/dependency errors or warnings |
| `pnpm lint --no-incremental` | Passed, zero errors or warnings |
| `pnpm test` | 59 offline tests in six files passed |
| `pnpm test:sample` | Real Aries wallet signing/broadcast and finalized local XL1 flow passed, controlled storage |
| `pnpm test:live` | Previously passed with the patch; not repeated for this change |
| `pnpm run sample-cli --help` | Compiled executable prints the requested command contract |
| Terminal check | Real Aries masked password, wallet menu, invalid-choice retry, nonzero account selection, automatic network switch; Ctrl-C cancellation also verified |
| CLI errors | Missing/blank/unquoted messages and invalid configuration reject; provider key precedence and subprocess isolation tested |

Both chain tests import the public dapp-kit genesis mnemonic into a fresh
isolated Aries wallet, then remove that wallet and stop the disposable chain.
They never access the user's wallet. Offline adapter tests count all PUTs and
assert one primary object plus one zero-byte sequence index per new payload.

The compile script disables incremental skipping so `pnpm start` recompiles
current source, including new files in an uncommitted checkout. Build and lint
were explicitly checked without incremental skipping. Frozen installation passed.

## Previous live evidence (before patch removal and interactive setup)

- Evidence: `.sample/live/cli-q2ddoc`
- Payload: `39096bbf0e537eb48a5c3c74f9cdb3b94433602a9f4f42d0d42218a86f487322`
- Canonical size: **172 bytes**
- Transaction: `4baceb452af606a1fd2b9e7a14d7cdc251564b655fd1613b29332c60a2bf297a`
- Disposable chain: `a7969bb9475661edf396cd50165429ea650ad90b`
- Storage namespace: `autodrive-sample/live-test`
- One logical provider insertion and one Aries wallet broadcast; exact read-back
  and finalized inclusion verified. The transaction envelope was absent from Auto Drive.
- Archival confirmed: **false**. No public-chain transaction was sent.

## Remaining boundaries

The normal CLI requires an interactive terminal, an existing Aries wallet, and
funds on the chosen network. It drives unlock and wallet/account/network selection. Public Sequence/Mainnet execution was not performed;
local-chain success is not public-chain qualification. Provider archival completion
and cross-process atomic deduplication remain unproven. No automatic recovery
command is included: inspect retained signed evidence after uncertainty, because
rerunning the message generates another salt.

The upstream primary-only changes in `sdk-xyo-client-js` remain uncommitted and
unpublished; the sample no longer consumes those changes or a local patch.
Earlier SDK package/full-suite results and web/server evidence are preserved in LOCAL_QUALIFICATION.md.
