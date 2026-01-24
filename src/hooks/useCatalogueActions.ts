import type { RefObject } from "react"
import type { CatalogueProject, Tile } from "@/tools/catalogue-builder/catalogueTypes"
import type { LinkBuilderState } from "@/tools/link-builder/linkBuilderTypes"
import { BRAND_OPTIONS } from "@/data/brands"
import { extractTextFromRect, loadPdfDocument, type PdfRect } from "@/tools/catalogue-builder/pdfTextExtract"
import { parseOfferText } from "@/lib/extraction/parseOfferText"
import { extractPlusFromPdfText } from "@/lib/extraction/pluUtils"
import { getAsset } from "@/lib/assetStore"
import { buildFacetQueryFromSelections } from "@/lib/catalogue/facets"
import { buildPlusArray, createEmptyExtractedFlags } from "@/lib/catalogue/plu"
import {
  buildDynamicOutputFromState,
  createEmptyLinkBuilderState,
  getBrandStub,
  isBrandPath,
} from "@/lib/catalogue/link"
import { findRectById, getExportSpreadOrder, getFirstPageExport } from "@/lib/catalogue/pdf"
import { parseTileMapping, slugifyLabel } from "@/lib/catalogue/format"

type ToastApi = {
  error: (message: string) => void
  info: (message: string) => void
  success: (message: string) => void
  warning: (message: string) => void
}

type PdfDoc = Awaited<ReturnType<typeof loadPdfDocument>>
type PdfPage = Awaited<ReturnType<PdfDoc["getPage"]>>

type PdfExportBox = PdfRect & {
  rectId?: string
  include?: boolean
  orderIndex?: number
}

type PdfExportPage = {
  pageNumber: number
  pageWidth?: number
  pageHeight?: number
  boxes: PdfExportBox[]
}

type PdfExportEntry = {
  pdfId: string
  filename?: string
  spreadNumber?: number
  pages: Record<string, PdfExportPage> | PdfExportPage[]
}

type UseCatalogueActionsParams = {
  project: CatalogueProject | null
  selectedTile: Tile | null
  draftLinkState: LinkBuilderState
  setDraftLinkState: (next: LinkBuilderState) => void
  setDraftLinkOutput: (next: string) => void
  setDraftExtractedFlags: (flags: boolean[]) => void
  setDraftLiveCapturedUrl: (value: string) => void
  setDraftLinkSource: (value: "manual" | "live") => void
  setDraftActiveLinkMode: (mode: "plu" | "facet" | "live") => void
  setDraftUserHasChosenMode: (value: boolean) => void
  setPendingCapturedUrl: (value: string | null) => void
  setCaptureDialogOpen: (value: boolean) => void
  setPdfExtractRunning: (value: boolean) => void
  pdfExtractRunning: boolean
  datasetBrandOptions: Array<{ label: string; value: string }>
  pdfAssetNames: Record<string, string>
  updateTile: (project: CatalogueProject, tileId: string, overrides: Partial<Tile>) => CatalogueProject
  upsertProject: (updated: CatalogueProject) => void
  deleteImagesForProject: (projectId: string) => Promise<void>
  setSelectedTileId: (tileId: string | null) => void
  replaceInputRef: RefObject<HTMLInputElement | null>
  toast: ToastApi
  maxExtractedPlus: number
  isDev: boolean
}

export default function useCatalogueActions({
  project,
  selectedTile,
  draftLinkState,
  setDraftLinkState,
  setDraftLinkOutput,
  setDraftExtractedFlags,
  setDraftLiveCapturedUrl,
  setDraftLinkSource,
  setDraftActiveLinkMode,
  setDraftUserHasChosenMode,
  setPendingCapturedUrl,
  setCaptureDialogOpen,
  setPdfExtractRunning,
  pdfExtractRunning,
  datasetBrandOptions,
  pdfAssetNames,
  updateTile,
  upsertProject,
  deleteImagesForProject,
  setSelectedTileId,
  replaceInputRef,
  toast,
  maxExtractedPlus,
  isDev,
}: UseCatalogueActionsParams) {
  function convertCapturedUrlToBuilderState(finalUrl: string, currentState: LinkBuilderState) {
    let parsed: URL
    try {
      parsed = new URL(finalUrl)
    } catch {
      return { nextState: currentState, didConvert: false, warnings: ["Invalid URL"] }
    }

    const pathname = parsed.pathname ?? ""
    const params = new URLSearchParams(parsed.search)

    const productMatch = pathname.match(/\/p\/[^/]+\/(\d{4,8})\.html/i)
    if (productMatch) {
      const plu = productMatch[1]
      return {
        nextState: {
          ...currentState,
          category: null,
          brand: null,
          plus: buildPlusArray([plu]),
          previewPathOverride: "",
        },
        didConvert: true,
        warnings: [],
      }
    }

    const prefn1 = params.get("prefn1")
    const prefv1 = params.get("prefv1")
    if (prefn1?.toLowerCase() === "id" && prefv1) {
      const parsedPlus = prefv1
        .split("|")
        .map((value) => value.trim())
        .filter(Boolean)
      if (parsedPlus.length > 0) {
        const baseState =
          currentState.category || currentState.brand
            ? currentState
            : { ...currentState, category: { label: "Catalog", value: "catalogue-onsale" } }
        return {
          nextState: {
            ...baseState,
            plus: buildPlusArray(parsedPlus),
            previewPathOverride: "",
          },
          didConvert: true,
          warnings: [],
        }
      }
    }

    if (pathname === "/catalogue-out-now") {
      return {
        nextState: {
          ...currentState,
          category: { label: "Catalog", value: "catalogue-onsale" },
          brand: null,
          plus: buildPlusArray([]),
          previewPathOverride: "/catalogue-out-now",
        },
        didConvert: true,
        warnings: [],
      }
    }

    if (isBrandPath(pathname)) {
      const stub = getBrandStub(pathname)
      const match = BRAND_OPTIONS.find((option) => slugifyLabel(option.label) === stub)
      if (!match) {
        return {
          nextState: currentState,
          didConvert: false,
          warnings: ["Unable to map brand from captured URL."],
        }
      }
      return {
        nextState: {
          ...currentState,
          brand: match,
          category: null,
          plus: buildPlusArray([]),
          previewPathOverride: pathname,
        },
        didConvert: true,
        warnings: [],
      }
    }

    return {
      nextState: currentState,
      didConvert: false,
      warnings: ["Unable to convert this URL to a dynamic link yet."],
    }
  }

  function reExtractOfferForSelected() {
    if (!project || !selectedTile) return
    if (!selectedTile.extractedText) {
      toast.error("No extracted text available for this tile.")
      return
    }
    const offer = parseOfferText(selectedTile.extractedText, datasetBrandOptions)
    const shouldSetTitle = !selectedTile.title || !selectedTile.titleEditedManually
    const nextTitle = shouldSetTitle ? offer.title ?? selectedTile.title : selectedTile.title
    const updated = updateTile(project, selectedTile.id, {
      offer,
      title: nextTitle,
      titleEditedManually: shouldSetTitle ? false : selectedTile.titleEditedManually,
      offerUpdatedAt: Date.now(),
      imageUpdatedSinceExtraction: false,
    })
    upsertProject(updated)
    toast.success("Offer extracted.")
  }

  function confirmReplaceAll() {
    if (!project) return
    if (!window.confirm("Replace all images? This will remove existing tiles.")) return
    replaceInputRef.current?.click()
  }

  async function confirmClearAll() {
    if (!project) return
    if (!window.confirm("Clear all tiles? This cannot be undone.")) return
    await deleteImagesForProject(project.id)
    const updated: CatalogueProject = {
      ...project,
      tiles: [],
      imageAssetIds: [],
      updatedAt: new Date().toISOString(),
    }
    upsertProject(updated)
    setSelectedTileId(null)
  }

  async function extractPlusFromPdf() {
    if (!project || pdfExtractRunning) return
    if (project.pdfAssetIds.length === 0) {
      toast.error("No PDFs uploaded for this project.")
      return
    }
    const detectionState = project.pdfDetection as {
      byPdfAssetId?: Record<string, PdfExportEntry>
      export?: PdfExportEntry[]
    }
    const exportById = detectionState?.byPdfAssetId
    const exportMap = detectionState?.export
    if ((!exportById || Object.keys(exportById).length === 0) && (!exportMap || exportMap.length === 0)) {
      toast.error("No PDF detection export found.")
      return
    }

    setPdfExtractRunning(true)
    let processedTiles = 0
    let tilesWithPlus = 0
    let totalPlus = 0
    let missingMappings = 0
    let missingNoExport = 0
    let missingNoRect = 0
    let missingNoMatch = 0
    let spreadsFound = 0
    let missingLogCount = 0

    try {
      const buildOfferUpdate = (tile: Tile, text: string) => {
        const offer = parseOfferText(text, datasetBrandOptions)
        const shouldSetTitle = !tile.title || !tile.titleEditedManually
        const nextTitle = shouldSetTitle ? offer.title ?? tile.title : tile.title
        return {
          offer,
          extractedText: text,
          title: nextTitle,
          titleEditedManually: shouldSetTitle ? false : tile.titleEditedManually,
          offerUpdatedAt: Date.now(),
        }
      }

      const docCache = new Map<string, PdfDoc>()
      const pageCache = new Map<string, Map<number, PdfPage>>()
      const exportEntries = getExportSpreadOrder(exportMap ?? [])
      spreadsFound = exportEntries.length
      const rectIdByImageId = new Map<string, string>()
      Object.entries(project.tileMatches ?? {}).forEach(([rectId, imageId]) => {
        rectIdByImageId.set(imageId, rectId)
      })
      const resolvedTiles: Tile[] = []
      for (const tile of project.tiles) {
        const fileName = tile.originalFileName ?? tile.id
        const matchedRectId = tile.imageKey ? rectIdByImageId.get(tile.imageKey) : undefined
        if (matchedRectId) {
          const matched = findRectById(exportEntries, matchedRectId)
          if (!matched) {
            missingMappings += 1
            missingNoMatch += 1
            resolvedTiles.push({
              ...tile,
              pdfMappingStatus: "missing",
              pdfMappingReason: "Matched rect not found in export",
            })
            continue
          }

          const { entry: pdfEntry, page: pageEntry, box } = matched
          const pdfAssetId = pdfEntry.pdfId
          let doc = docCache.get(pdfAssetId)
          if (!doc) {
            const asset = await getAsset(pdfAssetId)
            if (!asset) {
              missingMappings += 1
              resolvedTiles.push({
                ...tile,
                pdfMappingStatus: "missing",
                pdfMappingReason: "PDF asset missing",
              })
              continue
            }
            doc = await loadPdfDocument(asset.blob)
            docCache.set(pdfAssetId, doc)
          }

          let perDocPageCache = pageCache.get(pdfAssetId)
          if (!perDocPageCache) {
            perDocPageCache = new Map()
            pageCache.set(pdfAssetId, perDocPageCache)
          }
          const pageNumber = pageEntry.pageNumber ?? 1
          let page = perDocPageCache.get(pageNumber)
          if (!page) {
            page = await doc.getPage(pageNumber)
            perDocPageCache.set(pageNumber, page)
          }

          processedTiles += 1
          const rect = {
            xPdf: box.xPdf,
            yPdf: box.yPdf,
            wPdf: box.wPdf,
            hPdf: box.hPdf,
          }
          const text = await extractTextFromRect(page, rect)
          const plus = extractPlusFromPdfText(text)
          const offerUpdate = buildOfferUpdate(tile, text)
          const pageWidth = pageEntry.pageWidth ?? page.getViewport({ scale: 1 }).width
          const mappedHalf = box.xPdf + box.wPdf / 2 < pageWidth / 2 ? "left" : "right"
          if (plus.length > 0) {
            const trimmed = plus.slice(0, maxExtractedPlus)
            const baseState = tile.linkBuilderState ?? createEmptyLinkBuilderState()
            const nextFlags = createEmptyExtractedFlags()
            trimmed.forEach((_, index) => {
              if (index < nextFlags.length) nextFlags[index] = true
            })
            resolvedTiles.push({
              ...tile,
              linkBuilderState: {
                ...baseState,
                plus: baseState.plus.map((_, index) => trimmed[index] ?? ""),
              },
              extractedPluFlags: nextFlags,
              pdfMappingStatus: undefined,
              pdfMappingReason: undefined,
              mappedPdfFilename: pdfEntry.filename ?? pdfAssetNames[pdfAssetId],
              mappedSpreadNumber: pdfEntry.spreadNumber,
              mappedHalf,
              mappedBoxIndex: box.orderIndex,
              ...offerUpdate,
            })
            tilesWithPlus += 1
            totalPlus += trimmed.length
          } else {
            resolvedTiles.push({
              ...tile,
              pdfMappingStatus: undefined,
              pdfMappingReason: undefined,
              mappedPdfFilename: pdfEntry.filename ?? pdfAssetNames[pdfAssetId],
              mappedSpreadNumber: pdfEntry.spreadNumber,
              mappedHalf,
              mappedBoxIndex: box.orderIndex,
              ...offerUpdate,
            })
          }

          continue
        }
        const mapping = parseTileMapping(fileName)
        if (!mapping) {
          missingMappings += 1
          const missingTile: Tile = {
            ...tile,
            pdfMappingStatus: "missing",
            pdfMappingReason: "Missing page/box mapping",
          }
          if (isDev && missingLogCount < 20) {
            console.log("[pdf-extract] missing mapping", {
              fileName,
              reason: "no page/box match",
            })
            missingLogCount += 1
          }
          resolvedTiles.push(missingTile)
          continue
        }
        const pdfEntry = exportEntries.find((entry) => entry.spreadNumber === mapping.spreadIndex)
        if (!pdfEntry) {
          missingMappings += 1
          missingNoExport += 1
          const missingTile: Tile = {
            ...tile,
            pdfMappingStatus: "missing",
            pdfMappingReason: `No pdf export for spreadIndex ${mapping.spreadIndex}`,
          }
          if (isDev && missingLogCount < 20) {
            console.log("[pdf-extract] missing mapping", {
              fileName,
              imgPage: mapping.imgPage,
              spreadIndex: mapping.spreadIndex,
              half: mapping.half,
              boxOrder: mapping.boxOrder,
              exportFound: false,
            })
            missingLogCount += 1
          }
          resolvedTiles.push(missingTile)
          continue
        }
        const pdfAssetId = pdfEntry.pdfId

        let doc = docCache.get(pdfAssetId)
        if (!doc) {
          const asset = await getAsset(pdfAssetId)
          if (!asset) {
            missingMappings += 1
            const missingTile: Tile = {
              ...tile,
              pdfMappingStatus: "missing",
              pdfMappingReason: "PDF asset missing",
            }
            if (isDev && missingLogCount < 20) {
              console.log("[pdf-extract] missing mapping", {
                fileName,
                imgPage: mapping.imgPage,
                spreadIndex: mapping.spreadIndex,
                half: mapping.half,
                boxOrder: mapping.boxOrder,
                pdfAssetIdFound: true,
                exportFound: true,
                assetFound: false,
              })
              missingLogCount += 1
            }
            resolvedTiles.push(missingTile)
            continue
          }
          doc = await loadPdfDocument(asset.blob)
          docCache.set(pdfAssetId, doc)
        }

        let perDocPageCache = pageCache.get(pdfAssetId)
        if (!perDocPageCache) {
          perDocPageCache = new Map()
          pageCache.set(pdfAssetId, perDocPageCache)
        }
        let page = perDocPageCache.get(1)
        if (!page) {
          page = await doc.getPage(1)
          perDocPageCache.set(1, page)
        }

        const pageEntry = getFirstPageExport(pdfEntry)
        if (!pageEntry) {
          missingMappings += 1
          missingNoRect += 1
          const missingTile: Tile = {
            ...tile,
            pdfMappingStatus: "missing",
            pdfMappingReason: "No rects for export page",
          }
          if (isDev && missingLogCount < 20) {
            console.log("[pdf-extract] missing mapping", {
              fileName,
              imgPage: mapping.imgPage,
              spreadIndex: mapping.spreadIndex,
              half: mapping.half,
              boxOrder: mapping.boxOrder,
              pdfAssetIdFound: true,
              exportFound: true,
              pageFound: false,
            })
            missingLogCount += 1
          }
          resolvedTiles.push(missingTile)
          continue
        }

        const pageWidth = page.getViewport({ scale: 1 }).width
        const withOrder = pageEntry.boxes.filter(
          (item: PdfExportBox) => (item.include ?? true) && Number.isFinite(item.orderIndex)
        )
        const leftBucket = withOrder
          .filter((item: PdfExportBox) => item.xPdf + item.wPdf / 2 < pageWidth / 2)
          .sort(
            (a: PdfExportBox, b: PdfExportBox) =>
              (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
          )
        const rightBucket = withOrder
          .filter((item: PdfExportBox) => item.xPdf + item.wPdf / 2 >= pageWidth / 2)
          .sort(
            (a: PdfExportBox, b: PdfExportBox) =>
              (a.orderIndex ?? 0) - (b.orderIndex ?? 0)
          )
        const bucket = mapping.half === "left" ? leftBucket : rightBucket
        const box = bucket[mapping.boxOrder - 1]
        if (!box) {
          missingMappings += 1
          missingNoRect += 1
          const missingTile: Tile = {
            ...tile,
            pdfMappingStatus: "missing",
            pdfMappingReason: `No rect for box (L:${leftBucket.length} R:${rightBucket.length})`,
          }
          if (isDev && missingLogCount < 20) {
            const orderIndices = bucket.map((item: PdfExportBox) => item.orderIndex ?? 0)
            const minOrder = orderIndices.length > 0 ? Math.min(...orderIndices) : null
            const maxOrder = orderIndices.length > 0 ? Math.max(...orderIndices) : null
            console.log("[pdf-extract] missing mapping", {
              fileName,
              imgPage: mapping.imgPage,
              spreadIndex: mapping.spreadIndex,
              half: mapping.half,
              boxOrder: mapping.boxOrder,
              pdfAssetIdFound: true,
              exportFound: true,
              bucketSize: bucket.length,
              leftBucketSize: leftBucket.length,
              rightBucketSize: rightBucket.length,
              orderRange: [minOrder, maxOrder],
            })
            missingLogCount += 1
          }
          resolvedTiles.push(missingTile)
          continue
        }
        processedTiles += 1
        const rect = {
          xPdf: box.xPdf,
          yPdf: box.yPdf,
          wPdf: box.wPdf,
          hPdf: box.hPdf,
        }
        const text = await extractTextFromRect(page, rect)
        const plus = extractPlusFromPdfText(text)
        const offerUpdate = buildOfferUpdate(tile, text)
        if (plus.length > 0) {
          const trimmed = plus.slice(0, maxExtractedPlus)
          const baseState = tile.linkBuilderState ?? createEmptyLinkBuilderState()
          const nextFlags = createEmptyExtractedFlags()
          trimmed.forEach((_, index) => {
            if (index < nextFlags.length) nextFlags[index] = true
          })
          resolvedTiles.push({
            ...tile,
            linkBuilderState: {
              ...baseState,
              plus: baseState.plus.map((_, index) => trimmed[index] ?? ""),
            },
            extractedPluFlags: nextFlags,
            pdfMappingStatus: undefined,
            pdfMappingReason: undefined,
            mappedPdfFilename: pdfEntry.filename ?? pdfAssetNames[pdfAssetId],
            mappedSpreadNumber: mapping.spreadIndex,
            mappedHalf: mapping.half,
            mappedBoxIndex: mapping.boxOrder,
            ...offerUpdate,
          })
          tilesWithPlus += 1
          totalPlus += trimmed.length
        } else {
          resolvedTiles.push({
            ...tile,
            pdfMappingStatus: undefined,
            pdfMappingReason: undefined,
            mappedPdfFilename: pdfEntry.filename ?? pdfAssetNames[pdfAssetId],
            mappedSpreadNumber: mapping.spreadIndex,
            mappedHalf: mapping.half,
            mappedBoxIndex: mapping.boxOrder,
            ...offerUpdate,
          })
        }
      }

      const updated: CatalogueProject = {
        ...project,
        tiles: resolvedTiles,
        updatedAt: new Date().toISOString(),
      }
      upsertProject(updated)
      toast.success(
        `${processedTiles} tiles processed, ${tilesWithPlus} with PLUs, ${totalPlus} PLUs filled, ` +
          `${missingMappings} missing mappings (spreads ${spreadsFound}, no export ${missingNoExport}, no rect ${missingNoRect}, no match ${missingNoMatch}).`
      )
    } catch (error) {
      toast.error("PDF extraction failed. Check the PDF asset and detection map.")
    } finally {
      setPdfExtractRunning(false)
    }
  }

  return {
    actions: {
      extractPlusFromPdf,
      reExtractOfferForSelected,
      confirmReplaceAll,
      confirmClearAll,
      convertCapturedUrlToBuilderState,
    },
  }
}
