import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./ThemeToggle";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";

interface NavbarProps {
  onMenuClick?: () => void;
  showMenu?: boolean;
  user?: {
    email: string;
    avatar?: string;
  };
  onSettingsClick?: () => void;
  onLogout?: () => void;
  onHomeClick?: () => void;
  onSearchClick?: () => void;
}

export function Navbar({ onMenuClick, showMenu, user, onSettingsClick, onLogout, onHomeClick, onSearchClick }: NavbarProps) {
  return (
    <header
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-16 items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-4">
          {showMenu && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onMenuClick}
              data-testid="button-menu"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div className="inline-flex items-center cursor-pointer pl-3 pr-2" onClick={onHomeClick}>
            <img src={logoImage} alt="SnapVault" className="h-6 w-6 mr-2" />
            <h1 className="text-xl font-display font-bold text-primary">SnapVault</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* Settings/Logout are already reachable on mobile via the
              bottom nav's Settings tab (and Log Out lives on that page
              itself), so this dropdown would just be a duplicate control
              floating at the top. Keep it for desktop, which has no
              bottom nav. */}
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full hidden lg:inline-flex" data-testid="button-user-menu" aria-label="Account menu">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.avatar} alt={user.email} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {user.email.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSettingsClick} data-testid="button-settings">
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-destructive" data-testid="button-logout">
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  );
}
