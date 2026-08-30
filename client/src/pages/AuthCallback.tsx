import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setError("This sign-in link is missing its token. Please try again.");
      return;
    }

    localStorage.setItem("auth_token", token);

    // A full navigation (not client-side routing) so AuthProvider mounts
    // fresh and reads the token that was just stored — client-side routing
    // alone wouldn't retrigger its auth check.
    window.location.href = "/dashboard";
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-4">
      <img src={logoImage} alt="SnapVault" className="h-10 w-10" />
      {error ? (
        <>
          <XCircle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground max-w-sm">{error}</p>
          <Button onClick={() => setLocation("/login")} className="rounded-2xl">
            Back to Login
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Signing you in…</p>
        </>
      )}
    </div>
  );
}
