export type CsvRow = Record<string, string>

export type CsvParseResult = {
  headers: string[]
  rows: CsvRow[]
}

export function parseCsvText(text: string): CsvParseResult {
  const rows: string[][] = []
  let current: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && (char === "," || char === "\n")) {
      current.push(field)
      field = ""
      if (char === "\n") {
        rows.push(current)
        current = []
      }
      continue
    }

    if (!inQuotes && char === "\r") {
      continue
    }

    field += char
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field)
    rows.push(current)
  }

  const headers = rows.shift()?.map((value) => value.trim()) ?? []
  const resultRows: CsvRow[] = rows
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => {
      const record: CsvRow = {}
      headers.forEach((header, index) => {
        record[header] = row[index]?.trim() ?? ""
      })
      return record
    })

  return { headers, rows: resultRows }
}

export async function parseCsvFile(file: File): Promise<CsvParseResult> {
  const text = await file.text()
  return parseCsvText(text)
}
