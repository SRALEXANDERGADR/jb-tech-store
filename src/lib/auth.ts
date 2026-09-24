import { env } from 'cloudflare:workers'
import { deleteCookie, getCookie, setCookie } from '@tanstack/react-start/server'

const COOKIE_NAME = 'jb_session'
const SESSION_HOURS = 12

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return toHex(signature)
}

// Compara la contraseña en tiempo constante (comparando los hash
// SHA-256 byte por byte), para que no se pueda adivinar letra por letra
// midiendo cuánto tarda la respuesta.
export async function verifyPassword(password: string) {
  if (!password || !env.ADMIN_PASSWORD) return false
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(password)),
    crypto.subtle.digest('SHA-256', encoder.encode(env.ADMIN_PASSWORD)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

export async function createSession() {
  const expires = Date.now() + SESSION_HOURS * 60 * 60 * 1000
  const payload = String(expires)
  const signature = await sign(payload)
  setCookie(COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  })
}

export async function verifySession() {
  const raw = getCookie(COOKIE_NAME)
  if (!raw) return false
  const [payload, signature] = raw.split('.')
  if (!payload || !signature) return false
  if (Number(payload) < Date.now()) return false
  const expected = await sign(payload)
  return expected === signature
}

export function clearSession() {
  deleteCookie(COOKIE_NAME, { path: '/' })
}
