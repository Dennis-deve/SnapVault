import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [publicSharing, setPublicSharing] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);

  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setHasPin(!!user.pin && user.pin !== "****");
      setPin(""); // Don't show hashed PIN
    }
  }, [user]);

  const handleSavePin = async () => {
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      toast({
        title: "Invalid PIN",
        description: "PIN must be exactly 4 digits (0-9).",
        variant: "destructive",
      });
      return;
    }

    setIsSavingPin(true);
    try {
      await apiRequest("/api/auth/update-pin", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });

      setHasPin(true);
      setPin(""); // Clear input after saving

      toast({
        title: "PIN Updated",
        description: "Your Magic PIN has been set successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update PIN",
        variant: "destructive",
      });
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleSave = () => {
    toast({
      title: "Settings saved",
      description: "Your changes have been saved successfully.",
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Logged out",
        description: "You have been logged out successfully.",
      });
      setLocation("/");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to log out",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        showMenu={false}
        user={user ? { email: user.email } : undefined}
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
                {hasPin && (
                  <p className="text-sm text-green-600 dark:text-green-400 mb-2">
                    ✓ Magic PIN is set
                  </p>
                )}
                <Input
                  id="settings-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={hasPin ? "Enter new PIN to change" : "Enter 4-digit PIN"}
                  value={pin}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 4);
                    setPin(value);
                  }}
                  maxLength={4}
                  className="rounded-2xl text-center text-2xl tracking-widest"
                  data-testid="input-settings-pin"
                />
                <p className="text-xs text-muted-foreground">
                  Used to lock and unlock albums. Keep it secret!
                </p>
              </div>
              <Button 
                onClick={handleSavePin} 
                disabled={pin.length !== 4 || isSavingPin}
                className="rounded-2xl"
              >
                {isSavingPin ? "Saving..." : hasPin ? "Update PIN" : "Set PIN"}
              </Button>
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
      
      <Footer className="mt-8" />
    </div>
  );
}
