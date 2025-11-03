import { Navbar } from "@/components/Navbar";
import { MediaGrid } from "@/components/MediaGrid";
import { MediaViewer } from "@/components/MediaViewer";
import { EmptyState } from "@/components/EmptyState";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MoreVertical, Upload } from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AlbumView() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/album/:id");
  const { toast } = useToast();

  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);

  // todo: remove mock functionality
  const album = { id: params?.id, name: "Vacation 2025" };
  const [mediaItems] = useState([
    { id: "1", filename: "IMG_1001.jpg", type: "image/jpeg", path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400" },
    { id: "2", filename: "IMG_1002.jpg", type: "image/jpeg", path: "https://images.unsplash.com/photo-1511593358241-7eea1f3c84e5?w=400" },
    { id: "3", filename: "VID_1003.mp4", type: "video/mp4" },
    { id: "4", filename: "IMG_1004.jpg", type: "image/jpeg", path: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400" },
    { id: "5", filename: "IMG_1005.jpg", type: "image/jpeg", path: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400" },
    { id: "6", filename: "IMG_1006.jpg", type: "image/jpeg", path: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400" },
  ]);

  const handleMediaClick = (item: any) => {
    setSelectedMedia(item);
    setViewerOpen(true);
  };

  const handleDownload = () => {
    toast({
      title: "Download started",
      description: `Downloading ${selectedMedia?.filename}`,
    });
  };

  const handleUpload = () => {
    toast({
      title: "Upload feature",
      description: "File upload will be implemented in the full version",
    });
  };

  const handleDelete = () => {
    toast({
      title: "Album deleted",
      description: `"${album.name}" has been deleted.`,
      variant: "destructive",
    });
    setLocation("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        showMenu={false}
        user={{ email: "user@example.com" }}
        onSettingsClick={() => setLocation("/settings")}
        onLogout={() => setLocation("/")}
      />

      <div className="sticky top-16 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/dashboard")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-display font-semibold truncate">
              {album.name}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleUpload}
              className="rounded-2xl hidden md:flex"
              data-testid="button-upload-media"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-album-menu">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-testid="button-edit-album">Edit Album</DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={handleDelete}
                  data-testid="button-delete-album"
                >
                  Delete Album
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <main className="container max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        {mediaItems.length === 0 ? (
          <EmptyState
            icon="cloud"
            title="No media yet"
            description="Upload your first photos or videos to this album."
            actionLabel="Upload Media"
            onAction={handleUpload}
          />
        ) : (
          <MediaGrid items={mediaItems} onItemClick={handleMediaClick} />
        )}
      </main>

      <FloatingActionButton onClick={handleUpload} label="Upload Media" />

      {selectedMedia && (
        <MediaViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          filename={selectedMedia.filename}
          type={selectedMedia.type}
          path={selectedMedia.path || ""}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}
