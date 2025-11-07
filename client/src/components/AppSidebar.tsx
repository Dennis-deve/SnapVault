import { Home, FolderOpen, Search, Settings, Video, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface AppSidebarProps {
  onNavigate: (path: string) => void;
  currentPath?: string;
}

export function AppSidebar({ onNavigate, currentPath }: AppSidebarProps) {
  const menuItems = [
    { icon: Home, label: "Home", path: "/dashboard" },
    { icon: Search, label: "Search", path: "/search" },
    { icon: FolderOpen, label: "All Albums", path: "/dashboard" },
  ];

  const categoryItems = [
    { icon: Video, label: "Video Albums", path: "/dashboard?tab=videos" },
    { icon: ImageIcon, label: "Photo Albums", path: "/dashboard?tab=photos" },
  ];

  return (
    <aside className="w-64 border-r bg-background h-[calc(100vh-4rem)] flex flex-col">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Main
            </h3>
            <div className="space-y-1">
              {menuItems.map((item) => (
                <Button
                  key={item.path}
                  variant={currentPath === item.path ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3"
                  onClick={() => onNavigate(item.path)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Categories
            </h3>
            <div className="space-y-1">
              {categoryItems.map((item) => (
                <Button
                  key={item.path}
                  variant="ghost"
                  className="w-full justify-start gap-3"
                  onClick={() => onNavigate(item.path)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3"
              onClick={() => onNavigate("/settings")}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
}
