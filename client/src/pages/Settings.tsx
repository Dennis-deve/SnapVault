import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/ThemeProvider";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  const [email, setEmail] = useState("user@example.com");
  const [pin, setPin] = useState("");
  const [publicSharing, setPublicSharing] = useState(false);

  const handleSave = () => {
    toast({
      title: "Settings saved",
      description: "Your changes have been saved successfully.",
    });
  };

  const handleLogout = () => {
    toast({
      title: "Logged out",
      description: "You have been logged out successfully.",
    });
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        showMenu={false}
        user={{ email }}
        onSettingsClick={() => {}}
        onLogout={handleLogout}
      />

      <div className="sticky top-16 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-display font-semibold">Settings</h1>
        </div>
      </div>

      <main className="container max-w-3xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Account</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-email">Email</Label>
                <Input
                  id="settings-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-2xl"
                  data-testid="input-settings-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-password">Change Password</Label>
                <Input
                  id="settings-password"
                  type="password"
                  placeholder="New password"
                  className="rounded-2xl"
                  data-testid="input-settings-password"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Magic PIN</h2>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-pin">4-Digit PIN</Label>
                <Input
                  id="settings-pin"
                  type="text"
                  placeholder="1234"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={4}
                  className="rounded-2xl"
                  data-testid="input-settings-pin"
                />
                <p className="text-xs text-muted-foreground">
                  Quick login with just a 4-digit PIN
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Privacy</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Public Sharing</p>
                <p className="text-sm text-muted-foreground">
                  Allow others to view your shared albums
                </p>
              </div>
              <Switch
                checked={publicSharing}
                onCheckedChange={setPublicSharing}
                data-testid="switch-public-sharing"
              />
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Appearance</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Dark Mode</p>
                <p className="text-sm text-muted-foreground">
                  Switch between light and dark themes
                </p>
              </div>
              <Switch
                checked={theme === "dark"}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                data-testid="switch-dark-mode"
              />
            </div>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              className="rounded-2xl flex-1"
              data-testid="button-save-settings"
            >
              Save Changes
            </Button>
          </div>

          <Separator />

          <div className="pt-4">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="text-destructive hover:text-destructive w-full"
              data-testid="button-logout-settings"
            >
              Log Out
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
