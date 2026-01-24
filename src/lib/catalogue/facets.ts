export function buildFacetQueryFromSelections(
  selectedBrands: string[],
  selectedArticleTypes: string[]
) {
  const selected: Record<string, string[]> = {}
  if (selectedBrands.length > 0) {
    selected.brand = selectedBrands
  }
  if (selectedArticleTypes.length > 0) {
    selected.adArticleType = selectedArticleTypes
  }
  const entries = Object.entries(selected).filter(([, values]) => values.length > 0)
  if (entries.length === 0) return ""
  const params = entries.map(([facetKey, values], index) => {
    const prefIndex = index + 1
    const outputKey = facetKey === "brand" ? "srgBrand" : facetKey
    const encodedValues = encodeURIComponent(values.join("|"))
    return `prefn${prefIndex}=${encodeURIComponent(outputKey)}&prefv${prefIndex}=${encodedValues}`
  })
  return `?${params.join("&")}&sz=36`
}
