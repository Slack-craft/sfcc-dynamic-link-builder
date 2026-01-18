export type OfferExtraction = {
  percentOff?: { raw: string; value: number }
  brand?: { label: string; matchedFrom: string; score: number }
  price?: { raw: string; value: number; qualifier?: string }
  save?: { raw: string; value?: number }
  productDetails?: string
  title?: string
  source?: { rawText: string; cleanedText: string; lines: string[] }
}
