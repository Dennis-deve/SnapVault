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

  return (
    <div className={`${gridClass} ${colClass}`}>
      {items.map((item) => (
        <div
          key={item.id}
          className="aspect-square bg-muted rounded-xl overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-all relative group"
          onClick={() => onItemClick?.(item)}
          data-testid={`media-item-${item.id}`}
        >
          {item.path ? (
            <>
              {item.type.startsWith('image/') ? (
                <img src={item.path} alt={item.filename} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <Video className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end p-2">
            <p className="text-white text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
              {item.filename}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
