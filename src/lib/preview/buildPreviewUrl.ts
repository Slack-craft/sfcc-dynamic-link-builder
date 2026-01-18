export function buildPreviewUrl(
  output: string | undefined,
  scope?: "AU" | "NZ"
): string {
  const base =
    scope === "NZ"
      ? "https://staging.supercheapauto.co.nz/"
      : "https://staging.supercheapauto.com.au/"

  if (!output) return base
  const trimmed = output.trim()
  if (!trimmed) return base

  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i)
  if (urlMatch?.[0]) return urlMatch[0]

  if (trimmed.includes("$Url(")) return base

  return base
}
