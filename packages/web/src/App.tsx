import type { SampleConfiguration } from '@xyo-network/autodrive-sample-client'
import { createSampleApi } from '@xyo-network/autodrive-sample-client'
import { MAX_PAYLOAD_BYTES } from '@xyo-network/autodrive-sample-protocol'
import { WalletGatewayProvider } from '@xyo-network/xl1-react-client-sdk'
import type { GatewayName } from '@xyo-network/xl1-sdk'
import { useEffect, useState } from 'react'

import {
  errorMessage, useWorkspace, type WorkspaceView,
} from './useWorkspace.js'

const api = createSampleApi()
const walletStoreUrl = 'https://chromewebstore.google.com/detail/xl1-wallet/fblbagcjeigmhakkfgjpdlcapcgmcfbm'

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

function Header({ network }: { network?: string }) {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" aria-label="Auto Drive sample home">
        <span className="brand-symbol" aria-hidden="true">X</span>
        <span>
          XYO
          <span className="brand-divider">/</span>
          {' '}
          Auto Drive
        </span>
      </a>
      <span className="network-badge">
        <span className="status-dot" />
        {network ?? 'Datalake sample'}
      </span>
    </header>
  )
}

export function App() {
  const [config, setConfig] = useState<SampleConfiguration>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    void api.configuration().then((next) => {
      if (next.origin !== location.origin) {
        throw new Error('The configured origin differs from this page. Open the URL printed by pnpm start')
      }
      if (!cancelled) setConfig(next)
    }).catch((cause: unknown) => {
      if (!cancelled) setError(errorMessage(cause))
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!config) {
    return (
      <div className="page-shell">
        <Header />
        <main className="startup-panel">
          <p className="eyebrow">Auto Drive datalake sample</p>
          <h1>{error === undefined ? 'Connecting to the sample.' : 'Service unavailable.'}</h1>
          <p role={error === undefined ? 'status' : 'alert'}>{error ?? 'Checking the shared payload policy and configured chain.'}</p>
          {error === undefined ? null : <button type="button" className="button secondary" onClick={() => location.reload()}>Try again</button>}
        </main>
      </div>
    )
  }

  return (
    <WalletGatewayProvider gatewayName={config.networkId as GatewayName}>
      <Workspace config={config} />
    </WalletGatewayProvider>
  )
}

function Workspace({ config }: { config: SampleConfiguration }) {
  const view = useWorkspace(config)
  return (
    <div className="page-shell">
      <Header network={config.networkId} />
      <main>
        <Hero view={view} />
        <Notices view={view} />
        <div className="workbench">
          <Composer view={view} />
          <Verification view={view} />
        </div>
        <Retrieval view={view} />
      </main>
      <footer>
        <span>XYO × Auto Drive</span>
        <span>Public payloads. Explicit approvals. Verifiable outcomes.</span>
      </footer>
    </div>
  )
}

function Hero({ view }: { view: WorkspaceView }) {
  const {
    config, account, busy, connecting, connect, walletReady, walletMissing, defaultGateway,
  } = view
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">One payload · One verifiable path</p>
        <h1>
          Store once.
          <br />
          <span>Verify every step.</span>
        </h1>
        <p className="hero-copy">Compose a small JSON payload. Store it in the Auto Drive datalake, verify retrieval, and anchor its XYO hash on XL1 through your wallet.</p>
      </div>
      <div className="wallet-card">
        <p className="eyebrow">Your connection</p>
        <strong>{walletReady && account !== undefined ? shortAddress(account) : 'XL1 Chrome Wallet'}</strong>
        <p>
          {walletReady
            ? `Connected to ${config.networkId}. Each signature and broadcast requires your approval.`
            : 'Use desktop Chrome with the XL1 Wallet extension. Your keys stay in your wallet.'}
        </p>
        <button type="button" className="button secondary" disabled={busy || connecting || walletMissing || !defaultGateway} onClick={() => { void connect() }}>
          {connecting ? 'Waiting for wallet…' : walletReady ? 'Reconnect wallet' : walletMissing ? 'Wallet not detected' : 'Connect wallet'}
        </button>
        {walletMissing ? <a className="text-link" href={walletStoreUrl} target="_blank" rel="noreferrer">Open XL1 Wallet listing ↗</a> : null}
      </div>
    </section>
  )
}

function Notices({ view }: { view: WorkspaceView }) {
  const {
    config, account, walletChain, recoveryNotice, walletIssue,
  } = view
  return (
    <>
      {config.writeEnabled
        ? null
        : (
            <p className="notice warning" role="status">
              Storage writes are disabled by the operator. Retrieval remains available. Service status:
              {config.status}
              .
            </p>
          )}
      {walletIssue
        ? (
            <p className="notice warning" role="alert">
              Wallet:
              {errorMessage(walletIssue)}
            </p>
          )
        : null}
      {account !== undefined && walletChain !== config.chainId
        ? <p className="notice warning" role="status">Wallet chain identity is not verified for this sample. Reconnect on the configured network.</p>
        : null}
      {recoveryNotice === undefined ? null : <p className="notice" role="status">{recoveryNotice}</p>}
    </>
  )
}

function Composer({ view }: { view: WorkspaceView }) {
  const {
    config, payloadText, setPayloadText, normalized, validationError, busy, consent, setConsent, operation, execute, reset, renewSalt, walletReady,
  } = view
  return (
    <section className="composer panel" aria-labelledby="compose-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">01 / Compose</p>
          <h2 id="compose-title">Your payload</h2>
        </div>
        <span className={`byte-count${validationError === undefined ? '' : ' invalid'}`}>
          {normalized?.byteLength ?? '—'}
          {' '}
          <span>
            /
            {MAX_PAYLOAD_BYTES}
            {' '}
            bytes
          </span>
        </span>
      </div>
      <label className="field-label" htmlFor="payload-data">Complete payload JSON</label>
      <textarea
        id="payload-data"
        className="json-editor"
        spellCheck={false}
        autoComplete="off"
        value={payloadText}
        disabled={busy || Boolean(operation)}
        onChange={event => setPayloadText(event.target.value)}
      />
      {validationError === undefined
        ? <p className="field-help">Schema, salt, and data count toward the limit. New salt creates a distinct payload; retries keep the same salt.</p>
        : <p className="field-error" role="alert">{validationError}</p>}
      <details className="payload-preview">
        <summary>Full normalized payload</summary>
        <pre>{normalized ? JSON.stringify(normalized.payload, null, 2) : 'Enter a complete valid payload to preview its normalized form.'}</pre>
      </details>
      <div className="consent-box">
        <label className="checkbox-label">
          <input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />
          <span>I understand this payload will be publicly readable plaintext. Permanent storage cannot be undone by this sample.</span>
        </label>
      </div>
      <div className="compose-actions">
        <button
          type="button"
          className="button primary"
          disabled={!walletReady || !config.writeEnabled || !normalized || !consent || busy || Boolean(operation)}
          onClick={() => { void execute(false) }}
        >
          {busy ? 'Operation in progress…' : 'Perma-Store'}
          <span aria-hidden="true">↗</span>
        </button>
        <button type="button" className="button ghost" disabled={busy} onClick={reset}>Reset draft</button>
        <button type="button" className="button ghost" disabled={busy || Boolean(operation) || !normalized} onClick={renewSalt}>New salt</button>
      </div>
      <p className="fine-print">Storage authentication, transaction signing, and broadcast may each open a wallet approval.</p>
    </section>
  )
}

function Verification({ view }: { view: WorkspaceView }) {
  const {
    config, busy, operation, flow, flowError, execute, walletReady,
  } = view
  return (
    <section className="verification panel" aria-labelledby="verification-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">02 / Verify</p>
          <h2 id="verification-title">Follow the evidence</h2>
        </div>
      </div>
      <EvidenceSteps view={view} />
      <div className={`flow-state ${flow?.stage === 'complete' ? 'complete' : ''}`} aria-live="polite">
        <span className="eyebrow">{flow?.stage.replaceAll('-', ' ') ?? 'Ready when you are'}</span>
        <p>{flow?.message ?? 'A provider receipt is not chain finality or confirmation of completed network archival.'}</p>
      </div>
      {flowError === undefined ? null : <p className="field-error operation-error" role="alert">{flowError}</p>}
      {operation
        ? (
            <>
              <dl className="hash-list">
                <div>
                  <dt>Payload hash</dt>
                  <dd>{operation.normalized.hash}</dd>
                </div>
                <div>
                  <dt>Transaction hash</dt>
                  <dd>{operation.evidence.transactionHash}</dd>
                </div>
                <div>
                  <dt>Configured chain</dt>
                  <dd>{config.chainId}</dd>
                </div>
              </dl>
              <button type="button" className="button secondary resume-button" disabled={busy || !walletReady} onClick={() => { void execute(true) }}>
                {operation.broadcastAttempted ? 'Check transaction & retrieval' : 'Check & continue this operation'}
              </button>
              {operation.broadcastAttempted && flow?.stage !== 'complete'
                ? (
                    <button type="button" className="button ghost resume-button" disabled={busy || !walletReady} onClick={() => { void execute(true, true) }}>
                      Retry the same signed broadcast
                    </button>
                  )
                : null}
            </>
          )
        : null}
      <p className="fine-print">Reset clears this tab’s recovery state. It does not delete stored content or cancel a broadcast.</p>
    </section>
  )
}

function Retrieval({ view }: { view: WorkspaceView }) {
  const {
    lookupHash, setLookupHash, retrieved, lookupError, reading, retrieve,
  } = view
  return (
    <section className="retrieval panel" aria-labelledby="retrieve-title">
      <div>
        <p className="eyebrow">03 / Retrieve</p>
        <h2 id="retrieve-title">Find it by its XYO hash.</h2>
        <p>Fresh read, normalized bytes, recomputed identity. No wallet required.</p>
      </div>
      <form
        className="retrieve-form"
        onSubmit={(event) => {
          event.preventDefault()
          void retrieve()
        }}
      >
        <label className="field-label" htmlFor="payload-hash">Payload hash</label>
        <div className="retrieve-input-row">
          <input id="payload-hash" value={lookupHash} onChange={event => setLookupHash(event.target.value)} placeholder="Paste an XYO payload hash" autoComplete="off" spellCheck={false} />
          <button className="button secondary" disabled={reading || !lookupHash.trim()} type="submit">
            {reading ? 'Checking…' : 'Retrieve'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
      {lookupError === undefined ? null : <p className="field-error retrieval-result" role="alert">{lookupError}</p>}
      {retrieved
        ? (
            <div className="retrieval-result">
              <p className="verified-label">
                ✓ Retrieval verified ·
                {retrieved.byteLength}
                {' '}
                bytes
              </p>
              <pre>{JSON.stringify(retrieved.payload, null, 2)}</pre>
            </div>
          )
        : null}
    </section>
  )
}

function verifiedTime(timestamp: number) {
  const date = new Date(timestamp)
  return `Read-back verified ${date.toLocaleTimeString()}.`
}

function EvidenceSteps({ view }: { view: WorkspaceView }) {
  const { operation, flow } = view
  return (
    <ol className="evidence-steps">
      <li className={operation ? 'done' : ''}>
        <span className="step-number">1</span>
        <div>
          <h3>Sign one payload</h3>
          <p>{operation ? 'Signed transaction captured with exactly one payload hash.' : 'Your wallet approves the frozen payload and configured chain.'}</p>
        </div>
      </li>
      <li className={operation?.confirmation ? 'done' : ''}>
        <span className="step-number">2</span>
        <div>
          <h3>Store & retrieve</h3>
          <p>
            {operation?.confirmation
              ? verifiedTime(operation.confirmation.verifiedAt)
              : 'The datalake must return matching normalized bytes and XYO hash.'}
          </p>
        </div>
      </li>
      <li className={flow?.stage === 'complete' ? 'done' : ''}>
        <span className="step-number">3</span>
        <div>
          <h3>Broadcast & finalize</h3>
          <p>{flow?.stage === 'complete' ? `Finalized at block ${flow.blockNumber}.` : 'Only verified storage permits wallet broadcast. Finality is checked separately.'}</p>
        </div>
      </li>
    </ol>
  )
}
