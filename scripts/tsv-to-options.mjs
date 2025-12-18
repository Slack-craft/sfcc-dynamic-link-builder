import fs from "node:fs"
import path from "node:path"

const inputPath = path.resolve("src/data/brands.tsv")
const outputPath = path.resolve("src/data/brands.ts")

const raw = fs.readFileSync(inputPath, "utf8")

const lines = raw
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)

const options = []
for (const line of lines) {
  // split on TAB, but also tolerate multiple spaces
  const parts = line.split("\t").map((p) => p.trim()).filter(Boolean)

  if (parts.length < 2) continue

  const label = parts[0]
  const value = parts[1]

  options.push({ label, value })
}

// de-dupe by value (keep first occurrence)
const seen = new Set()
const deduped = options.filter((o) => {
  if (seen.has(o.value)) return false
  seen.add(o.value)
  return true
})

// sort by label for nicer UX (optional; remove if you want “as-provided” order)
deduped.sort((a, b) => a.label.localeCompare(b.label))

const out =
  `// AUTO-GENERATED FILE. Do not edit by hand.\n` +
  `// Source: src/data/brands.tsv\n\n` +
  `export type Option = { label: string; value: string }\n\n` +
  `export const BRAND_OPTIONS: Option[] = ${JSON.stringify(deduped, null, 2)}\n`

fs.writeFileSync(outputPath, out, "utf8")
console.log(`Wrote ${deduped.length} brands to ${outputPath}`)
