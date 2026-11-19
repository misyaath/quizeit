const colors = [[234, 0, 170], [0, 220, 230], [10, 230, 40], [255, 182, 0], [250, 40, 42]]
const patterns = [[0, 1, 2, 3], [0, 2, 3, 4], [0, 3, 4, 1], [0, 4, 1, 2]]
const corners = [['top', 'left'], ['top', 'right'], ['bottom', 'right'], ['bottom', 'left']]
const markerError = 'Keep the exam visible and select the browser window displaying this exam.'

export function markExamWindow(sessionId) {
  let seed = Number.parseInt(sessionId.slice(0, 8), 16)
  const unused = [...colors]
  const palette = colors.map(() => {
    const index = seed % unused.length
    seed = Math.floor(seed / unused.length)
    return unused.splice(index, 1)[0]
  })
  const overlay = document.createElement('div')
  overlay.className = 'exam-capture-markers'
  overlay.setAttribute('aria-hidden', 'true')
  for (const [index, [vertical, horizontal]] of corners.entries()) {
    const marker = document.createElement('span')
    marker.style[vertical] = '5px'
    marker.style[horizontal] = '5px'
    for (const color of patterns[index]) {
      const cell = document.createElement('i')
      cell.style.backgroundColor = 'rgb(' + palette[color].join(',') + ')'
      marker.append(cell)
    }
    overlay.append(marker)
  }
  document.body.append(overlay)
  return { palette, remove: () => overlay.remove() }
}

function findCorners(canvas, palette) {
  const { width, height } = canvas
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height)
  const locations = patterns.map(() => ({ x: 0, y: 0, count: 0 }))
  const matches = (x, y, [red, green, blue]) => {
    if (x >= width || y >= height) return false
    const pixel = (y * width + x) * 4
    return Math.abs(data[pixel] - red) < 48 && Math.abs(data[pixel + 1] - green) < 48
      && Math.abs(data[pixel + 2] - blue) < 48
  }
  // Each marker has four colored cells. Match all four before accepting its position.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width;) {
      if (!matches(x, y, palette[0])) {
        x++
        continue
      }
      const start = x++
      while (matches(x, y, palette[0])) x++
      const run = x - start
      if (run < 3 || run > 50) continue
      const center = start + Math.floor(run / 2)
      for (const [index, [, right, bottom, diagonal]] of patterns.entries()) {
        for (let step = run; step <= run + 3; step++) {
          if (!matches(center + step, y, palette[right]) || !matches(center, y + step, palette[bottom])
            || !matches(center + step, y + step, palette[diagonal])) continue
          const location = locations[index]
          location.x += center + step / 2
          location.y += y + step / 2
          location.count++
          break
        }
      }
    }
  }
  if (locations.some(location => location.count < 2)) throw new Error(markerError)
  return locations.map(({ x, y, count }) => ({ x: Math.round(x / count), y: Math.round(y / count) }))
}

export function cropExamWindow(frame, markers) {
  const [topLeft, topRight, bottomRight, bottomLeft] = findCorners(frame, markers.palette)
  const left = Math.max(topLeft.x, bottomLeft.x)
  const right = Math.min(topRight.x, bottomRight.x)
  const top = Math.max(topLeft.y, topRight.y)
  const bottom = Math.min(bottomLeft.y, bottomRight.y)
  const width = right - left
  const height = bottom - top
  const viewportRatio = Math.max(1, innerWidth - 34) / Math.max(1, innerHeight - 34)
  if (width < 180 || height < 120 || Math.abs(width / height / viewportRatio - 1) > 0.10
    || Math.abs(topLeft.x - bottomLeft.x) > 12 || Math.abs(topRight.x - bottomRight.x) > 12
    || Math.abs(topLeft.y - topRight.y) > 12 || Math.abs(bottomLeft.y - bottomRight.y) > 12) {
    throw new Error(markerError)
  }
  const scale = Math.min(1, 1280 / width, 720 / height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext('2d').drawImage(frame, left, top, width, height, 0, 0, canvas.width, canvas.height)
  return canvas
}
