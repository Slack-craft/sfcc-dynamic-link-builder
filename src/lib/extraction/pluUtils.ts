const MAX_RANGE_EXPANSION = 500

function isDisallowedContext(text: string, startIndex: number, endIndex: number) {
  const before = text[startIndex - 1]
  const after = text[endIndex]
  const snippetStart = Math.max(0, startIndex - 2)
  const snippetEnd = Math.min(text.length, endIndex + 2)
  const snippet = text.slice(snippetStart, snippetEnd)
  if (snippet.includes("%")) return true
  if (before === "." || after === ".") return true
  if (before === "$") return true
  return false
}

function expandRange(startStr: string, endStr: string) {
  const start = Number(startStr)
  let end: number
  if (!Number.isFinite(start)) return []
  if (endStr.length < startStr.length) {
    const prefix = startStr.slice(0, startStr.length - endStr.length)
    end = Number(prefix + endStr)
  } else {
    end = Number(endStr)
  }
  if (!Number.isFinite(end) || end < start) return []
  const values: string[] = []
  for (let i = start; i <= end && values.length < MAX_RANGE_EXPANSION; i += 1) {
    values.push(String(i))
  }
  return values
}

export function extractPlusFromPdfText(text: string) {
  const results: string[] = []
  const seen = new Set<string>()

  function addCandidate(value: string) {
    if (value.length < 4 || value.length > 8) return
    if (seen.has(value)) return
    seen.add(value)
    results.push(value)
  }

  const rangeRegex = /(\d{4,8})\s*-\s*(\d{1,8})/g
  for (const match of text.matchAll(rangeRegex)) {
    if (match.index === undefined) continue
    const raw = match[0]
    if (raw.includes(".") || isDisallowedContext(text, match.index, match.index + raw.length)) {
      continue
    }
    const expanded = expandRange(match[1], match[2])
    expanded.forEach(addCandidate)
  }

  const singleRegex = /\b\d{4,8}\b/g
  for (const match of text.matchAll(singleRegex)) {
    if (match.index === undefined) continue
    if (isDisallowedContext(text, match.index, match.index + match[0].length)) continue
    addCandidate(match[0])
  }

  return results
}

function markRemoval(ranges: Array<{ start: number; end: number }>, text: string) {
  if (ranges.length === 0) return text
  const chars = text.split("")
  ranges.forEach(({ start, end }) => {
    for (let i = start; i < end && i < chars.length; i += 1) {
      chars[i] = " "
    }
  })
  return chars.join("")
}

export function stripPluTokensFromText(text: string) {
  const ranges: Array<{ start: number; end: number }> = []

  const rangeRegex = /(\d{4,8})\s*-\s*(\d{1,8})/g
  for (const match of text.matchAll(rangeRegex)) {
    if (match.index === undefined) continue
    const raw = match[0]
    if (raw.includes(".") || isDisallowedContext(text, match.index, match.index + raw.length)) {
      continue
    }
    ranges.push({ start: match.index, end: match.index + raw.length })
  }

  const singleRegex = /\b\d{4,8}\b/g
  for (const match of text.matchAll(singleRegex)) {
    if (match.index === undefined) continue
    if (isDisallowedContext(text, match.index, match.index + match[0].length)) continue
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }

  return markRemoval(ranges, text).replace(/\s{2,}/g, " ").trim()
}
