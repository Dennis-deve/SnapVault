import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Footer } from "@/components/Footer";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 8) {
      toast({
        title: "Error",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords don't match",
        variant: "destructive",
      });
      return;
    }
    
    // Validate PIN if provided
    if (pin && (pin.length !== 4 || !/^\d+$/.test(pin))) {
      toast({
        title: "Error",
        description: "PIN must be exactly 4 digits",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      await signup(email, password, pin || undefined);
      toast({
        title: "Account created!",
        description: pin ? "Welcome to SnapVault! Your Magic PIN is set." : "Welcome to SnapVault",
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-[28px] overflow-hidden shadow-xl bg-card animate-fade-in-up my-8">
          {/* Gradient hero header, matching the Figma prototype */}
          <div className="gradient-hero relative px-8 pt-10 pb-12 text-center overflow-hidden">
            <div className="absolute -bottom-10 -left-16 h-40 w-[130%] rounded-[50%] bg-white/10" />
            <div className="relative flex items-center justify-center gap-2 mb-4">
              <img src={logoImage} alt="SnapVault" className="h-9 w-9" />
              <span className="text-lg font-display font-bold text-white">SnapVault</span>
            </div>
            <h2 className="relative text-2xl font-display font-bold text-white">Create Account</h2>
            <p className="relative text-sm text-white/85 mt-1">Start backing up today</p>
          </div>

          <div className="px-6 sm:px-8 pt-8 pb-8">
          <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-2xl h-12"
              data-testid="input-email"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-2xl h-12"
              data-testid="input-password"
              minLength={8}
              aria-describedby="password-hint"
              required
            />
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least 8 characters.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-2xl h-12"
              data-testid="input-confirm-password"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">Magic PIN (Optional)</Label>
            <Input
              id="pin"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="1234"
              value={pin}
              // NOTE: type="number" was previously used here, which silently
              // strips a leading zero as the user types (e.g. "0192" becomes
              // "192"), so a PIN starting with 0 wouldn't match what the user
              // thinks they set. Filtering a text input to digits-only, as
              // PinDialog already does, avoids that bug.
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="rounded-2xl h-12"
              data-testid="input-pin"
              maxLength={4}
              aria-describedby="pin-hint"
            />
            <p id="pin-hint" className="text-xs text-muted-foreground">
              Set a secure 4-digit PIN to lock/unlock albums. Can be updated in Settings.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full rounded-2xl h-12 text-base font-semibold"
            disabled={isLoading}
            data-testid="button-signup-submit"
          >
            {isLoading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">OR</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <GoogleAuthButton label="Sign up with Google" />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button
            onClick={() => setLocation("/login")}
            className="text-primary hover:underline font-medium"
            data-testid="button-login-link"
          >
            Sign In
          </button>
        </p>
        </div>
      </div>
      </div>
      
      <Footer className="animate-fade-in animation-delay-800" />
    </div>
  );
}
