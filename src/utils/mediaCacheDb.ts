// Packaged Electron renders from file: URLs, where Cache Storage may be unavailable.
export async function mediaCacheTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('PaperPhoneMediaCache', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('media')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction('media', mode)
      const request = operation(transaction.objectStore('media'))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}
