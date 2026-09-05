import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";
import { Eye, EyeOff, CheckCircle2, Clock, LinkIcon, AlertTriangle } from "lucide-react";

type LinkState = "checking" | "valid" | "expired" | "invalid" | "missing";

/**
 * Password reset via emailed link.
 *
 * The link is checked up front (GET /api/auth/reset-password/validate) so
 * the page can tell the difference between an expired link, an
 * already-used/invalid link, and a missing token — instead of letting the
 * user type a new password and only then failing. Expired/invalid states
 * link straight back to "request a new link".
 */
export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (!tokenParam) {
      setLinkState("missing");
      return;
    }
    setToken(tokenParam);

    let cancelled = false;
    (async () => {
      try {
        const result = await apiRequest(
          `/api/auth/reset-password/validate?token=${encodeURIComponent(tokenParam)}`
        );
        if (cancelled) return;
        if (result?.valid) {
          setLinkState("valid");
        } else {
          setLinkState(result?.reason === "expired" ? "expired" : "invalid");
        }
      } catch {
        // Network/API failure: don't strand the user on a wrong conclusion —
        // let them try to submit; the server re-checks the token anyway.
        if (!cancelled) setLinkState("valid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const data = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });

      setIsSuccess(true);
      toast({
        title: "Success!",
        description: data.message,
      });

      setTimeout(() => setLocation("/login"), 3000);
    } catch (error: any) {
      const message = error?.message || "Failed to reset password";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
      // The server may have consumed/rejected the link during submit.
      if (/expired/i.test(message)) setLinkState("expired");
      else if (/invalid|already been used/i.test(message)) setLinkState("invalid");
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-8 rounded-2xl animate-fade-in-up">
            <div className="flex items-center justify-center gap-2 mb-8 animate-fade-in animation-delay-200">
              <img src={logoImage} alt="SnapVault" className="h-10 w-10" />
              <h1 className="text-2xl font-display font-bold text-primary">SnapVault</h1>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>

              <h2 className="text-2xl font-display font-semibold">Password reset!</h2>
              <p className="text-muted-foreground">
                Your password has been reset and previous logins were signed out. Log in with your new password.
              </p>

              <div className="pt-4">
                <Button
                  onClick={() => setLocation("/login")}
                  className="w-full rounded-2xl"
                  size="lg"
                >
                  Go to login
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Footer className="animate-fade-in animation-delay-800" />
      </div>
    );
  }

  // Link states that make the form unusable — offer a new link instead.
  if (linkState === "missing" || linkState === "expired" || linkState === "invalid") {
    const copy = {
      missing: {
        icon: <LinkIcon className="w-8 h-8 text-muted-foreground" />,
        title: "Link missing",
        body: "This page needs the reset link from your email. Open the link exactly as it appears in the message.",
      },
      expired: {
        icon: <Clock className="w-8 h-8 text-amber-500" />,
        title: "This link expired",
        body: "Password reset links expire after 1 hour for security. Request a new one — it only takes a moment.",
      },
      invalid: {
        icon: <AlertTriangle className="w-8 h-8 text-red-500" />,
        title: "This link isn't valid",
        body: "It was already used, or a newer reset link was requested since it was sent. Request a fresh link to continue.",
      },
    }[linkState];

    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-8 rounded-2xl animate-fade-in-up" data-testid={`reset-link-${linkState}`}>
            <div className="flex items-center justify-center gap-2 mb-8">
              <img src={logoImage} alt="SnapVault" className="h-10 w-10" />
              <h1 className="text-2xl font-display font-bold text-primary">SnapVault</h1>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                {copy.icon}
              </div>
              <h2 className="text-2xl font-display font-semibold">{copy.title}</h2>
              <p className="text-muted-foreground">{copy.body}</p>

              <div className="pt-4 space-y-3">
                <Button
                  onClick={() => setLocation("/forgot-password")}
                  className="w-full rounded-2xl"
                  size="lg"
                  data-testid="reset-request-new-link"
                >
                  Request a new link
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLocation("/login")}
                  className="w-full rounded-2xl"
                >
                  Back to login
                </Button>
              </div>
            </div>
          </Card>
        </div>
        <Footer className="animate-fade-in animation-delay-800" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 rounded-2xl animate-fade-in-up">
          <div className="flex items-center justify-center gap-2 mb-8 animate-fade-in animation-delay-200">
            <img src={logoImage} alt="SnapVault" className="h-10 w-10" />
            <h1 className="text-2xl font-display font-bold text-primary">SnapVault</h1>
          </div>

          <h2 className="text-3xl font-display font-semibold mb-2 animate-fade-in animation-delay-400">
            Create new password
          </h2>
          <p className="text-muted-foreground mb-8 animate-fade-in animation-delay-400">
            Enter your new password below. Make it strong!
          </p>

          {linkState === "checking" && (
            <p className="text-sm text-muted-foreground mb-4" data-testid="reset-checking-link">
              Checking your reset link…
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in animation-delay-600">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded-2xl pr-10"
                  required
                  minLength={8}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters long
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="rounded-2xl pr-10"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                <p className="text-xs text-red-500" data-testid="reset-password-mismatch">
                  Passwords don't match yet
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full rounded-2xl"
              size="lg"
              disabled={isLoading || !token}
            >
              {isLoading ? "Resetting..." : "Reset password"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setLocation("/login")}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Back to login
            </button>
          </div>
        </Card>
      </div>

      <Footer className="animate-fade-in animation-delay-800" />
    </div>
  );
}
