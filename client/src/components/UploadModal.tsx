import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, Upload } from "lucide-react";
import { useState } from "react";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  albums: any[];
  onAlbumSelect: (albumId: string) => void;
}

export function UploadModal({ open, onOpenChange, albums, onAlbumSelect }: UploadModalProps) {
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  const handleUpload = () => {
    if (selectedAlbum) {
      onAlbumSelect(selectedAlbum);
      onOpenChange(false);
      setSelectedAlbum(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Media</DialogTitle>
          <DialogDescription>
            Select an album to upload your photos and videos to.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-2">
            {albums.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No albums available. Create an album first.</p>
              </div>
            ) : (
              albums.map((album) => (
                <Button
                  key={album.id}
                  variant={selectedAlbum === album.id ? "secondary" : "outline"}
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => setSelectedAlbum(album.id)}
                >
                  <FolderOpen className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-medium">{album.name}</div>
                    {album.description && (
                      <div className="text-xs text-muted-foreground">{album.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {album.itemCount || 0} items
                    </div>
                  </div>
                </Button>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-3 mt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            className="flex-1 gap-2" 
            onClick={handleUpload}
            disabled={!selectedAlbum}
          >
            <Upload className="h-4 w-4" />
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
