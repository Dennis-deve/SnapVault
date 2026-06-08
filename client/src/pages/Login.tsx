import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { VideoBackground } from "@/components/VideoBackground";
import { SEO } from "@/components/SEO";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Fingerprint, KeyRound, ShieldCheck } from "lucide-react";

import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";
import video1 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080.mp4";
import video2 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080 (1).mp4";
import video3 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080 (2).mp4";
import video4 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080 (3).mp4";

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"password" | "pin">("password");

  const videos = [video1, video2, video3, video4];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Choose active credentials based on current tab selection
    const credential = activeTab === "password" ? password : pin;
    
    if (!credential) {
      toast({
        title: "Error",
        description: `Please provide your ${activeTab === "password" ? "password" : "Magic PIN"}`,
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      await login(email, credential);
      toast({
        title: "Welcome Back!",
        description: "Secure terminal entry established.",
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Authorization Failed",
        description: error.message || "Invalid credentials. Please attempt again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col justify-between">
      <SEO 
        title="Sign In" 
        description="Authenticate and log in to your secure SnapVault cloud platform." 
      />
      {/* Cinematic Glowing Background Video Cluster */}
      <VideoBackground videos={videos} overlayOpacity={0.7} />

      {/* Main Form Center Layout container */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <Card className="relative bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-8 sm:p-10 shadow-[0_0_50px_-12px_rgba(59,130,246,0.3)] overflow-hidden">
            {/* Ambient neon laser light strip across the card head */}
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/80 to-transparent" />

            {/* Logo branding section */}
            <div className="flex flex-col items-center justify-center text-center mb-8">
              <motion.img 
                src={logoImage} 
                alt="SnapVault" 
                className="h-16 w-16 mb-2 drop-shadow-[0_0_20px_rgba(59,130,246,0.4)] select-none"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <h1 className="text-3xl font-display font-black tracking-tight text-white flex items-center gap-1">
                Snap<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">Vault</span>
              </h1>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1.5 font-medium tracking-wide uppercase">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                Military-Grade Decryption
              </p>
            </div>

            {/* Tactile Mode Switcher Tab Bar */}
            <div className="grid grid-cols-2 p-1 bg-white/5 border border-white/5 rounded-2xl mb-6 relative">
              <button
                type="button"
                onClick={() => setActiveTab("password")}
                className={`relative z-10 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors duration-300 rounded-xl ${
                  activeTab === "password" ? "text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {activeTab === "password" && (
                  <motion.div
                    layoutId="activeAuthTab"
                    className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl z-[-1]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Password
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("pin")}
                className={`relative z-10 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors duration-300 rounded-xl ${
                  activeTab === "pin" ? "text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {activeTab === "pin" && (
                  <motion.div
                    layoutId="activeAuthTab"
                    className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl z-[-1]"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="flex items-center justify-center gap-1.5">
                  <Fingerprint className="w-3.5 h-3.5" />
                  Magic PIN
                </span>
              </button>
            </div>

            {/* Login Inputs form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Email Address Section */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300 font-semibold text-xs tracking-wider uppercase ml-1">
                  Email Address
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-black/20 border-white/10 text-white h-12 pl-11 pr-4 rounded-2xl placeholder:text-gray-500 focus-visible:ring-blue-500/40 focus-visible:ring-2 focus-visible:ring-offset-0 focus:border-blue-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] w-full"
                    data-testid="input-email"
                    required
                  />
                </div>
              </div>

              {/* Secure Sliding Auth Fields */}
              <AnimatePresence mode="wait">
                {activeTab === "password" ? (
                  <motion.div
                    key="password-field"
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 15 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="password" className="text-gray-300 font-semibold text-xs tracking-wider uppercase ml-1">
                      Password
                    </Label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-black/20 border-white/10 text-white h-12 pl-11 pr-4 rounded-2xl placeholder:text-gray-500 focus-visible:ring-blue-500/40 focus-visible:ring-2 focus-visible:ring-offset-0 focus:border-blue-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] w-full"
                        data-testid="input-password"
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="pin-field"
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 15 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2"
                  >
                    <Label htmlFor="pin" className="text-gray-300 font-semibold text-xs tracking-wider uppercase ml-1">
                      Magic PIN
                    </Label>
                    <div className="relative group">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                      <Input
                        id="pin"
                        type="text"
                        placeholder="1234"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        className="bg-black/20 border-white/10 text-white h-12 pl-11 pr-4 rounded-2xl placeholder:text-gray-500 focus-visible:ring-blue-500/40 focus-visible:ring-2 focus-visible:ring-offset-0 focus:border-blue-500/50 transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] w-full"
                        data-testid="input-pin"
                        maxLength={4}
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 ml-1">
                      Enter the 4-digit security PIN configured on your account.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Trigger Submit Action Button */}
              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-semibold rounded-2xl transition-all duration-300 shadow-lg shadow-indigo-600/15 hover:shadow-indigo-600/30 active:scale-[0.98] border border-white/10 select-none cursor-pointer"
                disabled={isLoading}
                data-testid="button-login-submit"
              >
                {isLoading ? "Authenticating..." : "Secure Log In"}
              </Button>
            </form>

            {/* Bottom Links layout */}
            <div className="mt-8 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
              <button
                onClick={() => setLocation("/forgot-password")}
                className="hover:text-white transition-colors duration-200 cursor-pointer"
                data-testid="button-forgot-password"
              >
                Forgot password?
              </button>
              
              <div className="flex items-center gap-1.5">
                <span>New to SnapVault?</span>
                <button
                  onClick={() => setLocation("/signup")}
                  className="text-blue-400 hover:text-blue-300 font-semibold transition-colors duration-200 cursor-pointer"
                  data-testid="button-signup-link"
                >
                  Sign up
                </button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Aesthetic Footer alignment */}
      <Footer className="relative z-10 animate-fade-in animation-delay-800" />
    </div>
  );
}

