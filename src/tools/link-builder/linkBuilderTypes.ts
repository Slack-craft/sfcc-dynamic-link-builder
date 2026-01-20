export type LinkBuilderOption = {
  label: string
  value: string
}

export type LinkBuilderState = {
  category: LinkBuilderOption | null
  brand: LinkBuilderOption | null
  extension: string
  plus: string[]
  previewPathOverride?: string
  captureMode?: "path+filters" | "filters-only"
}
