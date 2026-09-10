# Sample website

Private React/Vite application served by the sample Node service through root
`pnpm start`. It fetches server configuration from `/api/config`, validates the
shared dapp-kit profile, and connects XL1 Chrome Wallet to the explicitly selected
network. A mismatched configured origin or chain disables the write path.

The editor shows the complete JSON payload, including `schema: "com.example.message"`,
a random 256-bit hex `salt`, and `data`. It uses the protocol package's normalization
and byte accounting. Each new draft receives a salt; **New salt** explicitly renews
it before signing. Editing, validation, retries, reset, and tab recovery preserve
the approved salt. The
shared client package orchestrates real wallet signing and authorization,
storage verification, wallet broadcast, and finalized-chain observation. There
is no test signer in the browser. Retrieval by XYO hash is available without a
wallet.

Public signed operation evidence is kept in this browser tab's session storage
for refresh recovery. JWTs, user private keys, and provider credentials are never
persisted there. Reset clears tab recovery only; it cannot delete stored content
or cancel an already submitted transaction.

Vite owns production website output. Root `pnpm build` invokes the package's
type-check and Vite build hook. Actual Chrome Wallet and live Auto Drive
qualification remain separate from offline and local-chain functional tests.
