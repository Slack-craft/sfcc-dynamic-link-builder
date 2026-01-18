import type { OfferExtraction } from "@/types/offer"
import { stripPluTokensFromText } from "@/lib/extraction/pluUtils"

type BrandOption = { label: string; value: string }

function normalizeText(value: string) {
  return value
    .replace(/[’‘]/g, "'")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim()
}

function norm(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function lineHasBrand(line: string, brands: BrandOption[]) {
  const lineNorm = norm(line)
  if (!lineNorm) return false
  return brands.some((brand) => {
    const labelNorm = norm(brand.label)
    return labelNorm ? lineNorm.includes(labelNorm) : false
  })
}

function findPercentOff(lines: string[]) {
  const patterns: Array<{ regex: RegExp; type: "upTo" | "save" | "basic" }> = [
    { regex: /up\s*to\s*(\d{1,3})\s*%/i, type: "upTo" },
    { regex: /save\s*(\d{1,3})\s*%/i, type: "save" },
    { regex: /(\d{1,3})\s*%\s*(off)?/i, type: "basic" },
  ]

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern.regex)
      if (!match) continue
      const num = Number(match[1])
      if (!Number.isFinite(num)) continue
      if (pattern.type === "upTo") {
        return { raw: `Up to ${num}% Off`, value: num }
      }
      return { raw: `${num}% Off`, value: num }
    }
  }
  return undefined
}

function findBrand(candidateText: string, brands: BrandOption[]) {
  const textNorm = norm(candidateText)
  let best:
    | { label: string; matchedFrom: string; score: number; len: number }
    | undefined

  brands.forEach((brand) => {
    const labelNorm = norm(brand.label)
    const valueNorm = norm(brand.value)
    if (!labelNorm) return
    const labelIndex = textNorm.indexOf(labelNorm)
    const valueIndex = valueNorm ? textNorm.indexOf(valueNorm) : -1
    const matchedIndex = labelIndex !== -1 ? labelIndex : valueIndex
    if (matchedIndex === -1) return
    const matchedText = labelIndex !== -1 ? brand.label : brand.value
    const score = labelNorm.length / labelNorm.length
    const candidate = {
      label: brand.label,
      matchedFrom: matchedText,
      score,
      len: labelNorm.length,
    }
    if (!best) {
      best = candidate
      return
    }
    if (candidate.score > best.score) {
      best = candidate
      return
    }
    if (candidate.score === best.score && candidate.len > best.len) {
      best = candidate
    }
  })

  if (!best) return undefined
  return { label: best.label, matchedFrom: best.matchedFrom, score: best.score }
}

function removeSegment(source: string, segment?: string) {
  if (!segment) return source
  const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return source.replace(new RegExp(escaped, "gi"), " ")
}

export function parseOfferText(
  rawText: string,
  brands: BrandOption[]
): OfferExtraction {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
  const filteredLines = lines
    .filter((line) => !/^also available/i.test(line))
    .filter((line) => {
      const hasPluParen = /\(\s*\d{4,8}\s*\)/.test(line)
      const hasPercent = /\b\d{1,3}\s*%\b/i.test(line)
      if (!hasPluParen) return true
      if (hasPercent) return true
      return lineHasBrand(line, brands)
    })
  const normalized =
    filteredLines.length > 0 ? filteredLines.join(" ") : normalizeText(rawText)
  const percentOff = findPercentOff(
    filteredLines.length > 0 ? filteredLines : [normalized]
  )
  const candidateText =
    filteredLines.length > 0
      ? filteredLines.slice(0, 3).join(" ")
      : normalized.slice(0, 220)
  let brand = findBrand(candidateText, brands)
  if (
    /eligible brands include|credit|club member|when you spend/i.test(normalized)
  ) {
    brand = undefined
  }

  let cleaned = normalized
  cleaned = removeSegment(cleaned, percentOff?.raw)
  cleaned = removeSegment(cleaned, brand?.matchedFrom ?? brand?.label)
  cleaned = cleaned.replace(/\b\d{1,3}\s*%\s*off\b/gi, " ")
  cleaned = cleaned.replace(/\$\s*\d+(?:\s+\d{2})?(?:\.\d{2})?/g, " ")
  cleaned = cleaned.replace(/\$/g, " ")
  cleaned = cleaned.replace(/\b(each|ea|kit|pack|set|pair|pk)\b/gi, " ")
  cleaned = stripPluTokensFromText(cleaned)
  cleaned = cleaned.replace(/\bsave\b/gi, " ")
  cleaned = cleaned.replace(/[-|•]+/g, " ").replace(/\s+/g, " ").trim()

  const productDetails = cleaned || undefined
  const parts: string[] = []
  if (percentOff?.raw) parts.push(percentOff.raw)
  if (brand?.label && productDetails) {
    parts.push(`${brand.label} ${productDetails}`.trim())
  } else if (productDetails) {
    parts.push(productDetails)
  } else if (brand?.label) {
    parts.push(brand.label)
  }
  const title = parts.length > 0 ? parts.join(" - ") : undefined

  return {
    percentOff,
    brand,
    productDetails,
    title,
    source: {
      rawText,
      cleanedText: normalized,
      lines: lines.length > 0 ? lines : normalized ? [normalized] : [],
    },
  }
}
