export function videoForStream(stream) {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  return video
}

export function releaseVideo(video) {
  video.srcObject?.getTracks().forEach(track => track.stop())
  video.srcObject = null
}

export async function readFrame(video, maxWidth, maxHeight, errorMessage) {
  if (video.readyState < 2) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        video.removeEventListener('loadeddata', loaded)
        reject(new Error(errorMessage))
      }, 4000)
      function loaded() {
        clearTimeout(timeout)
        resolve()
      }
      video.addEventListener('loadeddata', loaded, { once: true })
    })
  }
  const { videoWidth, videoHeight } = video
  if (!videoWidth || !videoHeight) throw new Error(errorMessage)
  const scale = Math.min(1, maxWidth / videoWidth, maxHeight / videoHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(videoWidth * scale))
  canvas.height = Math.max(1, Math.round(videoHeight * scale))
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas
}

export function encodeFrame(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob)
    else reject(new Error('Could not save the image.'))
  }, 'image/jpeg', quality))
}
