import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useState } from "react";
import { MediaGrid } from "@/components/MediaGrid";
import { MediaViewer } from "@/components/MediaViewer";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { getApiUrl } from "@/lib/api";
import logoImage from "@assets/generated_images/SnapVault_inverted_V_logo_lightning_a19e02be.png";
import { ImageOff, RefreshCw, WifiOff } from "lucide-react";

interface PublicMediaItem {
  id: string;
  filename: string;
  type: string;
  path: string;
  thumbnailPath?: string;
}

/**
 * Read-only public gallery for a shared album link.
 *
 * The four UI states are deliberately distinct so an anonymous visitor is
 * never misled:
 *   loading      — spinner
 *   revoked      — the link existed but sharing was stopped (the owner
 *                  turned off sharing, locked the album, deleted it, or
 *                  switched off account-wide public sharing)
 *   network      — we couldn't reach the API; retry offered
 *   empty        — a live album with nothing in it yet
 *
 * The server marks these responses no-store, and the page additionally
 * revalidates on window focus and on a slow interval — if the owner stops
 * sharing while a visitor has the gallery open, the contents disappear on
 * the next revalidation rather than lingering from a stale cache.
 * (Anything the visitor already downloaded/saved while the link was live
 * is, of course, theirs — stopping a share can't recall files.)
 */
export default function PublicAlbum() {
  const [, params] = useRoute("/shared/:token");
  const token = params?.token;
  const [selectedMedia, setSelectedMedia] = useState<PublicMediaItem | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const albumQuery = useQuery<{ name: string; description: string | null; itemCount: number }>({
    queryKey: ["/api/public/albums", token],
    queryFn: async ({ signal }) => {
      const res = await fetch(getApiUrl(`/api/public/albums/${token}`), {
        signal,
        // The visitor is anonymous: no credentials, and never let a shared
        // intermediary cache a response for a link that may be revoked.
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const err = new Error("not available") as any;
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // gentle periodic revalidation while open
    staleTime: 0,
  });

  const mediaQuery = useQuery<PublicMediaItem[]>({
    queryKey: ["/api/public/albums", token, "media"],
    queryFn: async ({ signal }) => {
      const res = await fetch(getApiUrl(`/api/public/albums/${token}/media`), {
        signal,
        credentials: "omit",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        const err = new Error("not available") as any;
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    enabled: !!token && !!albumQuery.data,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    staleTime: 0,
  });

  const mediaItems = mediaQuery.data ?? [];
  const currentIndex = selectedMedia ? mediaItems.findIndex((m) => m.id === selectedMedia.id) : -1;

  // An error with an HTTP status is a definitive "not available" answer
  // from the API; an error WITHOUT a status never got a response at all —
  // that's a network problem, not a revoked link, and must not be shown as
  // one.
  const albumErrorStatus = (albumQuery.error as any)?.status;
  const albumNetworkError = albumQuery.isError && albumErrorStatus === undefined;
  const mediaNetworkError =
    mediaQuery.isError && (mediaQuery.error as any)?.status === undefined;

  // Loading: album metadata still resolving.
  if (albumQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6" data-testid="public-album-loading">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4" />
        <p className="text-muted-foreground">Loading shared album…</p>
      </div>
    );
  }

  // Network-level failure reaching the API at all: distinct from revocation
  // (this must be checked BEFORE the definitive-404 branch, since isError is
  // true in both cases).
  if (albumNetworkError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center" data-testid="public-album-network">
        <WifiOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-display font-semibold mb-2">Can't reach SnapVault</h1>
        <p className="text-muted-foreground max-w-sm">
          This looks like a network problem, not a broken link. Check your connection and retry.
        </p>
        <Button
          variant="outline"
          className="mt-6 rounded-2xl"
          onClick={() => {
            albumQuery.refetch();
            mediaQuery.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
        <Footer className="mt-10" />
      </div>
    );
  }

  // Revoked / gone: the API answered definitively (404). Stale gallery
  // contents must NOT be rendered below this point.
  if (albumQuery.isError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center" data-testid="public-album-revoked">
        <ImageOff className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-display font-semibold mb-2">Album not available</h1>
        <p className="text-muted-foreground max-w-sm">
          This shared album link doesn't exist, or the owner has turned off sharing for it.
        </p>
        <Button
          variant="outline"
          className="mt-6 rounded-2xl"
          onClick={() => albumQuery.refetch()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Try again
        </Button>
        <Footer className="mt-10" />
      </div>
    );
  }

  // Live album, but the media revalidation just failed at the network
  // level with nothing to show — offer retry (last good data, if any, stays
  // visible until new data arrives).
  if (mediaNetworkError && mediaItems.length === 0 && !mediaQuery.isLoading) {
    return (
      <div className="py-12 text-center" data-testid="public-album-network">
        <WifiOff className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-semibold mb-1">Couldn't load the photos</p>
        <p className="text-sm text-muted-foreground mb-4">
          This looks like a network problem. Check your connection and retry.
        </p>
        <Button variant="outline" className="rounded-2xl" onClick={() => mediaQuery.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
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
        {albumQuery.data && (
          <div className="mb-6">
            <h1 className="text-2xl font-display font-bold">{albumQuery.data.name}</h1>
            {albumQuery.data.description && (
              <p className="text-muted-foreground mt-1">{albumQuery.data.description}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              {albumQuery.data.itemCount} item{albumQuery.data.itemCount === 1 ? "" : "s"}
            </p>
          </div>
        )}

        {mediaQuery.isLoading ? (
          <div className="text-center py-12" data-testid="public-album-media-loading">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
            <p className="text-muted-foreground">Loading photos…</p>
          </div>
        ) : mediaItems.length > 0 ? (
          <MediaGrid
            items={mediaItems}
            onItemClick={(item) => {
              setSelectedMedia(item as PublicMediaItem);
              setViewerOpen(true);
            }}
          />
        ) : (
          <p className="text-muted-foreground text-center py-12" data-testid="public-album-empty">
            This album is empty.
          </p>
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
