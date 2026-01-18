export type OfferExtraction = {
  percentOff?: { raw: string; value: number }
  brand?: { label: string; matchedFrom: string; score: number }
  productDetails?: string
  title?: string
  source?: {
    rawText: string
    cleanedText: string
    lines: string[]
  }
}
