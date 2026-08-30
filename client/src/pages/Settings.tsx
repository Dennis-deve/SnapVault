import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const { data: storageUsage } = useQuery<{ usedGB: number; totalGB: number }>({
    queryKey: ["/api/storage/usage"],
    enabled: !!user,
  });

  const [email, setEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isSendingEmailVerification, setIsSendingEmailVerification] = useState(false);
  const [pin, setPin] = useState("");
  const [publicSharing, setPublicSharing] = useState(false);
  const [isSavingSharingPref, setIsSavingSharingPref] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setEmail(user.email);
      setHasPin(!!user.pin && user.pin !== "****");
      setPin(""); // Don't show hashed PIN
      setPublicSharing(!!user.publicSharingEnabled);
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

  const handleSavePassword = async () => {
    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "New password must be at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (user?.hasPassword && !currentPassword) {
      toast({
        title: "Current password required",
        description: "Enter your current password to change it.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingPassword(true);
    try {
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      setCurrentPassword("");
      setNewPassword("");

      toast({
        title: user?.hasPassword ? "Password updated" : "Password set",
        description: user?.hasPassword
          ? "Your password has been changed successfully."
          : "You can now sign in with your email and password, in addition to Google.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update password",
        variant: "destructive",
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSendEmailVerification = async () => {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast({
        title: "Invalid email",
        description: "Enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSendingEmailVerification(true);
    try {
      const data = await apiRequest("/api/auth/change-email", {
        method: "POST",
        body: JSON.stringify({ newEmail }),
      });

      toast({
        title: "Check your inbox",
        description: data.message || `Verification email sent to ${newEmail}.`,
      });
      setNewEmail("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send verification email",
        variant: "destructive",
      });
    } finally {
      setIsSendingEmailVerification(false);
    }
  };

  const handleTogglePublicSharing = async (checked: boolean) => {
    const previous = publicSharing;
    setPublicSharing(checked); // optimistic
    setIsSavingSharingPref(true);
    try {
      await apiRequest("/api/auth/sharing-preference", {
        method: "POST",
        body: JSON.stringify({ enabled: checked }),
      });
      toast({
        title: checked ? "Public sharing enabled" : "Public sharing disabled",
        description: checked
          ? "You can now generate share links from an album's menu."
          : "All of your album share links are now inactive.",
      });
    } catch (error: any) {
      setPublicSharing(previous); // rollback
      toast({
        title: "Error",
        description: error.message || "Failed to update sharing preference",
        variant: "destructive",
      });
    } finally {
      setIsSavingSharingPref(false);
    }
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

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await apiRequest("/api/auth/account", {
        method: "DELETE",
      });

      toast({
        title: "Account Deleted",
        description: "Your account and all data have been permanently deleted.",
      });

      setLocation("/");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete account",
        variant: "destructive",
      });
    } finally {
      setIsDeletingAccount(false);
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

      {/* Gradient profile header, matching the Figma Settings screen */}
      <div className="gradient-hero relative pt-6 pb-14 overflow-hidden">
        <div className="absolute -bottom-10 -left-16 h-40 w-[130%] rounded-[50%] bg-white/10" />
        <div className="relative container max-w-3xl mx-auto px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard")}
            data-testid="button-back"
            aria-label="Back to dashboard"
            className="text-white hover:bg-white/15 hover:text-white -ml-2 mb-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex flex-col items-center text-center gap-3 pb-2">
            <div className="h-20 w-20 rounded-full bg-white/25 flex items-center justify-center">
              <div className="h-14 w-14 rounded-full bg-white flex items-center justify-center">
                <span className="text-primary text-2xl font-bold">
                  {user?.email?.charAt(0).toUpperCase() || "?"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-white font-bold text-base">
                {user?.email?.split("@")[0] || "Your Account"}
              </p>
              <p className="text-white/80 text-sm">{user?.email}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container max-w-3xl mx-auto px-4 -mt-10 relative z-10">
        {storageUsage && (
          <div className="bg-card rounded-2xl shadow-md p-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-semibold">Storage Usage</p>
              <p className="text-xs text-muted-foreground">
                {storageUsage.usedGB.toFixed(1)} GB of {storageUsage.totalGB.toFixed(0)} GB
              </p>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(100, (storageUsage.usedGB / storageUsage.totalGB) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <main className="container max-w-3xl mx-auto p-4 md:p-6 lg:p-8 pb-32 lg:pb-8 pt-6">
        <div className="space-y-6">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase px-1 mb-2">
              Account
            </p>
          <Card className="p-5 rounded-[14px] shadow-md border-none">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-email">Current Email</Label>
                <Input
                  id="settings-email"
                  type="email"
                  value={email}
                  disabled
                  className="rounded-2xl bg-muted"
                  data-testid="input-settings-email"
                />
              </div>
              {user?.googleLinked && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Linked to Google Sign-In
                </p>
              )}
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="settings-new-email">Change Email</Label>
                <Input
                  id="settings-new-email"
                  type="email"
                  placeholder="new@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="rounded-2xl"
                  data-testid="input-new-email"
                />
                <p className="text-xs text-muted-foreground">
                  We'll email a confirmation link to the new address — your
                  account email won't change until you click it.
                </p>
              </div>
              <Button
                onClick={handleSendEmailVerification}
                disabled={!newEmail || isSendingEmailVerification}
                variant="outline"
                className="rounded-2xl"
                data-testid="button-send-email-verification"
              >
                {isSendingEmailVerification ? "Sending..." : "Send Verification Email"}
              </Button>
            </div>
          </Card>
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase px-1 mb-2">
              Security &amp; PIN
            </p>
          <Card className="p-5 rounded-[14px] shadow-md border-none space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Password</h3>
              <div className="space-y-4">
              {user?.hasPassword ? (
                <div className="space-y-2">
                  <Label htmlFor="settings-current-password">Current Password</Label>
                  <Input
                    id="settings-current-password"
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="rounded-2xl"
                    data-testid="input-current-password"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your account currently signs in with Google only. Set a
                  password below to also enable email/password sign-in.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="settings-new-password">
                  {user?.hasPassword ? "New Password" : "Password"}
                </Label>
                <Input
                  id="settings-new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded-2xl"
                  data-testid="input-new-password"
                  minLength={8}
                />
              </div>
              <Button
                onClick={handleSavePassword}
                disabled={newPassword.length < 8 || isSavingPassword}
                className="rounded-2xl"
                data-testid="button-save-password"
              >
                {isSavingPassword ? "Saving..." : user?.hasPassword ? "Update Password" : "Set Password"}
              </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground">Magic PIN</h3>
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
            </div>
          </Card>
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase px-1 mb-2">
              Privacy
            </p>
          <Card className="p-5 rounded-[14px] shadow-md border-none">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Public Sharing</p>
                <p className="text-sm text-muted-foreground">
                  Allow others to view your shared albums
                </p>
              </div>
              <Switch
                checked={publicSharing}
                onCheckedChange={handleTogglePublicSharing}
                disabled={isSavingSharingPref}
                data-testid="switch-public-sharing"
              />
            </div>
          </Card>
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase px-1 mb-2">
              Appearance
            </p>
          <Card className="p-5 rounded-[14px] shadow-md border-none">
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
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase px-1 mb-2">
              Danger Zone
            </p>
          <Card className="p-2 rounded-[14px] shadow-md border-none">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="text-destructive hover:text-destructive w-full justify-start"
              data-testid="button-logout-settings"
            >
              Log Out
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start"
                  data-testid="button-delete-account"
                >
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your account,
                    all your albums, and all uploaded media from our servers and Cloudinary.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={isDeletingAccount}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeletingAccount ? "Deleting..." : "Delete Account"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Card>
          </div>
        </div>
      </main>
      
      <Footer className="mt-8" />
      <BottomNav currentPath="/settings" />
    </div>
  );
}
