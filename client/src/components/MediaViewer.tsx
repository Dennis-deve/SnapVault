import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Trash2, ChevronLeft, ChevronRight, Heart } from "lucide-react";
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

export interface MediaViewerItem {
  id: string;
  filename: string;
  type: string;
  path: string;
  isFavorite?: boolean | number | null;
}

interface MediaViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  type: string;
  path: string;
  createdAt?: string | Date;
  isFavorite?: boolean | number | null;
  onToggleFavorite?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  /** Full filtered set + position, used to render the Figma-style bottom
   *  filmstrip and "X of Y" position indicator. Optional — the viewer still
   *  works without them, it just won't show the filmstrip/position bar. */
  items?: MediaViewerItem[];
  currentIndex?: number;
  onSelectIndex?: (index: number) => void;
}

function formatRelativeDate(date?: string | Date): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function MediaViewer({
  open,
  onOpenChange,
  filename,
  type,
  path,
  createdAt,
  isFavorite,
  onToggleFavorite,
  onDownload,
  onDelete,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
  items,
  currentIndex,
  onSelectIndex,
}: MediaViewerProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const [controlsVisible, setControlsVisible] = useState(true);

  const minSwipeDistance = 50;

  useEffect(() => {
    if (open) {
      setIsTransitioning(true);
      setControlsVisible(true);
      const timer = setTimeout(() => setIsTransitioning(false), 150);
      return () => clearTimeout(timer);
    }
  }, [path, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasPrevious && onPrevious) {
        onPrevious();
      } else if (e.key === "ArrowRight" && hasNext && onNext) {
        onNext();
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, hasNext, hasPrevious, onNext, onPrevious, onOpenChange]);

  // Keep the active filmstrip thumbnail scrolled into view as the person
  // navigates with prev/next or swipe.
  useEffect(() => {
    if (currentIndex == null || !filmstripRef.current) return;
    const activeEl = filmstripRef.current.querySelector<HTMLElement>(`[data-filmstrip-index="${currentIndex}"]`);
    activeEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [currentIndex]);

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

  const hasPosition = items && items.length > 0 && currentIndex != null && currentIndex >= 0;
  const positionPercent = hasPosition ? ((currentIndex! + 1) / items!.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full-bleed, edge-to-edge immersive viewer, matching the Figma
          Media Viewer frame — dark background, translucent top/bottom
          overlay bars rather than a windowed card. */}
      <DialogContent className="max-w-none w-screen h-[100dvh] p-0 border-0 bg-black rounded-none sm:rounded-none [&>button]:hidden">
        <div
          ref={containerRef}
          className="relative h-full w-full flex flex-col bg-black"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Top overlay bar */}
          <div className={`absolute top-0 left-0 right-0 z-20 bg-black/80 backdrop-blur-md px-4 py-4 flex items-center gap-3 transition-opacity duration-300 ${controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
            <button
              onClick={() => onOpenChange(false)}
              className="h-10 w-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0 text-white"
              data-testid="button-close-viewer"
              aria-label="Close viewer"
            >
              <ChevronLeft className="h-5 w-5 text-white" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{filename}</p>
              {createdAt && (
                <p className="text-xs text-white/70 truncate">{formatRelativeDate(createdAt)}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onToggleFavorite && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full h-9 w-9 bg-white/20 hover:bg-white/30 text-white"
                  onClick={onToggleFavorite}
                  data-testid="button-favorite"
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  aria-pressed={!!isFavorite}
                >
                  <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full h-9 w-9 bg-white/20 hover:bg-white/30 text-white"
                onClick={onDownload}
                data-testid="button-download"
                aria-label="Download media"
              >
                <Download className="h-4 w-4" />
              </Button>
              {onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-full h-9 w-9 bg-white/20 hover:bg-destructive/80 text-white"
                      data-testid="button-delete"
                      aria-label="Delete media"
                    >
                      <Trash2 className="h-4 w-4" />
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
            </div>
          </div>

          {/* Previous / Next arrows (desktop-friendly; swipe covers mobile) */}
          {hasPrevious && onPrevious && (
            <Button
              size="icon"
              variant="ghost"
              className={`absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 rounded-full h-12 w-12 bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm active:scale-95 transition-all hidden sm:flex ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              onClick={onPrevious}
              data-testid="button-previous"
              title="Previous (← or swipe right)"
              aria-label="Previous media"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          {hasNext && onNext && (
            <Button
              size="icon"
              variant="ghost"
              className={`absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 rounded-full h-12 w-12 bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm active:scale-95 transition-all hidden sm:flex ${controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              onClick={onNext}
              data-testid="button-next"
              title="Next (→ or swipe left)"
              aria-label="Next media"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}

          {/* Media content - tap anywhere to toggle controls */}
          <div 
            className="flex-1 min-h-0 min-w-0 w-full h-full flex items-center justify-center overflow-hidden cursor-pointer select-none p-2 sm:p-4"
            onClick={() => setControlsVisible(!controlsVisible)}
          >
            {type.startsWith("image/") ? (
              <img
                src={path}
                alt={filename}
                className={`max-w-full max-h-full w-auto h-auto object-contain transition-all duration-200 ${isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}
              />
            ) : type.startsWith("video/") ? (
              <video
                src={path}
                controls
                playsInline
                className={`max-w-full max-h-full w-auto h-auto object-contain transition-all duration-200 ${isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"}`}
              />
            ) : null}
          </div>

          {/* Bottom overlay bar: position + progress + filmstrip */}
          <div className={`relative z-20 bg-black/80 backdrop-blur-md pt-3 pb-[max(env(safe-area-inset-bottom),12px)] transition-opacity duration-300 ${controlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
            {hasPosition && (
              <div className="px-5 mb-2">
                <div className="h-1 rounded-full bg-white/25 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-200"
                    style={{ width: `${positionPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[13px] text-white/85" data-testid="text-media-position">
                    {currentIndex! + 1} of {items!.length}
                  </span>
                  {onDownload && (
                    <button
                      onClick={onDownload}
                      className="text-[13px] font-semibold text-white"
                      data-testid="button-download-text"
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
            )}

            {items && items.length > 1 && (
              <div
                ref={filmstripRef}
                className="flex gap-2 overflow-x-auto px-4 pt-1 pb-1 [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none" }}
              >
                {items.map((item, i) => (
                  <button
                    key={item.id}
                    data-filmstrip-index={i}
                    onClick={() => onSelectIndex?.(i)}
                    className={`shrink-0 h-[42px] w-16 rounded-md overflow-hidden border-2 transition-all ${
                      i === currentIndex ? "border-white" : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                    aria-label={`View ${item.filename}`}
                    aria-current={i === currentIndex ? "true" : undefined}
                  >
                    {item.type.startsWith("image/") ? (
                      <img src={item.path} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full bg-white/20 flex items-center justify-center text-white text-[10px]">
                        Video
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
