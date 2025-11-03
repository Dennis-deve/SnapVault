import { Button } from "@/components/ui/button";
import { Cloud } from "lucide-react";
import { useLocation } from "wouter";
import heroImage from "@assets/generated_images/Phone_cloud_sync_hero_c881eaf2.png";

export default function Onboarding() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/5 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Cloud className="h-10 w-10 text-primary" />
          <h1 className="text-3xl font-display font-bold">SnapVault</h1>
        </div>

        <div className="max-w-md mx-auto">
          <img
            src={heroImage}
            alt="Cloud storage illustration"
            className="w-full h-auto"
          />
        </div>

        <div className="space-y-4">
          <h2 className="text-4xl md:text-5xl font-display font-bold leading-tight">
            Free up your iPhone storage
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto">
            Save your photos and videos in the cloud. Access them anywhere, anytime.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          <Button
            size="lg"
            className="rounded-2xl px-8 w-full sm:w-auto"
            onClick={() => setLocation("/signup")}
            data-testid="button-get-started"
          >
            Get Started
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="rounded-2xl px-8 w-full sm:w-auto"
            onClick={() => setLocation("/login")}
            data-testid="button-login"
          >
            Already have an account? Log in
          </Button>
        </div>
      </div>
    </div>
  );
}
