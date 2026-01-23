import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function EmbeddedPreviewCard({ previewUrlValue }: { previewUrlValue?: string }) {
  const src = previewUrlValue
    ? /^https?:\/\//i.test(previewUrlValue)
      ? previewUrlValue
      : `https://${previewUrlValue}`
    : "https://staging.supercheapauto.com.au/catalogue-out-now"

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Embedded Preview (Experimental)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <iframe
          src={src}
          title="Embedded Preview"
          className="h-[600px] w-full border-0"
        />
      </CardContent>
    </Card>
  )
}
