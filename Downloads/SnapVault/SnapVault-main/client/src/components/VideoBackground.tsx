import { useState, useEffect, useRef } from "react";

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
  overlayOpacity = 0.6 
}: VideoBackgroundProps) {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const nextVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleVideoEnd = () => {
      // Start transition to next video
      setIsTransitioning(true);
      
      // After fade out, switch videos
      setTimeout(() => {
        setCurrentVideoIndex((prev) => (prev + 1) % videos.length);
        setIsTransitioning(false);
      }, 1000); // Match transition duration
    };

    video.addEventListener('ended', handleVideoEnd);
    return () => video.removeEventListener('ended', handleVideoEnd);
  }, [videos.length]);

  // Preload next video
  useEffect(() => {
    const nextVideo = nextVideoRef.current;
    if (nextVideo) {
      const nextIndex = (currentVideoIndex + 1) % videos.length;
      nextVideo.src = videos[nextIndex];
      nextVideo.load();
    }
  }, [currentVideoIndex, videos]);

  // Map overlayOpacity (0-1) to the closest Tailwind opacity utility (0,5,10,20,25,30,40,50,60,70,75,80,90,95,100)
  const _percent = Math.round(Math.min(Math.max(overlayOpacity, 0), 1) * 100);
  const _steps = [0,5,10,20,25,30,40,50,60,70,75,80,90,95,100];
  const closest = _steps.reduce((prev, curr) =>
    Math.abs(curr - _percent) < Math.abs(prev - _percent) ? curr : prev
  );
  const overlayOpacityClass = `opacity-${closest}`;

  return (
    <div className={`fixed inset-0 overflow-hidden ${className}`}>
      {/* Current Video */}
      <video
        ref={videoRef}
        key={currentVideoIndex}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
          isTransitioning ? 'opacity-0' : 'opacity-100'
        }`}
        src={videos[currentVideoIndex]}
      />

      {/* Gradient Overlay for text readability */}
      {overlay && (
        <div 
          className={`absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80 ${overlayOpacityClass}`}
        />
      )}

      {/* Vignette effect for cinematic look */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  );
}
