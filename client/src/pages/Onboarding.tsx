import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { VideoBackground } from "@/components/VideoBackground";
import { Footer } from "@/components/Footer";
import { useLocation } from "wouter";
import { SEO } from "@/components/SEO";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Cloud, 
  Lock, 
  Zap, 
  Play, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles, 
  KeyRound, 
  ArrowRight, 
  Mail, 
  Fingerprint,
  Users
} from "lucide-react";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";
import video1 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080.mp4";
import video2 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080 (1).mp4";
import video3 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080 (2).mp4";
import video4 from "@assets/generated_images/animate_title_snapvault_app_background_video_resolution_1920_1080 (3).mp4";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login, signup } = useAuth();

  const videos = [video1, video2, video3, video4];

  // Main UI States
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [loginTab, setLoginTab] = useState<"password" | "pin">("password");
  const [isLoading, setIsLoading] = useState(false);

  // Form Field States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pin, setPin] = useState("");

  const handleAuthenticationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({
        title: "Missing Fields",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      if (authMode === "signup") {
        // Registering target
        if (password !== confirmPassword) {
          toast({
            title: "Error",
            description: "Passwords do not match.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
        
        if (pin && (pin.length !== 4 || !/^\d+$/.test(pin))) {
          toast({
            title: "Error",
            description: "PIN must be exactly 4 digits",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        await signup(email, password, pin || undefined);
        toast({
          title: "Welcome aboard!",
          description: pin ? "Your SnapVault is ready with Magic PIN shield." : "Your SnapVault is ready.",
        });
        setLocation("/dashboard");
      } else {
        // Authorizing Target
        const targetCredential = loginTab === "password" ? password : pin;
        if (!targetCredential) {
          toast({
            title: "Credentials Required",
            description: `Please enter your ${loginTab === "password" ? "password" : "security PIN"}.`,
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        await login(email, targetCredential);
        toast({
          title: "Authorization Success!",
          description: "Decryption terminal open.",
        });
        setLocation("/dashboard");
      }
    } catch (err: any) {
      toast({
        title: "Security Verification Failed",
        description: err.message || "Invalid account credentials.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fade-in animation parameters
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 25 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 15 }
    }
  };

  return (
    <div className="h-screen w-screen max-h-screen max-w-screen relative flex flex-col justify-between overflow-hidden bg-black text-white select-none">
      <SEO 
        title="SnapVault - Secure Cloud Photo & Video Storage"
        description="Free cloud storage for your photos and videos. SnapVault helps you backup, organize, and secure your memories inside an encrypted zero-knowledge album vault."
        keywords="cloud storage, photo backup, video storage, iPhone storage, media vault, secure photos, photo albums, cloud backup, free storage, photo organizer"
      />
      {/* Cinematic Loop Video Background */}
      <VideoBackground videos={videos} overlayOpacity={0.7} />

      {/* Elegant Sticky Top Navbar / Header */}
      <header className="relative z-20 w-full flex items-center justify-between px-6 py-4 md:px-12 md:py-6 border-b border-white/5 backdrop-blur-md bg-black/10">
        <div className="flex items-center gap-2.5">
          <img 
            src={logoImage} 
            alt="SnapVault" 
            className="h-8 w-8 sm:h-10 sm:w-10 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] cursor-pointer"
            onClick={() => {
              setAuthMode("signup");
              setEmail("");
              setPassword("");
              setConfirmPassword("");
              setPin("");
            }}
          />
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white">
            Snap<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">Vault</span>
          </h1>
        </div>

        {/* Dynamic status chip & toggle shortcuts */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-500/10 border border-blue-500/20 text-blue-400 uppercase tracking-widest leading-none">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
            AES-256 Secured
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAuthMode(authMode === "signup" ? "login" : "signup");
            }}
            className="text-xs sm:text-sm font-semibold tracking-wide text-gray-300 hover:text-white hover:bg-white/5 px-4 rounded-xl cursor-pointer"
          >
            {authMode === "signup" ? "Already have an account?" : "Need an account?"}
          </Button>
        </div>
      </header>

      {/* Main Core Full-Screen Layout Section */}
      <div className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-6 md:px-12 flex flex-col lg:flex-row items-center justify-center gap-10 xl:gap-16 overflow-hidden">
        
        {/* Left Panel: Description and Features */}
        <motion.div 
          className="flex-1 text-center lg:text-left space-y-6 lg:space-y-8 max-w-xl lg:max-w-none"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Glowing welcome tag */}
          <motion.div 
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-blue-300 font-medium tracking-wide"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Next-Generation Private Storage Vault</span>
          </motion.div>

          {/* Master Display Heading */}
          <motion.div variants={itemVariants} className="space-y-3.5">
            <h2 className="text-3.5xl sm:text-5xl xl:text-6xl font-display font-black leading-[1.1] text-white tracking-tight drop-shadow-2xl">
              Your Memories,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
                Encrypted in the Cloud.
              </span>
            </h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-300 leading-relaxed drop-shadow-md max-w-md mx-auto lg:mx-0">
              Free up device space instantly. Drag, drop, and back up your critical media within a military-grade zero-knowledge vault framework.
            </p>
          </motion.div>

          {/* Bulleted High-Contrast Highlight Features list */}
          <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="flex items-start gap-2.5 text-left bg-black/20 border border-white/5 p-3 rounded-2xl">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 mt-0.5">
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-200">Zero-Loss Cloud Sync</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">Ultra-fast redundant streams</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2.5 text-left bg-black/20 border border-white/5 p-3 rounded-2xl">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-200">Magic Album PINs</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">Independently locked access</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-left bg-black/20 border border-white/5 p-3 rounded-2xl">
              <div className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 mt-0.5">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-200">Instant Buffering</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">Hardware-accelerated rendering</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-left bg-black/20 border border-white/5 p-3 rounded-2xl">
              <div className="p-1.5 rounded-lg bg-green-500/10 text-green-400 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-200">Interactive Swiping</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">Gesture driven media viewer</p>
              </div>
            </div>
          </motion.div>

          {/* Quick-Action CTA button indicators */}
          <motion.div variants={itemVariants} className="hidden lg:flex items-center gap-2 text-xs font-bold text-gray-400">
            <span>Powered by secure cryptographic protocols</span>
            <span className="h-1 w-1 rounded-full bg-gray-500" />
            <span>Join 12,000+ vault keepers</span>
          </motion.div>
        </motion.div>

        {/* Right Panel: Interactive Seamless Auth Entry Widget */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.2, ease: "easeOut" }}
          className="w-full max-w-md lg:shrink-0 px-1 sm:px-0"
        >
          <Card className="relative bg-black/45 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_-10px_rgba(59,130,246,0.25)] overflow-hidden">
            {/* Top aesthetic ambient blue streak */}
            <div className="absolute top-0 inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent via-blue-500/60 to-transparent" />

            {/* Seamless tab headers */}
            <div className="grid grid-cols-2 p-1 bg-white/5 border border-white/5 rounded-2xl mb-6 relative">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("signup");
                }}
                className={`relative z-10 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors duration-200 rounded-xl cursor-pointer ${
                  authMode === "signup" ? "text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {authMode === "signup" && (
                  <motion.div
                    layoutId="activeAuthOnboardTab"
                    className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl z-[-1]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="flex items-center justify-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-blue-400" />
                  Sign Up
                </span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setAuthMode("login");
                }}
                className={`relative z-10 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors duration-200 rounded-xl cursor-pointer ${
                  authMode === "login" ? "text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {authMode === "login" && (
                  <motion.div
                    layoutId="activeAuthOnboardTab"
                    className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl z-[-1]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-purple-400" />
                  Sign In
                </span>
              </button>
            </div>

            {/* Live Changing Forms Frame */}
            <form onSubmit={handleAuthenticationSubmit} className="space-y-4">
              
              {/* Dynamic Subtitles */}
              <div>
                <h3 className="text-lg font-bold text-white">
                  {authMode === "signup" ? "Initialize Secure Vault" : "Authenticate Access Area"}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  {authMode === "signup"
                    ? "Enter your details to generate your cloud keys."
                    : "Confirm your authorized credentials to decrypt albums."}
                </p>
              </div>

              {/* Input for Email */}
              <div className="space-y-1.5">
                <Label htmlFor="auth-email" className="text-gray-300 font-bold text-[11px] tracking-wider uppercase ml-1">
                  Email Address
                </Label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-black/25 border-white/10 text-white h-11 pl-11 pr-4 rounded-xl placeholder:text-gray-600 focus-visible:ring-blue-500/30 focus-visible:ring-2 focus-visible:ring-offset-0 focus:border-blue-500/40 transition-all shadow-inner w-full text-sm"
                    required
                  />
                </div>
              </div>

              {/* Toggle-tabs specifically for login authentication sub-modes */}
              {authMode === "login" && (
                <div className="flex gap-2 p-0.5 bg-black/25 border border-white/5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setLoginTab("password")}
                    className={`flex-1 py-1 px-3 text-[11px] font-bold rounded-lg transition-all ${
                      loginTab === "password" ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Password Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginTab("pin")}
                    className={`flex-1 py-1 px-3 text-[11px] font-bold rounded-lg transition-all ${
                      loginTab === "pin" ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Magic PIN Log In
                  </button>
                </div>
              )}

              {/* Conditional Sub-fields renderer */}
              <AnimatePresence mode="popLayout">
                {authMode === "signup" ? (
                  <motion.div
                    key="onboard-signup-fields"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="auth-password" className="text-gray-300 font-bold text-[11px] tracking-wider uppercase ml-1">
                        Choose Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          id="auth-password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="bg-black/25 border-white/10 text-white h-11 pl-11 pr-4 rounded-xl placeholder:text-gray-600 focus-visible:ring-blue-500/30 focus-visible:ring-2 focus-visible:ring-offset-0 focus:border-blue-500/40 transition-all shadow-inner w-full text-sm"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="auth-confirm" className="text-gray-300 font-bold text-[11px] tracking-wider uppercase ml-1">
                        Confirm Password
                      </Label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          id="auth-confirm"
                          type="password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="bg-black/25 border-white/10 text-white h-11 pl-11 pr-4 rounded-xl placeholder:text-gray-600 focus-visible:ring-blue-500/30 focus-visible:ring-2 focus-visible:ring-offset-0 focus:border-blue-500/40 transition-all shadow-inner w-full text-sm"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="auth-pin" className="text-gray-300 font-bold text-[11px] tracking-wider uppercase ml-1 flex items-center justify-between">
                        <span>Magic PIN Shield (Optional)</span>
                        <span className="text-[10px] text-gray-500 font-normal normal-case">4 Digits Only</span>
                      </Label>
                      <div className="relative">
                        <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          id="auth-pin"
                          type="text"
                          inputMode="numeric"
                          placeholder="1234"
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          className="bg-black/25 border-white/10 text-white h-11 pl-11 pr-4 rounded-xl placeholder:text-gray-600 focus-visible:ring-blue-500/30 focus-visible:ring-2 focus-visible:ring-offset-0 focus:border-blue-500/40 transition-all shadow-inner w-full text-sm font-mono tracking-widest text-left"
                          maxLength={4}
                        />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="onboard-login-fields"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    {loginTab === "password" ? (
                      <div className="space-y-1.5 animate-fade-in">
                        <Label htmlFor="login-password" className="text-gray-300 font-bold text-[11px] tracking-wider uppercase ml-1">
                          Password
                        </Label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            id="login-password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="bg-black/25 border-white/10 text-white h-11 pl-11 pr-4 rounded-xl placeholder:text-gray-600 focus-visible:ring-blue-500/30 focus-visible:ring-2 focus-visible:ring-offset-0 focus:border-blue-500/40 transition-all shadow-inner w-full text-sm"
                            required
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 animate-fade-in">
                        <Label htmlFor="login-pin" className="text-gray-300 font-bold text-[11px] tracking-wider uppercase ml-1">
                          Magic PIN
                        </Label>
                        <div className="relative">
                          <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            id="login-pin"
                            type="password"
                            inputMode="numeric"
                            placeholder="1234"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            className="bg-black/25 border-white/10 text-white h-11 pl-11 pr-4 rounded-xl placeholder:text-gray-600 focus-visible:ring-blue-500/30 focus-visible:ring-2 focus-visible:ring-offset-0 focus:border-blue-500/40 transition-all shadow-inner w-full text-sm font-mono tracking-widest text-left"
                            maxLength={4}
                            required
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] px-1">
                      <button
                        type="button"
                        onClick={() => setLocation("/forgot-password")}
                        className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                      >
                        Forgot credentials?
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Master Submit Button */}
              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:via-indigo-500 hover:to-purple-500 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition-all duration-300 shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/25 active:scale-[0.98] border border-white/10 cursor-pointer"
                disabled={isLoading}
              >
                {isLoading ? (
                  "Verifying Authenticity..."
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    {authMode === "signup" ? "Build SnapVault Free" : "Authorize Decryption"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </Button>
            </form>
          </Card>
        </motion.div>

      </div>

      {/* Footer Element */}
      <Footer className="relative z-15 w-full flex-none animate-fade-in text-white/50 bg-black/5" />
    </div>
  );
}

