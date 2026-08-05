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
import { Eye, EyeOff, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    // Extract token from URL query params
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    } else {
      toast({
        title: "Invalid link",
        description: "This password reset link is invalid",
        variant: "destructive",
      });
      setTimeout(() => setLocation("/forgot-password"), 2000);
    }
  }, [location]);

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

      // Redirect to login after 3 seconds
      setTimeout(() => setLocation("/login"), 3000);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
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
                Your password has been successfully reset. You can now log in with your new password.
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
