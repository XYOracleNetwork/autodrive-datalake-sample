# Single-package Node CLI plan

Updated September 10, 2026. The CLI replaces all previous browser/server designs.

1. Move payload validation and the Auto Drive adapter into root `src/`; remove
   the client/server/protocol/web package boundary, React, HTTP routes, JWTs,
   profile declarations, local-chain launcher, and browser session recovery.
2. Declare a Node `sample-cli` bin and native toolchain CLI profile. Use Node 24
   and pinned pnpm. Use the published Auto Drive SDK without local patches;
   retain its zero-byte secondary index writes.
3. Parse one required message plus optional `--autoDriveKey` and `--network`.
   Read `.env` from the invocation directory without changing `process.env`.
   Never reflect rejected argument values or provider errors containing secrets.
4. Delegate unlock/password entry to Aries, present wallet/account menus, and
   select the requested network automatically. Offer offset `0` when the wallet
   has no saved accounts. Use the selected account offset for all wallet commands.
   Check active wallet and network against the selection and SDK preset. Request signing through
   `aries wallet tx sign ... --output ...`, validate the exact returned evidence,
   and invoke `aries wallet tx broadcast` only after verified storage.
   No sample seed phrase, private key, JWT, or wallet-store implementation.
5. Connect the public XL1 SDK viewer using built-in Sequence/Mainnet presets.
   Poll inclusion/finality through SDK methods. Never issue raw XL1 RPC.
6. Save public payload, unsigned/signed transaction, dispatch markers, and final
   result under `.sample/runs/run-*`. This is diagnostic evidence, not a ledger.
   A failed command never retries a write or broadcast. Re-running generates a
   new salt; manual recovery of the original transaction requires its evidence.
   After successful cleanup, print result JSON and finish with the transaction
   URL at `https://explore.xyo.network/xl1/<network>/transaction/<hash>`.
7. Test argument precedence/error exits, no secret forwarding, real CLI signing,
   storage verification before broadcast, corrupted read-back, signature/network
   mismatch, finality timeout, and cleanup. Use isolated wallet homes for tests.
8. Run check/build/lint/offline tests, controlled local-chain integration, and one
   explicit real-provider test. Record exact results in STOPPING_POINT.md.

Runtime files are `cli.ts` (ownership), `options.ts` (arguments/configuration),
`walletSetup.ts` (terminal menus), `ariesWallet.ts` (public subprocess interface), `workflow.ts` (store/anchor),
and the existing payload/provider helpers. There is one package and no HTTP hop.

An existing Aries wallet and funded account are prerequisites. The development
dependency pins the CLI for reproducible test runs. The sample requires terminal
input and drives unlock and selection; wallet/network selections remain active
afterward. It does not create, import, or fund wallets. Test fixtures alone import the public local-chain
mnemonic into a disposable isolated wallet.

The pre-CLI REST qualification and upstream index work are historical evidence,
retained in LOCAL_QUALIFICATION.md and the checkpoint. No upstream publication,
public-chain transaction, or provider archival confirmation is implied.
