import { z } from 'zod'

const maxImageLength = 120_000
const profileUpdate = z
  .object({
    name: z.string().trim().min(1).max(120),
    image: z.string().max(maxImageLength).nullable().optional(),
  })
  .strict()

export function validProfileUpdate(input: unknown) {
  const parsed = profileUpdate.safeParse(input)
  if (!parsed.success) return false
  const image = parsed.data.image
  if (image == null) return true
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image)
  if (!match || match[2].length % 4 !== 0) return false
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.toString('base64') !== match[2]) return false
  if (match[1] === 'png')
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (match[1] === 'jpeg')
    return (
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255 &&
      bytes[bytes.length - 2] === 255 &&
      bytes[bytes.length - 1] === 217
    )
  return (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
}

export async function readBoundedBody(request: Request, limit: number) {
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    length += value.length
    if (length > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function validProfileRequest(request: Request) {
  try {
    const body = await readBoundedBody(request, maxImageLength + 1024)
    return body !== null && validProfileUpdate(JSON.parse(body)) ? body : null
  } catch {
    return null
  }
}

// Signup does not need an image; reject it there so profile validation cannot be bypassed.
export async function validSignupRequest(request: Request) {
  try {
    const body = await readBoundedBody(request, 8192)
    if (body === null) return null
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.startsWith('application/x-www-form-urlencoded'))
      return !new URLSearchParams(body).has('image') &&
        !new URLSearchParams(body).get('email')?.toLowerCase().endsWith('@invitation.invalid')
        ? body
        : null
    if (!contentType.startsWith('application/json')) return null
    const value = z.record(z.string(), z.unknown()).safeParse(JSON.parse(body))
    return value.success &&
      !Object.hasOwn(value.data, 'image') &&
      !(
        typeof value.data.email === 'string' &&
        value.data.email.toLowerCase().endsWith('@invitation.invalid')
      )
      ? body
      : null
  } catch {
    return null
  }
}
