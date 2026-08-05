import { Home, FolderOpen, Search, Settings } from "lucide-react";
import { useLocation } from "wouter";

interface BottomNavProps {
  currentPath: string;
}

const TABS = [
  { icon: Home, label: "Home", path: "/dashboard" },
  { icon: FolderOpen, label: "Albums", path: "/dashboard" },
  { icon: Search, label: "Search", path: "/search" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function BottomNav({ currentPath }: BottomNavProps) {
  const [, setLocation] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 h-20 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-t shadow-[0_-2px_16px_0_rgba(16,24,40,0.08)] lg:hidden"
      aria-label="Primary"
    >
      <div className="grid grid-cols-4 h-full max-w-md mx-auto">
        {TABS.map((tab) => {
          // "Home" and "Albums" both point at /dashboard, so disambiguate by
          // label rather than path alone.
          const active =
            (tab.label === "Home" && currentPath === "/dashboard") ||
            (tab.label === "Albums" && currentPath.startsWith("/album")) ||
            (tab.label === "Search" && currentPath.startsWith("/search")) ||
            (tab.label === "Settings" && currentPath.startsWith("/settings"));

          return (
            <button
              key={tab.label}
              onClick={() => setLocation(tab.path)}
              className="flex flex-col items-center justify-center gap-1.5 pt-2"
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
              data-testid={`bottomnav-${tab.label.toLowerCase()}`}
            >
              <span
                className={`flex items-center justify-center h-[26px] w-9 rounded-lg transition-colors ${
                  active ? "bg-primary/12" : "bg-transparent"
                }`}
              >
                <tab.icon
                  className={`h-[18px] w-[18px] ${active ? "text-primary" : "text-muted-foreground"}`}
                  strokeWidth={active ? 2.4 : 2}
                />
              </span>
              <span
                className={`text-[11px] leading-none ${
                  active ? "text-primary font-semibold" : "text-muted-foreground font-normal"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
