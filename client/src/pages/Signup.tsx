import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { SEO } from "@/components/SEO";
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
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex flex-col">
      <SEO 
        title="Create Account" 
        description="Create your personal secure cloud storage vault to begin saving your memories." 
      />
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 rounded-2xl animate-fade-in-up">
          <div className="flex items-center justify-center gap-2 mb-8 animate-fade-in animation-delay-200">
            <img src={logoImage} alt="SnapVault" className="h-10 w-10" />
            <h1 className="text-2xl font-display font-bold text-primary">SnapVault</h1>
          </div>

          <h2 className="text-3xl font-display font-semibold text-center mb-2 animate-fade-in animation-delay-400">Create account</h2>
          <p className="text-muted-foreground text-center mb-8 animate-fade-in animation-delay-400">
            Get started with SnapVault today
          </p>

          <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in animation-delay-600">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-2xl"
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
              className="rounded-2xl"
              data-testid="input-password"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-2xl"
              data-testid="input-confirm-password"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">Magic PIN (Optional)</Label>
            <Input
              id="pin"
              type="number"
              inputMode="numeric"
              placeholder="1234"
              value={pin}
              onChange={(e) => setPin(e.target.value.slice(0, 4))}
              className="rounded-2xl"
              data-testid="input-pin"
              maxLength={4}
            />
            <p className="text-xs text-muted-foreground">
              Set a secure 4-digit PIN to lock/unlock albums. Can be updated in Settings.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full rounded-2xl"
            size="lg"
            disabled={isLoading}
            data-testid="button-signup-submit"
          >
            {isLoading ? "Creating account..." : "Sign Up"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <button
            onClick={() => setLocation("/login")}
            className="text-primary hover:underline font-medium"
            data-testid="button-login-link"
          >
            Log in
          </button>
        </p>
      </Card>
      </div>
      
      <Footer className="animate-fade-in animation-delay-800" />
    </div>
  );
}
