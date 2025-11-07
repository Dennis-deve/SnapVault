import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that at least one credential is provided
    if (!password && !pin) {
      toast({
        title: "Error",
        description: "Please provide either a password or Magic PIN",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // If both password and PIN are provided, prioritize password
      // If only PIN is provided (and password is empty), try PIN login
      await login(email, password || pin);
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
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 rounded-2xl animate-fade-in-up">
          <div className="flex items-center justify-center gap-2 mb-8 animate-fade-in animation-delay-200">
            <img src={logoImage} alt="SnapVault" className="h-10 w-10" />
            <h1 className="text-2xl font-display font-bold text-primary">SnapVault</h1>
          </div>

          <h2 className="text-3xl font-display font-semibold text-center mb-2 animate-fade-in animation-delay-400">Welcome back</h2>
          <p className="text-muted-foreground text-center mb-8 animate-fade-in animation-delay-400">
            Log in to access your media
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
            <Label htmlFor="password">Password (or use PIN below)</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-2xl"
              data-testid="input-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pin">Magic PIN (Quick Login)</Label>
            <Input
              id="pin"
              type="text"
              placeholder="1234"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="rounded-2xl"
              data-testid="input-pin"
              maxLength={4}
            />
            <p className="text-xs text-muted-foreground">
              Enter either your password or PIN to log in
            </p>
          </div>

          <Button
            type="submit"
            className="w-full rounded-2xl"
            size="lg"
            disabled={isLoading}
            data-testid="button-login-submit"
          >
            {isLoading ? "Logging in..." : "Log In"}
          </Button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <button
            onClick={() => console.log("Forgot password")}
            className="text-sm text-primary hover:underline"
            data-testid="button-forgot-password"
          >
            Forgot password?
          </button>
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <button
              onClick={() => setLocation("/signup")}
              className="text-primary hover:underline font-medium"
              data-testid="button-signup-link"
            >
              Sign up
            </button>
          </p>
        </div>
      </Card>
      </div>
      
      <Footer className="animate-fade-in animation-delay-800" />
    </div>
  );
}
