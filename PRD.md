# Auto Drive + XL1 CLI sample

Updated September 10, 2026. This replaces the website, REST server, and four-package workspace.

## Product

One Node package exposes:

```sh
sample-cli "Hello, permanent world" --autoDriveKey <key>
```

The quoted message is required. The flag is optional when `AUTODRIVE_API_KEY`
is supplied by the environment or `.env` in the current directory. Explicit
flags override the environment, which overrides `.env`.

The sample stores `{schema: "com.example.message", salt, data: {message}}`
through the real XYO Auto Drive adapter, verifies fresh read-back, and anchors
the payload on XL1. AriesTools CLI wallet owns signing keys, signing, and broadcast.
The sample never loads a seed phrase. Sequence is the default; `--network mainnet`
is explicit. The CLI drives Aries unlock, wallet/account selection, and network selection.

## Acceptance criteria

1. One root `package.json`, Node-only runtime, and `sample-cli` executable; no
   React, web assets, HTTP server, REST datalake, or workspace package dependencies.
2. Missing, blank, or multiple message arguments fail before wallet/provider effects.
   Quoting is documented; the shell removes quotes before the program sees arguments.
3. Auto Drive key precedence is flag, process environment, `.env`; no key appears
   in output, recovery artifacts, wallet subprocess arguments, or wallet environment.
4. Only `aries wallet` accesses signing keys. Validate the returned signature,
   signer, chain, schema, and exact approved payload before provider insertion.
   Aries owns password entry. Terminal menus select wallet/account; the CLI
   selects the requested network and retains those selections in Aries. Abort
   before upload on cancellation or a changed wallet/network. No wallet creation
   or import is performed by the sample.
5. Every invocation adds a fresh 256-bit salt and enforces 4,096 canonical UTF-8
   bytes. Use the unmodified published Auto Drive adapter, including its zero-byte
   index files and existing hash-based duplicate suppression. No ledger or writer lock is introduced.
6. Storage must be verified before broadcast. Exit zero only after independently
   observed finalized inclusion and another matching read-back. Uncertainty
   exits nonzero, retains public evidence, and triggers no automatic retry.
   After successful cleanup, print the result JSON followed by the selected
   network's transaction explorer URL as the final output line.
7. `pnpm test` remains offline. `pnpm test:sample` uses dapp-kit's disposable
   local XL1, an isolated real Aries CLI wallet, and controlled storage.
   `pnpm test:live` explicitly writes one real Auto Drive payload with the same
   local chain/wallet path; it never accesses the user's wallet or a public chain.
8. Check/build/lint/tests pass. Provider read-back, chain finality, and completed
   provider archival are reported separately. Tests never imply public-chain qualification.
