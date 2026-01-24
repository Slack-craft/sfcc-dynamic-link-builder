import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { parseCsvText, type CsvRow } from "@/lib/catalogueDataset/parseCsv"
import { detectFacetColumns } from "@/lib/catalogueDataset/columns"
import { getProjectDataset } from "@/lib/assetStore"

export type DatasetCache = {
  headers: string[]
  rowsRef: MutableRefObject<CsvRow[]>
  rowCount: number
  columnMeta: ReturnType<typeof detectFacetColumns>
  version: number
}

function getDatasetKey(projectId: string, datasetId: string) {
  return `${projectId}:catalogueDataset:${datasetId}`
}

export default function useProjectDataset(
  projectId?: string | null,
  datasetId?: string | null
) {
  const [datasetMeta, setDatasetMeta] = useState<DatasetCache | null>(null)
  const datasetRowsRef = useRef<CsvRow[]>([])

  const datasetHeaders = useMemo(() => {
    return datasetMeta?.headers ?? []
  }, [datasetMeta?.headers])

  const facetColumnList = useMemo(() => {
    const columns = datasetMeta?.columnMeta?.facetColumns
    if (!columns) return []
    return Object.values(columns).flat()
  }, [datasetMeta?.columnMeta])

  useEffect(() => {
    let cancelled = false

    async function hydrateDataset() {
      if (!projectId || !datasetId) {
        datasetRowsRef.current = []
        setDatasetMeta(null)
        return
      }

      const datasetKey = getDatasetKey(projectId, datasetId)
      const record = await getProjectDataset(datasetKey)
      if (cancelled) return
      if (!record?.csvText) {
        datasetRowsRef.current = []
        setDatasetMeta(null)
        return
      }

      const parsed = parseCsvText(record.csvText)
      datasetRowsRef.current = parsed.rows
      setDatasetMeta({
        headers: parsed.headers,
        rowsRef: datasetRowsRef,
        rowCount: parsed.rows.length,
        columnMeta: detectFacetColumns(parsed.headers),
        version: Date.now(),
      })
    }

    void hydrateDataset()
    return () => {
      cancelled = true
    }
  }, [projectId, datasetId])

  return {
    datasetMeta,
    datasetHeaders,
    datasetRowsRef,
    facetColumnList,
  }
}
