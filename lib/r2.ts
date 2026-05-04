import { S3Client } from '@aws-sdk/client-s3'
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const endpoint = process.env.R2_ENDPOINT
const accessKeyId = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
const bucket = process.env.R2_BUCKET

if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
  // Fail loudly at import time so misconfiguration surfaces on first request
  // rather than as a cryptic signing error later.
  console.warn('[r2] Missing one of R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET')
}

export const R2_BUCKET = bucket!

export const r2 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
  },
})

export async function signedUploadUrl(key: string, contentType: string, expiresInSeconds = 60 * 60) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds }
  )
}

export async function signedDownloadUrl(key: string, expiresInSeconds = 60 * 60 * 24 * 7) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn: expiresInSeconds }
  )
}

// Force-download URL — sets Content-Disposition: attachment so mobile browsers
// (iOS Safari, Android Chrome) save the file instead of opening it inline.
// The HTML `download` attribute is ignored for cross-origin links, so we need
// the header on the response itself.
export async function signedDownloadUrlAttachment(key: string, filename?: string, expiresInSeconds = 60 * 60 * 24 * 7) {
  const safe = (filename || key.split('/').pop() || 'download').replace(/"/g, '')
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safe}"`,
    }),
    { expiresIn: expiresInSeconds }
  )
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}
