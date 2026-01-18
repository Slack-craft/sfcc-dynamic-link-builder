export async function hasExtensionPing(timeoutMs = 300): Promise<boolean> {
  const requestId = crypto.randomUUID()

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage)
      resolve(false)
    }, timeoutMs)

    function onMessage(event: MessageEvent) {
      const msg = event.data
      if (!msg || msg.type !== "SCA_PING_RESPONSE") return
      if (msg.requestId !== requestId) return
      window.clearTimeout(timeout)
      window.removeEventListener("message", onMessage)
      resolve(true)
    }

    window.addEventListener("message", onMessage)
    window.postMessage({ type: "SCA_PING", requestId }, "*")
  })
}
