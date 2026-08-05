import { Card } from "@/components/ui/card";
import { ImageIcon, Lock, Unlock, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AlbumCardProps {
  id: string;
  name: string;
  itemCount: number;
  thumbnail?: string;
  isLocked?: boolean;
  onClick?: () => void;
  onLockToggle?: (albumId: string) => void;
}

export function AlbumCard({ 
  id, 
  name, 
  itemCount, 
  thumbnail, 
  isLocked = false,
  onClick,
  onLockToggle 
}: AlbumCardProps) {
  const handleLockClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLockToggle?.(id);
  };

  // Determine if it's a video thumbnail (for styling)
  const isVideoAlbum = name.toLowerCase().includes('video');
  const isVideoThumbnail = thumbnail && (
    thumbnail.includes('.mp4') || 
    thumbnail.includes('.mov') || 
    thumbnail.includes('.webm') ||
    thumbnail.includes('/video/')
  );
  
  // For Cloudinary video URLs, convert to thumbnail image
  const getThumbnailUrl = (url: string | undefined) => {
    if (!url) return null;
    
    // If it's a Cloudinary video, convert to thumbnail
    if (url.includes('cloudinary.com') && url.includes('/video/')) {
      // Replace /video/ with /image/ and add thumbnail transformation
      return url.replace('/video/upload/', '/video/upload/so_0,w_400,h_400,c_fill/')
                .replace(/\.(mp4|mov|webm|avi)$/, '.jpg');
    }
    
    return url;
  };

  const displayThumbnail = getThumbnailUrl(thumbnail);

  return (
    <Card
      className="overflow-hidden cursor-pointer transition-all hover-elevate active-elevate-2 relative group"
      onClick={onClick}
      data-testid={`card-album-${name}`}
    >
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden relative">
        {displayThumbnail ? (
          <>
            <img 
              src={displayThumbnail} 
              alt={name} 
              className={`w-full h-full object-cover transition-transform group-hover:scale-105 ${isLocked ? 'blur-md' : ''}`}
              onError={(e) => {
                // Fallback if thumbnail fails to load
                e.currentTarget.style.display = 'none';
              }}
            />
            {/* Video indicator if it's a video thumbnail */}
            {isVideoThumbnail && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                <Video className="h-16 w-16 text-white/90 drop-shadow-lg" />
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {isVideoAlbum ? (
              <Video className="h-12 w-12 text-muted-foreground" />
            ) : (
              <ImageIcon className="h-12 w-12 text-muted-foreground" />
            )}
            <p className="text-xs text-muted-foreground">Empty Album</p>
          </div>
        )}
        
        {/* Lock overlay */}
        {isLocked && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
            <Lock className="h-12 w-12 text-white drop-shadow-lg" />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate" data-testid={`text-album-name-${name}`}>
              {name}
            </h3>
            <p className="text-sm text-muted-foreground" data-testid={`text-album-count-${name}`}>
              {isLocked ? "🔒 Locked" : `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
            </p>
          </div>
          {onLockToggle && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleLockClick}
              title={isLocked ? "Unlock album" : "Lock album"}
              aria-label={isLocked ? "Unlock album" : "Lock album"}
            >
              {isLocked ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
