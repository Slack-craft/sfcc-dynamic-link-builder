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

function findPrice(lines: string[], normalized: string) {
  const priceRegex = /\$\s*\d+(?:\.\d{2})?/g
  const qualifierRegex = /(each|ea|pair|set|pack|kit|only|from|per\s+\w+)/i
  const qualifierPreferredRegex = /(each|ea|per|pair|set|pack|kit|for)/i
  const matches = Array.from(normalized.matchAll(priceRegex))
  if (matches.length === 0) return undefined

  let chosen: RegExpMatchArray | undefined
  let chosenLine = normalized
  for (const line of lines) {
    if (!qualifierPreferredRegex.test(line)) continue
    const lineMatch = line.match(priceRegex)
    if (lineMatch) {
      chosen = lineMatch as unknown as RegExpMatchArray
      chosenLine = line
      break
    }
  }

  if (!chosen) {
    chosen = matches[0] as RegExpMatchArray
    chosenLine = normalized
    for (const line of lines) {
      if (line.includes(chosen[0])) {
        chosenLine = line
        break
      }
    }
  }

  const raw = chosen[0]
  const numeric = Number(raw.replace(/\$/g, "").trim())
  if (!Number.isFinite(numeric)) return undefined

  let qualifier: string | undefined
  const index = chosenLine.indexOf(raw)
  if (index !== -1) {
    const after = chosenLine.slice(index + raw.length, index + raw.length + 12)
    const qualMatch = after.match(qualifierRegex)
    if (qualMatch) qualifier = qualMatch[0].trim()
  }

  return { raw, value: numeric, qualifier }
}

function findSave(lines: string[]) {
  const saveRegex = /save\s*\$\s*\d+(?:\.\d{2})?/i
  for (const line of lines) {
    const match = line.match(saveRegex)
    if (!match) continue
    const raw = match[0]
    const numeric = Number(raw.replace(/save/i, "").replace(/\$/g, "").trim())
    const value = Number.isFinite(numeric) ? numeric : undefined
    return { raw: raw.replace(/\s+/g, " ").trim(), value }
  }
  return undefined
}

function findBrand(normalized: string, brands: BrandOption[]) {
  const textNorm = norm(normalized)
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
  const normalized = normalizeText(rawText)
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
  const percentOff = findPercentOff(lines.length > 0 ? lines : [normalized])
  const price = findPrice(lines.length > 0 ? lines : [normalized], normalized)
  const save = findSave(lines.length > 0 ? lines : [normalized])
  const brand = findBrand(normalized, brands)

  let cleaned = normalized
  cleaned = removeSegment(cleaned, percentOff?.raw)
  cleaned = removeSegment(cleaned, price?.raw)
  cleaned = removeSegment(cleaned, save?.raw)
  cleaned = removeSegment(cleaned, brand?.matchedFrom ?? brand?.label)
  cleaned = stripPluTokensFromText(cleaned)
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
  if (price) {
    parts.push(price.qualifier ? `${price.raw} ${price.qualifier}` : price.raw)
  }
  if (save?.raw) parts.push(save.raw)

  const title = parts.length > 0 ? parts.join(" - ") : undefined

  return {
    percentOff,
    brand,
    price,
    save,
    productDetails,
    title,
    source: {
      rawText,
      cleanedText: normalized,
      lines: lines.length > 0 ? lines : normalized ? [normalized] : [],
    },
  }
}
