import { ImageIcon, Video, Heart, Check } from "lucide-react";

interface MediaItem {
  id: string;
  filename: string;
  type: string;
  path?: string;
  createdAt?: Date;
  isFavorite?: boolean | number | null;
}

interface MediaGridProps {
  items: MediaItem[];
  onItemClick?: (item: MediaItem) => void;
  columns?: {
    mobile: number;
    desktop: number;
  };
  /** Multi-select mode (Figma "Select" affordance on Album Detail). When
   *  enabled, clicking an item toggles selection instead of opening the
   *  viewer, and a checkmark overlay shows selected state. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (item: MediaItem) => void;
}

// Tailwind's JIT scanner only generates CSS for class names that appear as
// literal text somewhere in the source — a class built at runtime via a
// template string (e.g. `grid-cols-${n}`) is invisible to it and silently
// never gets a corresponding CSS rule. That was the actual bug here:
// `md:grid-cols-${columns.desktop}` never resolved to real CSS, so the grid
// stayed at 3 columns on every screen size instead of widening to 5 on
// desktop as intended. Every literal combination used in the app must be
// spelled out below so Tailwind can see it at build time.
const GRID_COL_CLASSES: Record<string, string> = {
  "3-5": "grid-cols-3 md:grid-cols-5",
  "2-4": "grid-cols-2 md:grid-cols-4",
  "3-4": "grid-cols-3 md:grid-cols-4",
  "3-6": "grid-cols-3 md:grid-cols-6",
  "4-6": "grid-cols-4 md:grid-cols-6",
  "2-3": "grid-cols-2 md:grid-cols-3",
};

export function MediaGrid({
  items,
  onItemClick,
  columns = { mobile: 3, desktop: 5 },
  selectable = false,
  selectedIds,
  onToggleSelect,
}: MediaGridProps) {
  const gridClass = `grid gap-2 md:gap-3`;
  const key = `${columns.mobile}-${columns.desktop}`;
  const colClass = GRID_COL_CLASSES[key] ?? GRID_COL_CLASSES["3-5"];

  // Helper to get video thumbnail from Cloudinary
  const getVideoThumbnail = (videoUrl: string) => {
    if (videoUrl.includes('cloudinary.com') && videoUrl.includes('/video/')) {
      // Convert video URL to thumbnail image URL
      return videoUrl.replace('/video/upload/', '/video/upload/so_0,w_300,h_300,c_fill/')
                     .replace(/\.(mp4|mov|webm|avi)$/, '.jpg');
    }
    return null;
  };

  return (
    <div className={`${gridClass} ${colClass}`}>
      {items.map((item) => {
        const isVideo = item.type.startsWith('video/');
        const isImage = item.type.startsWith('image/');
        const videoThumbnail = isVideo && item.path ? getVideoThumbnail(item.path) : null;
        const isSelected = !!selectedIds?.has(item.id);
        
        return (
          <div
            key={item.id}
            className={`aspect-square bg-muted rounded-xl overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-all relative group ${
              isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
            }`}
            onClick={() => (selectable ? onToggleSelect?.(item) : onItemClick?.(item))}
            data-testid={`media-item-${item.id}`}
          >
            {item.path ? (
              <>
                {isImage ? (
                  <img 
                    src={item.path} 
                    alt={item.filename} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                  />
                ) : isVideo && videoThumbnail ? (
                  <div className="relative w-full h-full">
                    <img 
                      src={videoThumbnail} 
                      alt={item.filename} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" 
                    />
                    {/* Video play icon overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors pointer-events-none">
                      <div className="bg-white/90 rounded-full p-3 group-hover:scale-110 transition-transform">
                        <Video className="h-8 w-8 text-gray-900" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                    <Video className="h-12 w-12 text-white/80" />
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}

            {item.isFavorite && !selectable && (
              <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                <Heart className="h-3.5 w-3.5 fill-red-500 text-red-500" />
              </div>
            )}

            {selectable && (
              <div
                className={`absolute top-1.5 right-1.5 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors pointer-events-none ${
                  isSelected
                    ? "bg-primary border-primary"
                    : "bg-black/30 border-white/80 backdrop-blur-sm"
                }`}
              >
                {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
              </div>
            )}

            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2 pointer-events-none">
              <p className="text-white text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg">
                {item.filename}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
