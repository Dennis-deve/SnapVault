import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface VideoBackgroundProps {
  videos: string[];
  className?: string;
  overlay?: boolean;
  overlayOpacity?: number;
}

export function VideoBackground({ 
  videos, 
  className = "", 
  overlay = true,
  overlayOpacity = 0.65 
}: VideoBackgroundProps) {
  // Gracefully handle empty array
  const videoList = videos && videos.length > 0 ? videos : [];

  // Track the active index sequence on the playlist
  const [currentIndex, setCurrentIndex] = useState(0);

  // We maintain two player states for crossfading beautifully without flashes
  const [playerA, setPlayerA] = useState({
    src: videoList[0] || "",
    isActive: true,
  });
  const [playerB, setPlayerB] = useState({
    src: videoList[1] || videoList[0] || "",
    isActive: false,
  });

  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  
  // Custom interactive spotlit cursor state
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Dynamic Mouse Move Spotlight tracking
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      setIsHovered(true);
    };
    const handleMouseLeave = () => {
      setIsHovered(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  // Multi-video playlist looping coordination
  useEffect(() => {
    if (videoList.length <= 1) {
      // If we have 1 video or fewer, set it to infinite native loop
      if (videoRefA.current) {
        videoRefA.current.loop = true;
        videoRefA.current.play().catch(() => {});
      }
      return;
    }

    // Capture the current active video ref
    const activeVideo = playerA.isActive ? videoRefA.current : videoRefB.current;
    if (!activeVideo) return;

    // Transition crossfade logic
    const handleVideoEnd = () => {
      const nextIdx = (currentIndex + 1) % videoList.length;

      if (playerA.isActive) {
        // Player B is stand-by, trigger play and swap opacity
        if (videoRefB.current) {
          videoRefB.current.play()
            .then(() => {
              setPlayerA(prev => ({ ...prev, isActive: false }));
              setPlayerB(prev => ({ ...prev, isActive: true }));
              setCurrentIndex(nextIdx);
            })
            .catch(err => {
              console.warn("Standby Player B autoplay was guarded:", err);
              // Fallback transition
              setPlayerA(prev => ({ ...prev, isActive: false }));
              setPlayerB(prev => ({ ...prev, isActive: true }));
              setCurrentIndex(nextIdx);
            });
        }
      } else {
        // Player A is stand-by, trigger play and swap opacity
        if (videoRefA.current) {
          videoRefA.current.play()
            .then(() => {
              setPlayerA(prev => ({ ...prev, isActive: true }));
              setPlayerB(prev => ({ ...prev, isActive: false }));
              setCurrentIndex(nextIdx);
            })
            .catch(err => {
              console.warn("Standby Player A autoplay was guarded:", err);
              // Fallback transition
              setPlayerA(prev => ({ ...prev, isActive: true }));
              setPlayerB(prev => ({ ...prev, isActive: false }));
              setCurrentIndex(nextIdx);
            });
        }
      }
    };

    activeVideo.addEventListener("ended", handleVideoEnd);
    return () => {
      activeVideo.removeEventListener("ended", handleVideoEnd);
    };
  }, [playerA.isActive, currentIndex, videoList]);

  // Standing standby-preload optimization: Buffers the *next* sequential index
  useEffect(() => {
    if (videoList.length <= 1) return;

    const standbyIdx = (currentIndex + 1) % videoList.length;
    const standbySrc = videoList[standbyIdx];

    if (playerA.isActive) {
      // Player A is playing, so load incoming source onto standby Player B
      setPlayerB(prev => {
        if (prev.src !== standbySrc) {
          if (videoRefB.current) {
            videoRefB.current.src = standbySrc;
            videoRefB.current.load();
          }
          return { src: standbySrc, isActive: false };
        }
        return prev;
      });
    } else {
      // Player B is playing, so load incoming source onto standby Player A
      setPlayerA(prev => {
        if (prev.src !== standbySrc) {
          if (videoRefA.current) {
            videoRefA.current.src = standbySrc;
            videoRefA.current.load();
          }
          return { src: standbySrc, isActive: false };
        }
        return prev;
      });
    }
  }, [currentIndex, playerA.isActive, videoList]);

  // Autoplay security loop guard
  useEffect(() => {
    if (playerA.isActive && videoRefA.current) {
      videoRefA.current.play().catch(() => {});
    } else if (playerB.isActive && videoRefB.current) {
      videoRefB.current.play().catch(() => {});
    }
  }, [playerA.isActive, playerB.isActive]);

  // Ambient Drifting Sparkles canvas implementation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    class Sparkle {
      x: number;
      y: number;
      size: number;
      dx: number;
      dy: number;
      alpha: number;
      theta: number;
      frequency: number;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 2 + 0.4;
        this.dx = (Math.random() - 0.5) * 0.25;
        this.dy = -(Math.random() * 0.4 + 0.15); // moves up slow
        this.alpha = Math.random() * 0.45 + 0.1;
        this.theta = Math.random() * Math.PI;
        this.frequency = Math.random() * 0.015 + 0.005;
      }

      update(mx: number, my: number, hovered: boolean) {
        this.x += this.dx;
        this.y += this.dy;

        // Reset particles looping
        if (this.y < -15) {
          this.y = height + 15;
          this.x = Math.random() * width;
        }
        if (this.x < -15) this.x = width + 15;
        if (this.x > width + 15) this.x = -15;

        // Interactive mouse magnetic float
        if (hovered) {
          const xDiff = this.x - mx;
          const yDiff = this.y - my;
          const d = Math.sqrt(xDiff * xDiff + yDiff * yDiff);
          if (d < 160) {
            const pull = (160 - d) / 160;
            this.x += (xDiff / d) * pull * 1.2;
            this.y += (yDiff / d) * pull * 1.2;
          }
        }

        this.theta += this.frequency;
        this.alpha = 0.1 + Math.sin(this.theta) * 0.35 + 0.1;
      }

      draw(c: CanvasRenderingContext2D) {
        c.save();
        c.beginPath();
        c.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        c.fillStyle = `rgba(186, 230, 253, ${Math.max(this.alpha, 0.05)})`;
        c.shadowColor = "rgba(186, 230, 253, 0.5)";
        c.shadowBlur = this.size * 3;
        c.fill();
        c.restore();
      }
    }

    const cluster: Sparkle[] = Array.from({ length: 50 }, () => new Sparkle());

    const drawLoop = () => {
      ctx.clearRect(0, 0, width, height);
      cluster.forEach(sp => {
        sp.update(mousePos.x, mousePos.y, isHovered);
        sp.draw(ctx);
      });
      animId = requestAnimationFrame(drawLoop);
    };

    drawLoop();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
    };
  }, [mousePos, isHovered]);

  return (
    <div className={`fixed inset-0 overflow-hidden select-none pointer-events-none ${className}`}>
      
      {/* Player A Element */}
      <video
        ref={videoRefA}
        autoPlay
        muted
        playsInline
        src={playerA.src}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
          playerA.isActive ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Player B Element */}
      <video
        ref={videoRefB}
        autoPlay
        muted
        playsInline
        src={playerB.src}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
          playerB.isActive ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Dynamic Colored Ambient Light Breathing Blobs */}
      <div className="absolute inset-0 overflow-hidden mix-blend-screen opacity-30">
        <motion.div
          animate={{
            x: [0, 50, -30, 0],
            y: [0, -60, 40, 0],
            scale: [1, 1.2, 0.85, 1],
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -top-[15%] -left-[10%] w-[550px] h-[550px] rounded-full bg-blue-500/20 blur-[140px]"
        />
        <motion.div
          animate={{
            x: [0, -40, 60, 0],
            y: [0, 50, -40, 0],
            scale: [1, 0.9, 1.15, 1],
          }}
          transition={{
            duration: 28,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute -bottom-[20%] -right-[15%] w-[650px] h-[650px] rounded-full bg-purple-600/18 blur-[160px]"
        />
        <motion.div
          animate={{
            x: [0, 30, -30, 0],
            y: [0, 35, -35, 0],
            scale: [1, 1.25, 0.75, 1],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-[35%] left-[25%] w-[450px] h-[450px] rounded-full bg-pink-500/12 blur-[130px]"
        />
      </div>

      {/* High-Performance Canvas Interactive Particle Dust Stream */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10 w-full h-full opacity-60" />

      {/* Cybernetic Grid scanlines texture for technical depth */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%] opacity-20 pointer-events-none" />

      {/* Interactive Desktop Mouse spotlight gradient */}
      {isHovered && (
        <div 
          style={{
            background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.03) 50%, transparent 100%)`
          }}
          className="absolute inset-0 mix-blend-screen pointer-events-none transition-opacity duration-300 z-15"
        />
      )}

      {/* Dark Vignette Overlay for Premium Readability */}
      {overlay && (
        <div 
          style={{ opacity: overlayOpacity }}
          className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-black/90 pointer-events-none transition-opacity duration-300"
        />
      )}

      {/* Soft Vignette Frame */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.6)_100%)] pointer-events-none" />
    </div>
  );
}
