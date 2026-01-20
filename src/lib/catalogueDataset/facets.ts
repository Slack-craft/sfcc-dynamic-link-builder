import type { CsvRow } from "@/lib/catalogueDataset/parseCsv"

export function extractFacetKeys(headers: string[]): string[] {
  const keys = new Set<string>()
  headers.forEach((header) => {
    if (!header.startsWith("c__")) return
    const parts = header.split("__")
    if (parts[1]) {
      keys.add(parts[1])
    }
  })
  return Array.from(keys).sort()
}

export function getFacetValue(
  row: CsvRow,
  facetKey: string,
  scope: "AU" | "NZ" = "AU"
): string {
  const candidates =
    scope === "AU"
      ? [
          `c__${facetKey}__supercheap-au`,
          `c__${facetKey}__default`,
          `c__${facetKey}`,
        ]
      : [
          `c__${facetKey}__supercheap-nz`,
          `c__${facetKey}__default`,
          `c__${facetKey}`,
        ]

  for (const key of candidates) {
    const value = row[key]
    if (value && value.trim().length > 0) {
      return value.trim()
    }
  }
  return ""
}
