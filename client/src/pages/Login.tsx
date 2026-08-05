import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Footer } from "@/components/Footer";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Google's OAuth callback redirects here with ?error=... on failure (see
  // server/routes.ts's failureRedirect) since that leg of the flow is a
  // full-page browser redirect, not a fetch call we can catch normally.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "google_auth_failed") {
      toast({
        title: "Google sign-in failed",
        description: "Please try again, or sign in with your email and password.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(email, password);
      toast({
        title: "Success!",
        description: "Welcome back to SnapVault",
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-[28px] overflow-hidden shadow-xl bg-card animate-fade-in-up">
          {/* Gradient hero header, matching the Figma prototype */}
          <div className="gradient-hero relative px-8 pt-10 pb-14 text-center overflow-hidden">
            <div className="absolute -bottom-10 -left-16 h-40 w-[130%] rounded-[50%] bg-white/10" />
            <div className="relative flex items-center justify-center gap-2 mb-4">
              <img src={logoImage} alt="SnapVault" className="h-9 w-9" />
              <span className="text-lg font-display font-bold text-white">SnapVault</span>
            </div>
            <h2 className="relative text-2xl font-display font-bold text-white">Welcome Back</h2>
            <p className="relative text-sm text-white/85 mt-1">Sign in to access your memories</p>
          </div>

          <div className="px-6 sm:px-8 pt-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-2xl h-12"
                  data-testid="input-email"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setLocation("/forgot-password")}
                    className="text-xs font-medium text-primary hover:underline"
                    data-testid="button-forgot-password"
                  >
                    Forgot Password?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-2xl h-12"
                  data-testid="input-password"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-2xl h-12 text-base font-semibold"
                disabled={isLoading}
                data-testid="button-login-submit"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="flex items-center gap-3 my-6">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <GoogleAuthButton />

            <p className="mt-6 text-sm text-center text-muted-foreground">
              Don't have an account?{" "}
              <button
                onClick={() => setLocation("/signup")}
                className="text-primary hover:underline font-medium"
                data-testid="button-signup-link"
              >
                Sign Up
              </button>
            </p>
          </div>
        </div>
      </div>

      <Footer className="animate-fade-in animation-delay-800" />
    </div>
  );
}
