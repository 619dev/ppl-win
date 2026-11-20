import { normalizeFileUrl } from '../api/http'

import { cachedMediaBlob } from './mediaCache'

export function stickerProxyUrl(fileId: string): string {
  return normalizeFileUrl(`/api/stickers/proxy/${encodeURIComponent(fileId)}`)
}

// Reuse the same persistent cache for picker previews and sent stickers.
export async function cacheSticker(fileId: string): Promise<Blob> {
  if (!fileId) throw new Error('Missing sticker file_id')
  return cachedMediaBlob(stickerProxyUrl(fileId))
}

export async function cachedStickerObjectUrl(fileId: string): Promise<string> {
  return URL.createObjectURL(await cacheSticker(fileId))
}

export async function cacheStickerPack(stickers: Array<{ file_id?: string }>): Promise<void> {
  await Promise.allSettled(stickers.map(sticker =>
    sticker.file_id ? cacheSticker(sticker.file_id).then(() => undefined) : Promise.resolve()
  ))
}
