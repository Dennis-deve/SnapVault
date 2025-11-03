import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Cloud } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords don't match",
        variant: "destructive",
      });
      return;
    }
    console.log("Signup attempt:", { email, password, pin });
    toast({
      title: "Account created!",
      description: "Welcome to SnapVault",
    });
    setLocation("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 rounded-2xl">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Cloud className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-display font-bold">SnapVault</h1>
        </div>

        <h2 className="text-3xl font-display font-semibold text-center mb-2">Create account</h2>
        <p className="text-muted-foreground text-center mb-8">
          Get started with SnapVault today
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
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
              type="text"
              placeholder="1234"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="rounded-2xl"
              data-testid="input-pin"
              maxLength={4}
            />
            <p className="text-xs text-muted-foreground">
              Quick login with just a 4-digit PIN
            </p>
          </div>

          <Button
            type="submit"
            className="w-full rounded-2xl"
            size="lg"
            data-testid="button-signup-submit"
          >
            Sign Up
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
  );
}
