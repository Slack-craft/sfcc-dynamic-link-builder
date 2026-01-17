import React from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import { Toaster } from "@/components/ui/sonner"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import AppShell from "@/app/AppShell"
import CatalogueBuilderPage from "@/pages/CatalogueBuilderPage"
import LinkBuilderPage from "@/pages/LinkBuilderPage"
import PdfTileDetectionPage from "@/pages/PdfTileDetectionPage"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Navigate to="/catalogue-builder" replace />} />
          <Route path="catalogue-builder" element={<CatalogueBuilderPage />} />
          <Route path="link-builder" element={<LinkBuilderPage />} />
          <Route path="pdf-tile-detection" element={<PdfTileDetectionPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  </React.StrictMode>
)
