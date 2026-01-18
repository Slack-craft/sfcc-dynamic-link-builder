export async function extensionRequest<T>(
  type: string,
  payload: Record<string, unknown>,
  timeoutMs = 25000
): Promise<T> {
  const requestId = crypto.randomUUID()
  const responseType = `${type}_RESPONSE`

  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage)
      reject(new Error("Extension request timed out"))
    }, timeoutMs)

    function onMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg || msg.type !== responseType) return
      if (msg.requestId !== requestId) return

      window.clearTimeout(timeout)
      window.removeEventListener("message", onMessage)

      if (!msg.ok) {
        reject(new Error(msg.error || "Extension request failed"))
        return
      }

      resolve(msg.result as T)
    }

    window.addEventListener("message", onMessage)
    window.postMessage({ type, requestId, ...payload }, "*")
  })
}
