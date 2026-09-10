import type {
  FlowProgress, PendingOperation, SampleConfiguration, SampleWallet,
} from '@xyo-network/autodrive-sample-client'
import {
  createSampleApi, restorePendingOperation, resumeAnchor, storeAndAnchor,
} from '@xyo-network/autodrive-sample-client'
import {
  createSampleSalt, type NormalizedSamplePayload, normalizeSamplePayloadText, SAMPLE_SCHEMA,
  type SamplePayload,
} from '@xyo-network/autodrive-sample-protocol'
import {
  useConnectAccount, usePermissions, useProvidedGateway,
} from '@xyo-network/xl1-react-client-sdk'
import type { GatewayName } from '@xyo-network/xl1-sdk'
import { isXyoJwtSignerMethods } from '@xyo-network/xl1-sdk'
import {
  useCallback, useEffect, useRef, useState,
} from 'react'

const api = createSampleApi()
function formatPayload(payload: SamplePayload) {
  return JSON.stringify({
    schema: payload.schema, salt: payload.salt, data: payload.data,
  }, null, 2)
}

function initialPayloadText() {
  return formatPayload({
    schema: SAMPLE_SCHEMA,
    salt: createSampleSalt(),
    data: { message: 'Hello, permanent world.', source: 'Auto Drive datalake sample' },
  })
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The operation could not be completed'
}

function requireWalletGateway(gateway: ReturnType<typeof useProvidedGateway>['defaultGateway']) {
  if (!gateway || !('signer' in gateway)) throw new Error('The wallet does not expose a signing gateway')
  return gateway
}

function useComposer() {
  const [payloadText, setPayloadText] = useState(initialPayloadText)
  const [normalized, setNormalized] = useState<NormalizedSamplePayload>()
  const [validationError, setValidationError] = useState<string>()
  const updatePayloadText = useCallback((next: string) => {
    setPayloadText(next)
    setNormalized(undefined)
    setValidationError(undefined)
  }, [])
  useEffect(() => {
    let cancelled = false
    const timeout = setTimeout(() => {
      void normalizeSamplePayloadText(payloadText).then((value) => {
        if (cancelled) {
          return
        }

        setNormalized(value)
        setValidationError(undefined)
      }).catch((cause: unknown) => {
        if (cancelled) {
          return
        }

        setNormalized(undefined)
        setValidationError(errorMessage(cause))
      })
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [payloadText])

  return {
    payloadText, setPayloadText: updatePayloadText, normalized, validationError,
  }
}

function useRetrieval() {
  const [lookupHash, setLookupHash] = useState('')
  const [retrieved, setRetrieved] = useState<NormalizedSamplePayload>()
  const [lookupError, setLookupError] = useState<string>()
  const [reading, setReading] = useState(false)
  async function retrieve() {
    setReading(true)
    setLookupError(undefined)
    setRetrieved(undefined)
    try {
      setRetrieved(await api.payload(lookupHash.trim()))
    } catch (cause: unknown) {
      setLookupError(errorMessage(cause))
    } finally {
      setReading(false)
    }
  }

  return {
    lookupHash, setLookupHash, retrieved, lookupError, reading, retrieve,
  }
}

export function useWorkspace(config: SampleConfiguration) {
  const { defaultGateway, error: gatewayError } = useProvidedGateway()
  const {
    connectSigner, error: connectError, timedout,
  } = useConnectAccount(config.networkId as GatewayName, 5000)
  const { permissions } = usePermissions()
  const {
    payloadText, setPayloadText, normalized, validationError,
  } = useComposer()
  const [account, setAccount] = useState<string>()
  const [walletChain, setWalletChain] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [consent, setConsent] = useState(false)
  const [operation, setOperation] = useState<PendingOperation>()
  const [flow, setFlow] = useState<FlowProgress>()
  const [flowError, setFlowError] = useState<string>()
  const [recoveryNotice, setRecoveryNotice] = useState<string>()
  const {
    lookupHash, setLookupHash, retrieved, lookupError, reading, retrieve,
  } = useRetrieval()
  const pendingRef = useRef<PendingOperation | undefined>(undefined)
  const stageRef = useRef<FlowProgress | undefined>(undefined)
  const activeRef = useRef<AbortController | undefined>(undefined)
  const gatewayRef = useRef(defaultGateway)
  const recoveryKey = `autodrive-sample:${config.origin}:${config.chainId}`

  useEffect(() => {
    gatewayRef.current = defaultGateway
    return () => activeRef.current?.abort(new Error('Wallet connection changed or the page was closed'))
  }, [defaultGateway])

  useEffect(() => {
    let cancelled = false
    async function recover() {
      try {
        // Recovery stores this tab's public signed operation, never a key or authentication JWT.
        const saved = sessionStorage.getItem(recoveryKey)
        if (saved !== null) {
          const pending = await restorePendingOperation(JSON.parse(saved) as unknown, config)
          if (cancelled) return
          pendingRef.current = pending
          setOperation(pending)
          setPayloadText(formatPayload(pending.normalized.payload))
          setLookupHash(pending.normalized.hash)
          setRecoveryNotice('A signed operation was recovered from this tab. Connect the same wallet account to check or continue it.')
        }
      } catch (cause: unknown) {
        if (!cancelled) setRecoveryNotice(`Tab recovery could not be verified: ${errorMessage(cause)}. Keep this page open or reset the draft.`)
      }
    }
    void recover()
    return () => {
      cancelled = true
    }
  }, [config, recoveryKey, setPayloadText, setLookupHash])

  useEffect(() => {
    if (!defaultGateway || account === undefined) return
    let cancelled = false
    async function checkConnection() {
      try {
        const gateway = requireWalletGateway(defaultGateway)
        const [address, chainId] = await Promise.all([
          gateway.signer.address(),
          gateway.connection.viewer?.chainId(),
        ])
        if (cancelled) return
        setWalletChain(chainId)
        if (address !== account || chainId !== config.chainId) {
          activeRef.current?.abort(new Error('Wallet account or network changed. Reconnect before continuing'))
          setAccount(address)
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          setWalletChain(undefined)
          setFlowError(`Wallet is locked or unavailable: ${errorMessage(cause)}`)
          activeRef.current?.abort(new Error('Wallet is locked or unavailable'))
        }
      }
    }
    void checkConnection()
    const interval = setInterval(() => {
      void checkConnection()
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [account, config.chainId, defaultGateway])

  async function connect() {
    setConnecting(true)
    setFlowError(undefined)
    try {
      if (!permissions) throw new Error('XL1 Chrome Wallet permissions are not available')
      const granted = await connectSigner()
      if (!granted) throw new Error('Account access was not granted in Chrome Wallet')
      await permissions.requestPermissions([{ xyoSigner_address: {} }])
      const gateway = requireWalletGateway(gatewayRef.current)
      if (!gateway.connection.viewer) throw new Error('The wallet does not expose the configured network')
      const [address, chainId] = await Promise.all([gateway.signer.address(), gateway.connection.viewer.chainId()])
      setAccount(address)
      setWalletChain(chainId)
      if (chainId !== config.chainId) throw new Error('Wallet chain identity differs from the configured chain')
    } catch (cause: unknown) {
      setFlowError(errorMessage(cause))
    } finally {
      setConnecting(false)
    }
  }

  function currentWallet(): SampleWallet {
    const gateway = requireWalletGateway(gatewayRef.current)
    if (!gateway.connection.viewer || !gateway.connection.runner) throw new Error('Connect XL1 Chrome Wallet on the configured network')
    const signer = gateway.signer
    if (!isXyoJwtSignerMethods(signer)) throw new Error('This wallet does not support detached JWT authentication. Update XL1 Chrome Wallet')
    return {
      viewer: gateway.connection.viewer, runner: gateway.connection.runner, signer,
    }
  }

  function savePending(pending: PendingOperation) {
    pendingRef.current = pending
    setOperation(pending)
    setLookupHash(pending.normalized.hash)
    try {
      sessionStorage.setItem(recoveryKey, JSON.stringify(pending))
    } catch {
      setRecoveryNotice('The signed operation could not be saved for reload recovery. Keep this tab open.')
    }
  }

  async function execute(resume: boolean, retryBroadcast = false) {
    setBusy(true)
    setFlowError(undefined)
    const abort = new AbortController()
    activeRef.current = abort
    try {
      const gateway = gatewayRef.current
      const options = {
        config,
        wallet: currentWallet(),
        api,
        signal: abort.signal,
        assertCurrent: () => {
          if (gatewayRef.current !== gateway) throw new Error('The wallet connection changed')
        },
        onProgress: (next: FlowProgress) => {
          stageRef.current = next
          setFlow(next)
        },
        onPending: savePending,
      }
      if (resume) {
        const pending = pendingRef.current
        if (!pending) throw new Error('No signed operation is available to resume')
        await resumeAnchor({
          ...options, pending, retryBroadcast,
        })
      } else {
        if (!consent) throw new Error('Confirm that this payload may be stored as publicly readable plaintext')
        await storeAndAnchor({ ...options, payloadText })
      }
    } catch (cause: unknown) {
      const pending = pendingRef.current
      const previous = stageRef.current
      if (previous?.stage !== 'broadcast-unknown') {
        const next: FlowProgress = {
          stage: pending?.confirmation ? 'stored-unanchored' : 'failed',
          message: pending?.confirmation
            ? 'The payload remains stored. Chain anchoring has not been confirmed; use the existing operation to check or continue.'
            : 'The operation stopped. If storage was already requested, continue this same intent to reconcile its result.',
          payloadHash: pending?.normalized.hash,
          transactionHash: pending?.evidence.transactionHash,
        }
        stageRef.current = next
        setFlow(next)
      }
      setFlowError(errorMessage(cause))
    } finally {
      activeRef.current = undefined
      setBusy(false)
    }
  }

  function reset() {
    try {
      sessionStorage.removeItem(recoveryKey)
    } catch {
      // The in-memory operation can still be cleared.
    }
    pendingRef.current = undefined
    stageRef.current = undefined
    setOperation(undefined)
    setFlow(undefined)
    setFlowError(undefined)
    setRecoveryNotice(undefined)
    setConsent(false)
  }

  function renewSalt() {
    if (busy || operation || !normalized) return
    setPayloadText(formatPayload({ ...normalized.payload, salt: createSampleSalt() }))
    setConsent(false)
  }

  const walletReady = Boolean(account !== undefined && walletChain === config.chainId && defaultGateway)
  const walletMissing = defaultGateway === null || timedout
  const walletIssue = gatewayError ?? connectError

  return {
    config,
    payloadText,
    setPayloadText,
    normalized,
    validationError,
    account,
    walletChain,
    busy,
    connecting,
    consent,
    setConsent,
    operation,
    flow,
    flowError,
    recoveryNotice,
    lookupHash,
    setLookupHash,
    retrieved,
    lookupError,
    reading,
    retrieve,
    connect,
    execute,
    reset,
    renewSalt,
    walletReady,
    walletMissing,
    walletIssue,
    defaultGateway,
  }
}

export type WorkspaceView = ReturnType<typeof useWorkspace>
