import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Status = "verifying" | "success" | "error";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState("");
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("This link is missing its verification token.");
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Failed to verify email");
        }

        setStatus("success");
        setNewEmail(data.email || "");
        setMessage(data.message || "Email address updated successfully.");
      } catch (error: any) {
        setStatus("error");
        setMessage(error.message || "This verification link is invalid or has expired.");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md rounded-[28px] overflow-hidden shadow-xl bg-card animate-fade-in-up">
          <div className="gradient-hero relative px-8 pt-10 pb-12 text-center overflow-hidden">
            <div className="absolute -bottom-10 -left-16 h-40 w-[130%] rounded-[50%] bg-white/10" />
            <div className="relative flex items-center justify-center gap-2 mb-4">
              <img src={logoImage} alt="SnapVault" className="h-9 w-9" />
              <span className="text-lg font-display font-bold text-white">SnapVault</span>
            </div>
            <h2 className="relative text-2xl font-display font-bold text-white">Email Verification</h2>
          </div>

          <div className="px-6 sm:px-8 pt-8 pb-8 text-center space-y-4">
            {status === "verifying" && (
              <>
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <h2 className="text-2xl font-display font-semibold">Confirming your email…</h2>
              </>
            )}

            {status === "success" && (
              <>
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-2xl font-display font-semibold">Email confirmed!</h2>
                <p className="text-muted-foreground">
                  {newEmail
                    ? `Your account email has been updated to ${newEmail}.`
                    : message}
                </p>
                <div className="pt-4">
                  <Button onClick={() => setLocation("/dashboard")} className="w-full rounded-2xl h-12">
                    Go to Dashboard
                  </Button>
                </div>
              </>
            )}

            {status === "error" && (
              <>
                <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                  <XCircle className="w-8 h-8 text-destructive" />
                </div>
                <h2 className="text-2xl font-display font-semibold">Verification failed</h2>
                <p className="text-muted-foreground">{message}</p>
                <div className="pt-4">
                  <Button onClick={() => setLocation("/settings")} className="w-full rounded-2xl h-12">
                    Back to Settings
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
