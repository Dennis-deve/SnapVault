import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";

interface CreateAlbumCardProps {
  onClick?: () => void;
}

export function CreateAlbumCard({ onClick }: CreateAlbumCardProps) {
  return (
    <Card
      className="overflow-hidden cursor-pointer border-dashed border-2 hover-elevate active-elevate-2 transition-all"
      onClick={onClick}
      data-testid="card-create-album"
    >
      <div className="aspect-square bg-muted/30 flex items-center justify-center">
        <Plus className="h-12 w-12 text-muted-foreground" />
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-base text-center">Create Album</h3>
      </div>
    </Card>
  );
}
