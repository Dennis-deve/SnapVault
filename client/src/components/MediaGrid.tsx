import { ImageIcon, Video } from "lucide-react";

interface MediaItem {
  id: string;
  filename: string;
  type: string;
  path?: string;
  createdAt?: Date;
}

interface MediaGridProps {
  items: MediaItem[];
  onItemClick?: (item: MediaItem) => void;
  columns?: {
    mobile: number;
    desktop: number;
  };
}

export function MediaGrid({ items, onItemClick, columns = { mobile: 3, desktop: 5 } }: MediaGridProps) {
  const gridClass = `grid gap-2 md:gap-3`;
  const colClass = `grid-cols-${columns.mobile} md:grid-cols-${columns.desktop}`;

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
        
        return (
          <div
            key={item.id}
            className="aspect-square bg-muted rounded-xl overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-all relative group"
            onClick={() => onItemClick?.(item)}
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
