import { Button } from "@/components/ui/button";
import { VideoBackground } from "@/components/VideoBackground";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { Play, Cloud, Lock, Zap } from "lucide-react";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";
import video1 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080.mp4";
import video2 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080 (1).mp4";
import video3 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080 (2).mp4";
import video4 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080 (3).mp4";

export default function Onboarding() {
  const [, setLocation] = useLocation();

  const videos = [video1, video2, video3, video4];

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Cinematic Video Background */}
      <VideoBackground videos={videos} overlayOpacity={0.65} />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl w-full space-y-6 lg:space-y-8">
          {/* Logo & Brand */}
          <div className="flex items-center justify-center gap-3 animate-fade-in">
            <img 
              src={logoImage} 
              alt="SnapVault" 
              className="h-12 w-12 sm:h-16 sm:w-16 drop-shadow-2xl" 
            />
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-white drop-shadow-2xl">
              SnapVault
            </h1>
          </div>

          {/* Main Heading */}
          <div className="space-y-4 sm:space-y-6 text-center animate-fade-in-up animation-delay-400">
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight text-white drop-shadow-2xl">
              Your Memories,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                Secured in the Cloud
              </span>
            </h2>
            <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-200 max-w-2xl mx-auto drop-shadow-lg">
              Free up your phone storage. Save photos and videos securely. 
              Access them anywhere, anytime.
            </p>
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 animate-fade-in-up animation-delay-600">
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
              <Cloud className="h-4 w-4 text-blue-300" />
              <span className="text-white text-sm font-medium">Cloud Storage</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
              <Lock className="h-4 w-4 text-purple-300" />
              <span className="text-white text-sm font-medium">Secure & Private</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/20">
              <Zap className="h-4 w-4 text-yellow-300" />
              <span className="text-white text-sm font-medium">Fast Upload</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4 animate-fade-in-up animation-delay-800">
            <Button
              size="lg"
              className="rounded-full px-8 py-6 w-full sm:w-auto text-base sm:text-lg font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-105"
              onClick={() => setLocation("/signup")}
              data-testid="button-get-started"
            >
              <Play className="h-5 w-5 mr-2" />
              Get Started Free
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full px-8 py-6 w-full sm:w-auto text-base sm:text-lg font-semibold bg-white/10 backdrop-blur-md border-2 border-white/30 text-white hover:bg-white/20 hover:border-white/50 shadow-xl transition-all duration-300 hover:scale-105"
              onClick={() => setLocation("/login")}
              data-testid="button-login"
            >
              Sign In
            </Button>
          </div>

          {/* Footer */}
          <Footer className="animate-fade-in animation-delay-1000 text-white/70" />
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
    </div>
  );
}
