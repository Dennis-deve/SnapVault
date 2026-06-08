import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Trash2, MoveHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MediaViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  type: string;
  path: string;
  onDownload?: () => void;
  onDelete?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 150 : -150,
    opacity: 0,
    scale: 0.98,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: { type: "spring", stiffness: 350, damping: 28 },
      opacity: { duration: 0.15 },
      scale: { duration: 0.15 },
    },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 150 : -150,
    opacity: 0,
    scale: 0.98,
    transition: {
      x: { type: "spring", stiffness: 350, damping: 28 },
      opacity: { duration: 0.15 },
      scale: { duration: 0.15 },
    },
  }),
};

export function MediaViewer({ 
  open, 
  onOpenChange, 
  filename, 
  type, 
  path, 
  onDownload, 
  onDelete,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious
}: MediaViewerProps) {
  const [direction, setDirection] = useState(0);
  const [dragX, setDragX] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleNext = () => {
    if (hasNext && onNext) {
      setDirection(1);
      onNext();
    }
  };

  const handlePrevious = () => {
    if (hasPrevious && onPrevious) {
      setDirection(-1);
      onPrevious();
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, hasNext, hasPrevious, onNext, onPrevious, onOpenChange]);

  // Compute live visual feedback states for drag indicators
  const leftOpacity = hasPrevious ? Math.min(Math.max(dragX / 100, 0), 1) : 0;
  const leftScale = hasPrevious ? 0.8 + (Math.min(Math.max(dragX / 100, 0), 1) * 0.3) : 0.8;
  
  const rightOpacity = hasNext ? Math.min(Math.max(-dragX / 100, 0), 1) : 0;
  const rightScale = hasNext ? 0.8 + (Math.min(Math.max(-dragX / 100, 0), 1) * 0.3) : 0.8;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-0 bg-background overflow-hidden">
        <div 
          ref={containerRef}
          className="relative h-[95vh] flex flex-col select-none"
        >
          {/* Actions Bar */}
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="rounded-full h-10 w-10 shadow-lg hover:scale-105 transition-transform"
                    data-testid="button-delete"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                   <AlertDialogHeader>
                    <AlertDialogTitle>Delete this media?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the media file.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              size="icon"
              variant="secondary"
              className="rounded-full h-10 w-10 shadow-lg backdrop-blur-sm bg-background/80 hover:bg-background/90 hover:scale-105 transition-all"
              onClick={onDownload}
              data-testid="button-download"
            >
              <Download className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="rounded-full h-10 w-10 shadow-lg backdrop-blur-sm bg-background/80 hover:bg-background/90 hover:scale-105 transition-all"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-viewer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Interactive Sliding Media Container */}
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8 md:p-12 overflow-hidden relative">
            
            {/* Real-time Dynamic Left/Previous Swipe Guide Indicator */}
            {hasPrevious && (
              <div 
                style={{ 
                  opacity: leftOpacity, 
                  transform: `translateY(-50%) scale(${leftScale})` 
                }}
                className="absolute left-6 top-1/2 -translate-y-1/2 z-20 pointer-events-none p-3 rounded-full bg-black/60 border border-white/20 text-white shadow-xl transition-all duration-100 ease-out hidden sm:flex items-center justify-center"
              >
                <ChevronLeft className="h-6 w-6 text-blue-400" />
              </div>
            )}

            {/* Real-time Dynamic Right/Next Swipe Guide Indicator */}
            {hasNext && (
              <div 
                style={{ 
                  opacity: rightOpacity, 
                  transform: `translateY(-50%) scale(${rightScale})` 
                }}
                className="absolute right-6 top-1/2 -translate-y-1/2 z-20 pointer-events-none p-3 rounded-full bg-black/60 border border-white/20 text-white shadow-xl transition-all duration-100 ease-out hidden sm:flex items-center justify-center"
              >
                <ChevronRight className="h-6 w-6 text-blue-400" />
              </div>
            )}

            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.div
                key={path}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.65}
                onDrag={(e, info) => setDragX(info.offset.x)}
                onDragEnd={(e, info) => {
                  setDragX(0); // Reset indicator tracking
                  const swipeThreshold = 55; // drag pixels threshold for sliding action
                  if (info.offset.x < -swipeThreshold) {
                    handleNext();
                  } else if (info.offset.x > swipeThreshold) {
                    handlePrevious();
                  }
                }}
                className="w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing touch-pan-y"
              >
                {type.startsWith('image/') ? (
                  <img
                    src={path}
                    alt={filename}
                    className="max-w-full max-h-[calc(95vh-140px)] object-contain pointer-events-none select-none drop-shadow-2xl rounded-lg"
                    referrerPolicy="no-referrer"
                  />
                ) : type.startsWith('video/') ? (
                  <div className="w-full h-full flex items-center justify-center pointer-events-auto">
                    <video
                      src={path}
                      controls
                      autoPlay
                      className="max-w-full max-h-[calc(95vh-140px)] object-contain rounded-lg shadow-2xl"
                    />
                  </div>
                ) : null}
              </motion.div>
            </AnimatePresence>

            {/* Premium, sleek Swipe/Drag Visual Indicator */}
            {(hasNext || hasPrevious) && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5 pointer-events-none select-none opacity-60 hover:opacity-100 transition-opacity">
                <MoveHorizontal className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
                <span>Drag left or right to slide</span>
              </div>
            )}
          </div>

          <div className="p-4 border-t bg-card">
            <p className="text-sm font-medium text-center truncate">{filename}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
