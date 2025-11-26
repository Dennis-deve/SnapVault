import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, useRef } from "react";
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
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Minimum swipe distance (in px) to trigger next/previous
  const minSwipeDistance = 50;

  // Add smooth transition effect when media changes
  useEffect(() => {
    if (open) {
      setIsTransitioning(true);
      const timer = setTimeout(() => setIsTransitioning(false), 150);
      return () => clearTimeout(timer);
    }
  }, [path, open]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        onPrevious();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        onNext();
      } else if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, hasNext, hasPrevious, onNext, onPrevious, onOpenChange]);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && hasNext && onNext) {
      onNext();
    } else if (isRightSwipe && hasPrevious && onPrevious) {
      onPrevious();
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-0 bg-background">
        <div 
          ref={containerRef}
          className="relative h-[95vh] flex flex-col"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="rounded-full h-10 w-10"
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
              className="rounded-full h-10 w-10"
              onClick={onDownload}
              data-testid="button-download"
            >
              <Download className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="rounded-full h-10 w-10"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-viewer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Previous Button */}
          {hasPrevious && onPrevious && (
            <Button
              size="icon"
              variant="secondary"
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 rounded-full h-14 w-14 sm:h-12 sm:w-12 shadow-lg backdrop-blur-sm bg-background/80 hover:bg-background/90 active:scale-95 transition-all"
              onClick={onPrevious}
              data-testid="button-previous"
              title="Previous (← or swipe right)"
            >
              <ChevronLeft className="h-7 w-7 sm:h-6 sm:w-6" />
            </Button>
          )}

          {/* Next Button */}
          {hasNext && onNext && (
            <Button
              size="icon"
              variant="secondary"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 rounded-full h-14 w-14 sm:h-12 sm:w-12 shadow-lg backdrop-blur-sm bg-background/80 hover:bg-background/90 active:scale-95 transition-all"
              onClick={onNext}
              data-testid="button-next"
              title="Next (→ or swipe left)"
            >
              <ChevronRight className="h-7 w-7 sm:h-6 sm:w-6" />
            </Button>
          )}

          <div className="flex-1 flex items-center justify-center p-4 sm:p-8 md:p-12 overflow-hidden">
            {type.startsWith('image/') ? (
              <img
                src={path}
                alt={filename}
                className={`w-full h-auto max-h-[calc(95vh-100px)] object-contain transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
              />
            ) : type.startsWith('video/') ? (
              <video
                src={path}
                controls
                className={`w-full h-auto max-h-[calc(95vh-100px)] object-contain transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
              />
            ) : null}
          </div>

          <div className="p-4 border-t bg-card">
            <p className="text-sm font-medium text-center truncate">{filename}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
