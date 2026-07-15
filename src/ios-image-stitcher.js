import sharp from 'sharp'

const MATCH_WIDTH = 160
const EQUIVALENCE_WIDTH = 96
const MIN_OVERLAP_RATIO = 0.12
const MAX_OVERLAP_RATIO = 0.96
const MAX_MATCH_SCORE = 24
const MAX_EQUIVALENCE_SCORE = 2.5
const EXPECTED_OVERLAP_RATIO = 0.5
const EXPECTED_OVERLAP_TOLERANCE = 0.25

const clampRect = (rect, width, height) => {
  const left = Math.max(0, Math.min(width - 1, Math.round(rect.x)))
  const top = Math.max(0, Math.min(height - 1, Math.round(rect.y)))
  const right = Math.max(left + 1, Math.min(width, Math.round(rect.x + rect.width)))
  const bottom = Math.max(top + 1, Math.min(height, Math.round(rect.y + rect.height)))
  return { x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top }
}

const getViewportAnalysis = async (input, rect, analysisWidth = MATCH_WIDTH) => {
  const width = Math.min(analysisWidth, rect.width)
  const { data, info } = await sharp(input)
    .extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
    .removeAlpha()
    .greyscale()
    .resize({ width })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

const overlapScore = (previous, next, overlap) => {
  const previousStart = (previous.height - overlap) * previous.width
  let difference = 0
  let samples = 0
  for (let y = 0; y < overlap; y += 2) {
    const previousRow = previousStart + y * previous.width
    const nextRow = y * next.width
    for (let x = 0; x < previous.width; x += 2) {
      difference += Math.abs(previous.data[previousRow + x] - next.data[nextRow + x])
      samples += 1
    }
  }
  return samples ? difference / samples : Number.POSITIVE_INFINITY
}

const findOverlap = (previous, next, viewportHeight) => {
  const minOverlap = Math.max(8, Math.floor(previous.height * MIN_OVERLAP_RATIO))
  const maxOverlap = Math.min(previous.height - 4, Math.floor(previous.height * MAX_OVERLAP_RATIO))
  let bestOverlap = 0
  let bestScore = Number.POSITIVE_INFINITY
  let expectedOverlap = 0
  let expectedScore = Number.POSITIVE_INFINITY
  for (let overlap = minOverlap; overlap <= maxOverlap; overlap += 1) {
    const score = overlapScore(previous, next, overlap)
    if (score < bestScore) {
      bestScore = score
      bestOverlap = overlap
    }
    const ratio = overlap / previous.height
    if (Math.abs(ratio - EXPECTED_OVERLAP_RATIO) <= EXPECTED_OVERLAP_TOLERANCE && score < expectedScore) {
      expectedScore = score
      expectedOverlap = overlap
    }
  }
  const overlap = expectedOverlap && expectedScore <= MAX_MATCH_SCORE ? expectedOverlap : bestOverlap
  const score = overlap === expectedOverlap ? expectedScore : bestScore
  if (!overlap || score > MAX_MATCH_SCORE) {
    throw new Error(`Could not determine iOS screenshot overlap reliably (score ${bestScore.toFixed(1)})`)
  }
  return Math.round(overlap * (viewportHeight / previous.height))
}

const getAnchorSeam = (previousAnchors, nextAnchors, scrollRect, viewportRect) => {
  const groupUniqueAnchors = (anchors) => {
    const grouped = new Map()
    for (const anchor of anchors || []) grouped.set(anchor.key, grouped.has(anchor.key) ? null : anchor)
    return grouped
  }
  const previous = groupUniqueAnchors(previousAnchors)
  const next = groupUniqueAnchors(nextAnchors)
  const candidates = []
  for (const [key, previousAnchor] of previous) {
    const nextAnchor = next.get(key)
    if (!previousAnchor || !nextAnchor) continue
    const distance = (previousAnchor.y - nextAnchor.y) * scrollRect.scaleY
    if (distance < 4 || distance > viewportRect.height) continue
    const previousCut = viewportRect.top + (previousAnchor.y - scrollRect.sourceRect.y) * scrollRect.scaleY
    const nextCut = viewportRect.top + (nextAnchor.y - scrollRect.sourceRect.y) * scrollRect.scaleY
    if (previousCut <= viewportRect.top + viewportRect.height * 0.25 || previousCut >= viewportRect.bottom) continue
    if (nextCut < viewportRect.top || nextCut >= viewportRect.top + viewportRect.height * 0.75) continue
    candidates.push({ previousCut: Math.round(previousCut), nextCut: Math.round(nextCut) })
  }
  candidates.sort((a, b) => a.nextCut - b.nextCut)
  return candidates[0] || null
}

export const scaleIosScrollRect = async (frame, elementRect, windowRect, fixedChromeRects = []) => {
  const metadata = await sharp(frame).metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0
  if (!width || !height || !windowRect.width || !windowRect.height) {
    throw new Error('Could not determine iOS screenshot dimensions')
  }
  const scaleX = width / windowRect.width
  const scaleY = height / windowRect.height
  const elementBottom = elementRect.y + elementRect.height
  const elementMiddle = elementRect.y + elementRect.height / 2
  let contentTop = elementRect.y
  let contentBottom = elementBottom
  for (const chromeRect of fixedChromeRects) {
    const overlapLeft = Math.max(elementRect.x, chromeRect.x)
    const overlapRight = Math.min(elementRect.x + elementRect.width, chromeRect.x + chromeRect.width)
    if (overlapRight - overlapLeft < elementRect.width * 0.5) continue
    const chromeBottom = chromeRect.y + chromeRect.height
    if (chromeRect.y < elementMiddle && chromeBottom > contentTop) {
      contentTop = Math.min(chromeBottom, contentBottom - 1)
    } else if (chromeBottom > elementMiddle && chromeRect.y < contentBottom) {
      contentBottom = Math.max(chromeRect.y, contentTop + 1)
    }
  }
  const sourceRect = { x: elementRect.x, y: contentTop, width: elementRect.width, height: contentBottom - contentTop }
  return {
    ...clampRect({
      x: (elementRect.x - (windowRect.x || 0)) * scaleX,
      y: (contentTop - (windowRect.y || 0)) * scaleY,
      width: elementRect.width * scaleX,
      height: (contentBottom - contentTop) * scaleY,
    }, width, height),
    sourceRect,
    scaleY,
  }
}

export const areIosFramesEquivalent = async (previousFrame, nextFrame, scrollRect) => {
  const previous = await getViewportAnalysis(previousFrame, scrollRect, EQUIVALENCE_WIDTH)
  const next = await getViewportAnalysis(nextFrame, scrollRect, EQUIVALENCE_WIDTH)
  if (previous.width !== next.width || previous.height !== next.height) return false
  let difference = 0
  for (let index = 0; index < previous.data.length; index += 1) {
    difference += Math.abs(previous.data[index] - next.data[index])
  }
  return difference / previous.data.length <= MAX_EQUIVALENCE_SCORE
}

export const stitchIosFrames = async (frames, scrollRect, { maxHeight }) => {
  if (!frames.length) throw new Error('No iOS screenshots were captured')
  if (frames.length === 1) return frames[0].image
  const metadata = await sharp(frames[0].image).metadata()
  const width = metadata.width || 0
  const height = metadata.height || 0
  if (!width || !height) throw new Error('Could not read iOS screenshot dimensions')
  const rect = clampRect(scrollRect, width, height)
  const analyses = []
  for (const frame of frames) analyses.push(await getViewportAnalysis(frame.image, rect))
  const seams = []
  for (let index = 1; index < frames.length; index += 1) {
    const anchorSeam = getAnchorSeam(frames[index - 1].anchors, frames[index].anchors, scrollRect, rect)
    if (anchorSeam) seams.push(anchorSeam)
    else {
      const overlap = findOverlap(analyses[index - 1], analyses[index], rect.height)
      seams.push({ previousCut: rect.bottom, nextCut: rect.top + overlap })
    }
  }
  const parts = []
  for (let index = 0; index < frames.length; index += 1) {
    const top = index === 0 ? 0 : seams[index - 1].nextCut
    const bottom = index === frames.length - 1 ? rect.bottom : seams[index].previousCut
    if (bottom > top) parts.push({ input: frames[index].image, top, height: bottom - top })
  }
  const bottomHeight = height - rect.bottom
  if (bottomHeight > 0) parts.push({ input: frames.at(-1).image, top: rect.bottom, height: bottomHeight })
  const outputHeight = parts.reduce((total, part) => total + part.height, 0)
  if (outputHeight > maxHeight) throw new Error(`Full-page screenshot exceeds the ${maxHeight}px height limit`)
  const prepared = []
  for (const part of parts) {
    prepared.push(await sharp(part.input).extract({ left: 0, top: part.top, width, height: part.height }).png().toBuffer())
  }
  let top = 0
  const composite = prepared.map((input, index) => {
    const placement = { input, left: 0, top }
    top += parts[index].height
    return placement
  })
  return sharp({ create: { width, height: outputHeight, channels: 4, background: '#ffffff' } })
    .composite(composite)
    .png()
    .toBuffer()
}
