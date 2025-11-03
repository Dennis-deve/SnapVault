import { Card } from "@/components/ui/card";
import { ImageIcon } from "lucide-react";

interface AlbumCardProps {
  id: string;
  name: string;
  itemCount: number;
  thumbnail?: string;
  onClick?: () => void;
}

export function AlbumCard({ name, itemCount, thumbnail, onClick }: AlbumCardProps) {
  return (
    <Card
      className="overflow-hidden cursor-pointer transition-all hover-elevate active-elevate-2"
      onClick={onClick}
      data-testid={`card-album-${name}`}
    >
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
        {thumbnail ? (
          <img src={thumbnail} alt={name} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="h-12 w-12 text-muted-foreground" />
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-base truncate" data-testid={`text-album-name-${name}`}>{name}</h3>
        <p className="text-sm text-muted-foreground" data-testid={`text-album-count-${name}`}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </p>
      </div>
    </Card>
  );
}
