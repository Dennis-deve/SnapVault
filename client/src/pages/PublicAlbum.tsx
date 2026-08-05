import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState } from "react";
import { MediaGrid } from "@/components/MediaGrid";
import { MediaViewer } from "@/components/MediaViewer";
import { Footer } from "@/components/Footer";
import { getApiUrl } from "@/lib/api";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";
import { ImageOff } from "lucide-react";

interface PublicMediaItem {
  id: string;
  filename: string;
  type: string;
  path: string;
  thumbnailPath?: string;
}

export default function PublicAlbum() {
  const [, params] = useRoute("/shared/:token");
  const token = params?.token;
  const [selectedMedia, setSelectedMedia] = useState<PublicMediaItem | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const { data: album, isError: albumError } = useQuery<{ name: string; description: string | null; itemCount: number }>({
    queryKey: ["/api/public/albums", token],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/public/albums/${token}`));
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const { data: mediaItems = [] } = useQuery<PublicMediaItem[]>({
    queryKey: ["/api/public/albums", token, "media"],
    queryFn: async () => {
      const res = await fetch(getApiUrl(`/api/public/albums/${token}/media`));
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
    enabled: !!token && !albumError,
    retry: false,
  });

  const currentIndex = selectedMedia ? mediaItems.findIndex((m) => m.id === selectedMedia.id) : -1;

  if (albumError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <ImageOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-display font-semibold mb-2">Album not available</h1>
        <p className="text-muted-foreground max-w-sm">
          This shared album link doesn't exist, or the owner has turned off sharing for it.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/60 backdrop-blur">
        <div className="container max-w-5xl mx-auto px-4 py-4 flex items-center gap-2">
          <img src={logoImage} alt="SnapVault" className="h-7 w-7" />
          <span className="font-display font-bold text-primary">SnapVault</span>
          <span className="text-muted-foreground text-sm ml-2">· Shared Album</span>
        </div>
      </header>

      <main className="flex-1 container max-w-5xl mx-auto px-4 py-6">
        {album && (
          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold">{album.name}</h1>
            {album.description && <p className="text-muted-foreground mt-1">{album.description}</p>}
            <p className="text-sm text-muted-foreground mt-1">
              {album.itemCount} item{album.itemCount === 1 ? "" : "s"}
            </p>
          </div>
        )}

        {mediaItems.length > 0 ? (
          <MediaGrid
            items={mediaItems}
            onItemClick={(item) => {
              setSelectedMedia(item as PublicMediaItem);
              setViewerOpen(true);
            }}
          />
        ) : (
          <p className="text-muted-foreground text-center py-12">This album is empty.</p>
        )}
      </main>

      {selectedMedia && (
        <MediaViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          filename={selectedMedia.filename}
          type={selectedMedia.type}
          path={selectedMedia.path}
          items={mediaItems}
          currentIndex={currentIndex}
          onSelectIndex={(i) => setSelectedMedia(mediaItems[i])}
          onNext={() => currentIndex < mediaItems.length - 1 && setSelectedMedia(mediaItems[currentIndex + 1])}
          onPrevious={() => currentIndex > 0 && setSelectedMedia(mediaItems[currentIndex - 1])}
          hasNext={currentIndex >= 0 && currentIndex < mediaItems.length - 1}
          hasPrevious={currentIndex > 0}
          // No onDownload/onDelete/onToggleFavorite — this is a read-only
          // public view, not the owner's authenticated one.
        />
      )}

      <Footer />
    </div>
  );
}
