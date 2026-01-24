export const MAX_PLUS_FIELDS = 20

export function buildIdFilter(pluValues: string[]) {
  const joined = pluValues.join("%7c")
  return `?prefn1=id&prefv1=${joined}`
}

export function buildPlusArray(values: string[]) {
  return Array.from({ length: Math.max(MAX_PLUS_FIELDS, values.length) }, (_, index) => {
    return values[index] ?? ""
  })
}

export function createEmptyExtractedFlags() {
  return Array.from({ length: MAX_PLUS_FIELDS }, () => false)
}
