import { normalizeFileUrl } from '../api/http'
import { mediaCacheTransaction } from './mediaCacheDb'

export const MEDIA_CACHE_NAME = 'paperphone-media-v3'
const pending = new Map<string, Promise<Blob>>()
const refreshed = new Set<string>()
let cacheGeneration = 0
let cleanup: Promise<void> | undefined
for (const event of ['online', 'paperphone:network-changed', 'paperphone:socket-connected']) {
  window.addEventListener?.(event, () => refreshed.clear())
}

export function clearMediaCache(): Promise<void> {
  if (cleanup) return cleanup
  cacheGeneration++
  pending.clear()
  refreshed.clear()
  const tasks: Promise<unknown>[] = []
  if (window.location.protocol === 'file:') {
    tasks.push(mediaCacheTransaction('readwrite', store => store.clear()))
  }
  if ('caches' in window) {
    const browserCleanup = Promise.all([MEDIA_CACHE_NAME, 'paperphone-media-v2', 'paperphone-stickers-v1']
      .map(name => caches.delete(name)))
    // Older builds tried to use Cache Storage on file: pages.
    tasks.push(window.location.protocol === 'file:' ? browserCleanup.catch(() => {}) : browserCleanup)
  }
  cleanup = Promise.all(tasks).then(() => {}).finally(() => { cleanup = undefined })
  return cleanup
}

export function mediaCacheAccount(): string {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.id || 'anonymous'
  } catch {
    return 'anonymous'
  }
}

/** Cache original bytes, including encrypted attachments, never decrypted chat data. */
export async function cachedMediaBlob(raw: string, download?: () => Promise<Blob>): Promise<Blob> {
  await cleanup?.catch(() => {})
  const generation = cacheGeneration
  const url = new URL(normalizeFileUrl(raw), window.location.href || window.location.origin)
  url.hash = ''
  const account = mediaCacheAccount()
  const token = localStorage.getItem('token')
  const serverUrl = localStorage.getItem('serverUrl') || import.meta.env.VITE_API_URL || window.location.origin
  const key = new Request(`${url.href}${url.search ? '&' : '?'}__pp_account=${encodeURIComponent(account)}`)
  const id = key.url
  const useIndexedDb = window.location.protocol === 'file:'
  const existing = pending.get(id)
  if (existing) return existing
  const task = (async () => {
    let cache: Cache | undefined
    let cached: Blob | undefined
    try {
      if (useIndexedDb) {
        cached = await mediaCacheTransaction('readonly', store => store.get(id))
      } else {
        cache = await caches.open(MEDIA_CACHE_NAME)
        cached = await (await cache.match(key))?.blob()
      }
    } catch { /* Storage unavailable. */ }
    const fetchBlob = async () => {
      if (mediaCacheAccount() !== account) throw new Error('Media account changed')
      if (download) return download()
      const base = new URL(serverUrl, window.location.href || window.location.origin)
      const needsAuth = url.origin === base.origin &&
        (url.pathname.startsWith('/api/files/') || url.pathname.startsWith('/api/stickers/proxy/'))
      const response = await fetch(url.href, {
        headers: needsAuth && token
          ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!response.ok) throw new Error(`Media download failed: ${response.status}`)
      return response.blob()
    }
    const update = async () => {
      const blob = await fetchBlob()
      if (mediaCacheAccount() !== account) throw new Error('Media account changed')
      if (generation !== cacheGeneration) return blob
      try {
        if (useIndexedDb) {
          await mediaCacheTransaction('readwrite', store => store.put(blob, id))
        } else {
          await cache?.put(key, new Response(blob))
        }
      } catch { /* Quota failure must not prevent display. */ }
      if (generation !== cacheGeneration) return blob
      refreshed.add(id)
      window.dispatchEvent?.(new CustomEvent('pp-media-updated', { detail: { url: url.href, account, blob } }))
      return blob
    }
    if (cached) {
      // Revalidate once per session/reconnect. Navigation itself never downloads again.
      if (!refreshed.has(id)) {
        refreshed.add(id)
        void update().catch(() => refreshed.delete(id))
      }
      return cached
    }
    return update()
  })()
  pending.set(id, task)
  try { return await task } finally { if (pending.get(id) === task) pending.delete(id) }
}
