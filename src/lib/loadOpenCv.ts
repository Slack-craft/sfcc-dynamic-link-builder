let loadPromise: Promise<void> | null = null

export function loadOpenCv(): Promise<void> {
  if (window.cv && window.cv.Mat) return Promise.resolve()
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    if (window.cv && window.cv.Mat) {
      resolve()
      return
    }

    const log = (...args: unknown[]) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log(...args)
      }
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-opencv="true"]')
    if (existing) {
      log("[OpenCV] Script tag already present")
      const start = Date.now()
      const poll = () => {
        if (window.cv && window.cv.Mat) {
          log("[OpenCV] Ready (polled cv.Mat)")
          resolve()
          return
        }
        if (Date.now() - start > 15000) {
          reject(new Error("OpenCV did not initialize within 15s"))
          return
        }
        setTimeout(poll, 50)
      }
      poll()
      return
    }

    const script = document.createElement("script")
    script.src = "/opencv.js"
    script.async = true
    script.dataset.opencv = "true"
    script.onload = () => {
      log("[OpenCV] Script onload fired")
      const cv = window.cv
      if (!cv) {
        reject(new Error("OpenCV loaded but window.cv is undefined"))
        return
      }
      if (cv.Mat) {
        log("[OpenCV] Ready (cv.Mat detected)")
        resolve()
        return
      }
      if (cv.onRuntimeInitialized !== undefined) {
        cv.onRuntimeInitialized = () => {
          log("[OpenCV] Ready (onRuntimeInitialized)")
          resolve()
        }
        return
      }
      const start = Date.now()
      const poll = () => {
        if (window.cv && window.cv.Mat) {
          log("[OpenCV] Ready (polled cv.Mat)")
          resolve()
          return
        }
        if (Date.now() - start > 15000) {
          reject(new Error("OpenCV did not initialize within 15s"))
          return
        }
        setTimeout(poll, 50)
      }
      poll()
    }
    script.onerror = () => reject(new Error("Failed to load /opencv.js (404 or blocked)."))
    log("[OpenCV] Injecting script tag")
    document.body.appendChild(script)
  })

  return loadPromise.catch((error) => {
    loadPromise = null
    throw error
  })
}
