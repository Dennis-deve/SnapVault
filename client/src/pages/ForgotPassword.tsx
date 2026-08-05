import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";
import { ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: "Error",
        description: "Please enter your email address",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      const data = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      setIsSubmitted(true);
      toast({
        title: "Check your email",
        description: data.message,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send reset email",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md p-8 rounded-2xl animate-fade-in-up">
            <div className="flex items-center justify-center gap-2 mb-8 animate-fade-in animation-delay-200">
              <img src={logoImage} alt="SnapVault" className="h-10 w-10" />
              <h1 className="text-2xl font-display font-bold text-primary">SnapVault</h1>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <svg
                  className="w-8 h-8 text-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>

              <h2 className="text-2xl font-display font-semibold">Check your email</h2>
              <p className="text-muted-foreground">
                If an account exists with <strong>{email}</strong>, you will receive a password reset link shortly.
              </p>

              <div className="pt-4 space-y-2">
                <Button
                  onClick={() => setLocation("/login")}
                  className="w-full rounded-2xl"
                  variant="outline"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to login
                </Button>
                
                <button
                  onClick={() => {
                    setIsSubmitted(false);
                    setEmail("");
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  Try different email
                </button>
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

          <button
            onClick={() => setLocation("/login")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </button>

          <h2 className="text-3xl font-display font-semibold mb-2 animate-fade-in animation-delay-400">
            Reset your password
          </h2>
          <p className="text-muted-foreground mb-8 animate-fade-in animation-delay-400">
            Enter your email address and we'll send you a link to reset your password.
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
                required
                autoFocus
              />
            </div>

            <Button
              type="submit"
              className="w-full rounded-2xl"
              size="lg"
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        </Card>
      </div>
      
      <Footer className="animate-fade-in animation-delay-800" />
    </div>
  );
}
