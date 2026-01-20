type ColumnMeta = {
  facetKeys: string[]
  facetColumns: Record<string, string[]>
}

export function detectFacetColumns(headers: string[]): ColumnMeta {
  const facetColumns: Record<string, string[]> = {}
  headers.forEach((header) => {
    if (!header.startsWith("c__")) return
    const parts = header.split("__")
    const facetKey = parts[1]
    if (!facetKey) return
    if (!facetColumns[facetKey]) {
      facetColumns[facetKey] = []
    }
    facetColumns[facetKey].push(header)
  })

  return {
    facetKeys: Object.keys(facetColumns).sort(),
    facetColumns,
  }
}
