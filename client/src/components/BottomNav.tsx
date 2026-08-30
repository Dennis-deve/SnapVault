import { Home, Search, Settings, Plus } from "lucide-react";
import { useLocation } from "wouter";

interface BottomNavProps {
  currentPath: string;
  /** Called when the center upload action is tapped. If omitted (pages with
   *  no natural upload target, e.g. Search/Settings), tapping it navigates
   *  to the dashboard first, where upload has a real destination to pick. */
  onUploadClick?: () => void;
}

const SIDE_TABS = [
  { icon: Home, label: "Home", path: "/dashboard" },
  { icon: Search, label: "Search", path: "/search" },
];

const RIGHT_TAB = { icon: Settings, label: "Settings", path: "/settings" };

// Standard mobile-app bottom bar pattern (Instagram/TikTok/Google Photos):
// primary destinations on the sides, a single elevated action in the
// center. Previously this bar had a "Home" and an "Albums" tab that both
// pointed at the exact same /dashboard route — a confusing duplicate — and
// upload lived in a separate floating button that could end up overlapping
// this bar or sitting in an inconsistent spot depending on screen size.
// Giving upload a fixed, permanent, safe-area-aware slot in the primary
// nav fixes both problems at once.
export function BottomNav({ currentPath, onUploadClick }: BottomNavProps) {
  const [, setLocation] = useLocation();

  const isActive = (path: string) =>
    path === "/dashboard" ? currentPath === "/dashboard" || currentPath.startsWith("/album") : currentPath.startsWith(path);

  const handleUpload = () => {
    if (onUploadClick) {
      onUploadClick();
    } else {
      setLocation("/dashboard");
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-t shadow-[0_-2px_16px_0_rgba(16,24,40,0.08)] lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="grid grid-cols-4 items-end h-16 max-w-md mx-auto relative">
        {SIDE_TABS.map((tab) => {
          const active = isActive(tab.path);
          return (
            <button
              key={tab.label}
              onClick={() => setLocation(tab.path)}
              className="flex flex-col items-center justify-center gap-1 h-full"
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
              <span className={`text-[11px] leading-none ${active ? "text-primary font-semibold" : "text-muted-foreground font-normal"}`}>
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* Elevated center upload action — always in the same, reachable
            spot, protrudes above the bar so it reads as the primary action
            rather than a fifth peer tab. */}
        <div className="flex items-center justify-center h-full">
          <button
            onClick={handleUpload}
            className="absolute -top-5 left-1/2 -translate-x-1/2 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform border-4 border-background"
            aria-label="Upload media"
            data-testid="bottomnav-upload"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </button>
        </div>

        <button
          onClick={() => setLocation(RIGHT_TAB.path)}
          className="flex flex-col items-center justify-center gap-1 h-full"
          aria-label={RIGHT_TAB.label}
          aria-current={isActive(RIGHT_TAB.path) ? "page" : undefined}
          data-testid={`bottomnav-${RIGHT_TAB.label.toLowerCase()}`}
        >
          <span
            className={`flex items-center justify-center h-[26px] w-9 rounded-lg transition-colors ${
              isActive(RIGHT_TAB.path) ? "bg-primary/12" : "bg-transparent"
            }`}
          >
            <RIGHT_TAB.icon
              className={`h-[18px] w-[18px] ${isActive(RIGHT_TAB.path) ? "text-primary" : "text-muted-foreground"}`}
              strokeWidth={isActive(RIGHT_TAB.path) ? 2.4 : 2}
            />
          </span>
          <span className={`text-[11px] leading-none ${isActive(RIGHT_TAB.path) ? "text-primary font-semibold" : "text-muted-foreground font-normal"}`}>
            {RIGHT_TAB.label}
          </span>
        </button>
      </div>
    </nav>
  );
}
