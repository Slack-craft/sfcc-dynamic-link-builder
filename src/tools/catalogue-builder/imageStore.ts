import { deleteAsset, getAsset, listAssets, putAsset } from "@/lib/assetStore"

export async function putImage(
  projectId: string,
  name: string,
  blob: Blob
): Promise<string> {
  return putAsset(projectId, "image", name, blob)
}

export async function getImage(assetId: string): Promise<Blob | undefined> {
  const asset = await getAsset(assetId)
  return asset?.blob
}

export async function clearImagesForProject(projectId: string): Promise<void> {
  const assets = await listAssets(projectId, "image")
  await Promise.all(assets.map((asset) => deleteAsset(asset.assetId)))
}
