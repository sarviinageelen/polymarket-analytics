import { GitBranch, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NAVIGATION } from "@/lib/constants"
import { StatusBadge } from "@/components/shared/status-badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function AppSidebar({ view, onNavigate, repository, controllerStatus, controllerLabel }) {
  const { isMobile, setOpenMobile } = useSidebar()

  function navigate(nextView) {
    onNavigate(nextView)
    setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-2">
        <div className="flex items-center gap-1">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="Polymarket Analytics" onClick={() => navigate("overview")} className="h-auto min-h-11 px-2 hover:bg-transparent focus-visible:bg-transparent active:bg-transparent">
                <span className="hidden size-8 shrink-0 place-items-center rounded-md border bg-background text-[11px] font-semibold group-data-[collapsible=icon]:grid">PA</span>
                <span className="min-w-0 text-left group-data-[collapsible=icon]:hidden">
                  <span className="block truncate font-semibold">Polymarket Analytics</span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          {isMobile && (
            <Button variant="ghost" size="icon-sm" onClick={() => setOpenMobile(false)} aria-label="Close navigation">
              <X />
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label="Primary navigation" className="flex min-h-0 flex-1 flex-col">
        {NAVIGATION.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={view === item.id}
                      aria-current={view === item.id ? "page" : undefined}
                      tooltip={item.label}
                      onClick={() => navigate(item.id)}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        </nav>
      </SidebarContent>

      <SidebarFooter className="gap-2 p-2" role="contentinfo" aria-label="Application status and links">
        <div className="group-data-[collapsible=icon]:hidden">
          <StatusBadge status={controllerStatus} className="max-w-full">{controllerLabel}</StatusBadge>
        </div>
        {repository && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Open GitHub repository">
                <a href={`https://github.com/${repository}`} target="_blank" rel="noreferrer">
                  <GitBranch />
                  <span className="truncate">GitHub repository</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
