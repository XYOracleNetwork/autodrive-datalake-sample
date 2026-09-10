import https from 'node:https'
import { syncBuiltinESMExports } from 'node:module'
import process from 'node:process'
import { mock } from 'node:test'

import {
  GetObjectCommand, HeadObjectCommand, S3Client,
} from '@aws-sdk/client-s3'

// Fail before transport even if dependency resolution ever creates another S3Client constructor.
mock.method(https, 'request', () => {
  throw new Error('Provider HTTPS access is forbidden in the compiled CLI fixture')
})
syncBuiltinESMExports()

// Node --import installs this only in the compiled CLI smoke child. Every SDK command is intercepted,
// including unexpected writes; neither credentials nor requests can reach the provider.
mock.method(S3Client.prototype, 'send', async function (this: S3Client, command: unknown) {
  if (!(command instanceof HeadObjectCommand) && !(command instanceof GetObjectCommand)) {
    throw new TypeError('The compiled CLI storage fixture accepts only read-only S3 commands')
  }
  const credentials = await this.config.credentials()
  const endpoint = await this.config.endpoint?.()
  if (credentials.accessKeyId !== 'compiled-cli-local-fixture' || endpoint?.hostname !== 's3.auto-drive.autonomys.xyz') {
    throw new Error('The compiled CLI must configure the official Auto Drive endpoint and fixture API key')
  }
  const key = command.input.Key
  if (command.input.Bucket !== 'autodrive-sample' || typeof key !== 'string' || !/^local\/by-hash\/[0-9a-f]{64}$/u.test(key)) {
    throw new Error('The compiled CLI requested an unexpected Auto Drive object')
  }
  process.send?.({
    bucket: command.input.Bucket, command: command.constructor.name, key, type: 'auto-drive-command',
  })
  throw Object.assign(new Error('Controlled missing Auto Drive object'), { $metadata: { httpStatusCode: 404 } })
})
