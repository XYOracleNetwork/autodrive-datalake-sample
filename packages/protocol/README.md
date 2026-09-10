# Auto Drive sample protocol

Private environment-neutral library shared by the website, server, and offline
specs. Run repository commands from the root with Node 24 and pinned pnpm.

`normalizeSampleData(text, salt?)` builds a new payload from a JSON data object
using dapp-kit's strict parser. When omitted, its salt is generated with 32 bytes
of cryptographic randomness. It returns an immutable
`{ payload, canonicalJson, byteLength, hash }` snapshot.
The complete payload has exactly `schema`, `salt`, and `data` keys, a maximum nesting depth
of 16, and a maximum canonical encoding of 4,096 UTF-8 bytes. Its schema is fixed
to `com.example.message`. Its identity comes from
`PayloadBuilder.hash`, independently of dapp-kit document hashes.

`normalizeSamplePayloadText(text)` parses the complete editor JSON without
changing its salt. `normalizeSamplePayload(value)` applies the same complete-payload
admission rules. Both require a 64-character lowercase hexadecimal salt and
preserve it during validation, hashing, signing, storage, and recovery.
Only `normalizeRetrievedSamplePayload(value)` removes root SDK storage metadata;
it preserves nested content and rejects client metadata or other root additions.
Compare its canonical JSON and hash with the approved snapshot before reporting
verified retrieval.

`createSampleProfile(chainId, networkId?)` validates and freezes the real dapp-kit
definition and configuration: finalized XL1, required public plaintext datalake
storage, fail-closed availability, and storage before broadcast. These documents
declare policy; the server and browser must enforce the actual storage and chain
operations. No function here contacts a chain or storage provider.
