import { Outlet, useLocation } from "react-router-dom"

import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const pageTitles: Record<string, string> = {
  "/catalogue-builder": "Catalogue Builder",
  "/link-builder": "Link Builder",
}

export default function AppShell() {
  const { pathname } = useLocation()
  const title = pageTitles[pathname] ?? "Tools"

  return (
    <SidebarProvider className="min-h-screen w-full">
      <AppSidebar />
      <SidebarInset className="flex-1 min-w-0">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <h1 className="text-sm font-medium">{title}</h1>
        </header>
        <div className="flex-1 min-w-0 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
