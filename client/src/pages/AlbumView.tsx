import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/AppSidebar";
import { MediaGrid } from "@/components/MediaGrid";
import { MediaViewer } from "@/components/MediaViewer";
import { EmptyState } from "@/components/EmptyState";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { BottomNav } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, MoreVertical, Upload, Lock, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PinDialog } from "@/components/PinDialog";
import { getAlbumUnlockToken, setAlbumUnlockToken, clearAlbumUnlockToken } from "@/lib/albumUnlock";
import { uploadFile } from "@/lib/upload";
import { UploadProgressList, type UploadFileState } from "@/components/UploadProgressList";
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
  const { user, logout } = useAuth();

  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFileState[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null)[0];

  const [mediaFilter, setMediaFilter] = useState<"all" | "photos" | "videos" | "favorites">("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const albumId = params?.id;

  // Other albums, for the "Move to Album" batch action.
  const { data: allAlbums = [] } = useQuery<any[]>({
    queryKey: ["/api/albums"],
    enabled: selectMode,
  });
  const otherAlbums = allAlbums.filter((a: any) => a.id !== albumId);

  // SECURITY: locked albums now require the short-lived unlock token
  // obtained from Dashboard's PIN flow (POST /api/albums/:id/unlock-session)
  // — the server rejects these requests with 423 if it's missing/invalid,
  // even though the caller is authenticated as the album's owner. This
  // closes the gap where a locked album's contents were readable by anyone
  // who could reach this endpoint without ever supplying the PIN.
  const unlockToken = albumId ? getAlbumUnlockToken(albumId) : null;
  const unlockHeaders: Record<string, string> = unlockToken
    ? { "x-album-unlock-token": unlockToken }
    : {};

  // Fetch album details
  const { data: album, error: albumError } = useQuery<any>({
    queryKey: ["/api/albums", albumId],
    queryFn: () => apiRequest(`/api/albums/${albumId}`, { headers: unlockHeaders }),
    enabled: !!albumId,
    retry: false,
  });

  // Fetch media for this album (requires the unlock token above if locked)
  const { data: mediaItems = [], isLoading: isLoadingMedia, error: mediaError } = useQuery<any[]>({
    queryKey: ["/api/albums", albumId, "media"],
    queryFn: () => apiRequest(`/api/albums/${albumId}/media`, { headers: unlockHeaders }),
    enabled: !!albumId,
    retry: false,
  });

  const [showPinDialog, setShowPinDialog] = useState(false);
  const [isPinLoading, setIsPinLoading] = useState(false);

  // If the server says this album is locked (our unlock token was missing,
  // expired, or invalid), open the inline PIN prompt directly on this page
  // rather than kicking the user back to the dashboard.
  useEffect(() => {
    const lockedError = [albumError, mediaError].find(
      (e: any) => e?.message?.startsWith("423")
    );
    if (lockedError && albumId) {
      clearAlbumUnlockToken(albumId);
      setShowPinDialog(true);
    }
  }, [albumError, mediaError, albumId]);

  const handlePinSubmit = async (pin: string) => {
    if (!albumId) return;
    setIsPinLoading(true);
    try {
      const { unlockToken } = await apiRequest(`/api/albums/${albumId}/unlock-session`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      if (unlockToken) {
        setAlbumUnlockToken(albumId, unlockToken);
      }
      setShowPinDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "media"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Invalid Magic PIN",
        variant: "destructive",
      });
    } finally {
      setIsPinLoading(false);
    }
  };

  const photoCount = mediaItems.filter((m: any) => m.type?.startsWith("image/")).length;
  const videoCount = mediaItems.filter((m: any) => m.type?.startsWith("video/")).length;
  const filteredMedia =
    mediaFilter === "all"
      ? mediaItems
      : mediaFilter === "favorites"
      ? mediaItems.filter((m: any) => m.isFavorite)
      : mediaItems.filter((m: any) =>
          mediaFilter === "photos" ? m.type?.startsWith("image/") : m.type?.startsWith("video/")
        );

  // Delete album mutation
  const deleteAlbumMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/albums/${albumId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
    },
  });

  // Delete media mutation
  const deleteMediaMutation = useMutation({
    mutationFn: async (mediaId: string) => {
      return apiRequest(`/api/media/${mediaId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "media"] });
      setViewerOpen(false);
      toast({
        title: "Media deleted",
        description: "The media has been deleted successfully.",
      });
    },
  });

  // Favorite toggle mutation — optimistic so the heart responds instantly.
  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      return apiRequest(`/api/media/${id}/favorite`, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite }),
      });
    },
    onMutate: async ({ id, isFavorite }) => {
      const queryKey = ["/api/albums", albumId, "media"];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<any[]>(queryKey);
      queryClient.setQueryData<any[]>(queryKey, (old = []) =>
        old.map((m) => (m.id === id ? { ...m, isFavorite } : m))
      );
      if (selectedMedia?.id === id) {
        setSelectedMedia((prev: any) => ({ ...prev, isFavorite }));
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/albums", albumId, "media"], context.previous);
      }
      toast({ title: "Error", description: "Failed to update favorite", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "media"] });
    },
  });

  // Batch delete mutation — backs the "Select" multi-select mode.
  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return apiRequest("/api/media/batch-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "media"] });
      queryClient.invalidateQueries({ queryKey: ["/api/storage/usage"] });
      setSelectMode(false);
      setSelectedIds(new Set());
      toast({
        title: "Deleted",
        description: `${data.deletedCount} item${data.deletedCount === 1 ? "" : "s"} deleted.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete selected items", variant: "destructive" });
    },
  });

  // Batch move mutation — the other half of "Select" mode.
  const batchMoveMutation = useMutation({
    mutationFn: async ({ ids, targetAlbumId }: { ids: string[]; targetAlbumId: string }) => {
      return apiRequest("/api/media/batch-move", {
        method: "POST",
        body: JSON.stringify({ ids, albumId: targetAlbumId }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "media"] });
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      setSelectMode(false);
      setSelectedIds(new Set());
      setMoveDialogOpen(false);
      toast({
        title: "Moved",
        description: `${data.movedCount} item${data.movedCount === 1 ? "" : "s"} moved.`,
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to move selected items", variant: "destructive" });
    },
  });

  const toggleItemSelected = (item: any) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // Album sharing
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const shareMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/albums/${albumId}/share`, { method: "POST" });
    },
    onSuccess: (data: any) => {
      setShareUrl(data.shareUrl);
      setShareDialogOpen(true);
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't share album",
        description: error.message || "Failed to enable sharing",
        variant: "destructive",
      });
    },
  });

  const unshareMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/albums/${albumId}/unshare`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId] });
      toast({ title: "Sharing stopped", description: "The share link no longer works." });
    },
  });

  const handleShareClick = () => {
    if (album?.isPublic && album?.shareToken) {
      const baseUrl = window.location.origin;
      setShareUrl(`${baseUrl}/shared/${album.shareToken}`);
      setShareDialogOpen(true);
    } else {
      shareMutation.mutate();
    }
  };

  const handleMediaClick = (item: any) => {
    setSelectedMedia(item);
    setViewerOpen(true);
  };

  // Navigate within filteredMedia (not the full mediaItems) so prev/next in
  // the viewer stays consistent with whatever All/Photos/Videos filter is
  // currently active.
  const handleNextMedia = () => {
    const currentIndex = filteredMedia.findIndex((item: any) => item.id === selectedMedia?.id);
    if (currentIndex < filteredMedia.length - 1) {
      setSelectedMedia(filteredMedia[currentIndex + 1]);
    }
  };

  const handlePreviousMedia = () => {
    const currentIndex = filteredMedia.findIndex((item: any) => item.id === selectedMedia?.id);
    if (currentIndex > 0) {
      setSelectedMedia(filteredMedia[currentIndex - 1]);
    }
  };

  const currentMediaIndex = selectedMedia 
    ? filteredMedia.findIndex((item: any) => item.id === selectedMedia.id)
    : -1;
  
  const hasNext = currentMediaIndex >= 0 && currentMediaIndex < filteredMedia.length - 1;
  const hasPrevious = currentMediaIndex > 0;

  const handleDownload = async () => {
    if (!selectedMedia) return;
    
    try {
      toast({
        title: "Download started",
        description: `Downloading ${selectedMedia.filename}...`,
      });

      // Fetch the file as a blob for proper download
      const response = await fetch(selectedMedia.path);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = selectedMedia.filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      
      toast({
        title: "Download complete",
        description: `${selectedMedia.filename} saved to your device`,
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download the file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const initialStates: UploadFileState[] = fileArray.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      name: file.name,
      sizeLabel: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
      progress: 0,
      status: "uploading",
      isVideo: file.type.startsWith("video/"),
    }));

    setIsUploading(true);
    setUploadFiles(initialStates);

    const updateFile = (id: string, patch: Partial<UploadFileState>) => {
      setUploadFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    };

    try {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const batchSize = isMobile ? 1 : 3;
      
      for (let i = 0; i < fileArray.length; i += batchSize) {
        const batch = fileArray.slice(i, i + batchSize);
        const batchStates = initialStates.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (file, batchIdx) => {
            const fileId = batchStates[batchIdx].id;
            await uploadFile(file, albumId, (percent) => {
              updateFile(fileId, { progress: Math.round(percent) });
            });
            updateFile(fileId, { progress: 100, status: "done" });
          })
        );
      }

      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "media"] });
      queryClient.invalidateQueries({ queryKey: ["/api/storage/usage"] });
      toast({
        title: "✅ Upload complete!",
        description: `${fileArray.length} file(s) uploaded successfully.`,
      });
      setIsUploading(false);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload files",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  const handleUploadClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*';
    input.onchange = handleFileSelect as any;
    input.click();
  };

  const handleDeleteMedia = async () => {
    if (!selectedMedia) return;

    try {
      await deleteMediaMutation.mutateAsync(selectedMedia.id);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete media",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAlbum = async () => {
    try {
      await deleteAlbumMutation.mutateAsync();
      if (albumId) clearAlbumUnlockToken(albumId);
      toast({
        title: "Album deleted",
        description: `"${album?.name}" has been deleted.`,
        variant: "destructive",
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete album",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        showMenu={true}
        user={user ? { email: user.email } : undefined}
        onSettingsClick={() => setLocation("/settings")}
        onSearchClick={() => setLocation("/search")}
        onHomeClick={() => setLocation("/dashboard")}
        onMenuClick={() => setSidebarOpen(true)}
        onLogout={async () => {
          try {
            await logout();
            toast({
              title: "Logged out",
              description: "You have been logged out successfully.",
            });
            setLocation("/");
          } catch (error) {
            toast({
              title: "Error",
              description: "Failed to log out",
              variant: "destructive",
            });
          }
        }}
      />

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <AppSidebar 
            onNavigate={(path) => {
              setLocation(path);
              setSidebarOpen(false);
            }}
            currentPath={`/album/${albumId}`}
          />
        </SheetContent>
      </Sheet>

      <div className="flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <AppSidebar 
            onNavigate={setLocation}
            currentPath={`/album/${albumId}`}
          />
        </div>

        <div className="flex-1">
          <div className="sticky top-16 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/dashboard")}
              data-testid="button-back"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-display font-semibold truncate">
              {album?.name || "Album"}
            </h1>
          </div>

          {mediaItems.length > 0 && (
            <p className="hidden sm:block text-sm text-muted-foreground shrink-0">
              {photoCount} photo{photoCount === 1 ? "" : "s"}
              {videoCount > 0 && ` • ${videoCount} video${videoCount === 1 ? "" : "s"}`}
            </p>
          )}

          <div className="flex items-center gap-2">
            {mediaItems.length > 0 && !selectMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectMode(true)}
                className="rounded-2xl"
                data-testid="button-select-mode"
              >
                Select
              </Button>
            )}
            {selectMode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={exitSelectMode}
                className="rounded-2xl"
                data-testid="button-cancel-select"
              >
                Cancel
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleUploadClick}
              disabled={isUploading}
              className="rounded-2xl hidden md:flex"
              data-testid="button-upload-media"
            >
              <Upload className="h-4 w-4 mr-2" />
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-album-menu" aria-label="Album options">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-testid="button-edit-album">Edit Album</DropdownMenuItem>
                <DropdownMenuItem onClick={handleShareClick} data-testid="button-share-album">
                  {album?.isPublic ? "Copy Share Link" : "Share Album"}
                </DropdownMenuItem>
                {album?.isPublic && (
                  <DropdownMenuItem
                    onClick={() => unshareMutation.mutate()}
                    data-testid="button-stop-sharing"
                  >
                    Stop Sharing
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={handleDeleteAlbum}
                  data-testid="button-delete-album"
                >
                  Delete Album
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Filter pills, matching the Figma Album Detail screen. Favorites is
          now wired to a real backend field (media.isFavorite) rather than
          being decorative. */}
      {mediaItems.length > 0 && !selectMode && (
        <div className="container max-w-7xl mx-auto px-4 pt-4 flex gap-2">
          {([
            { key: "all", label: "All" },
            { key: "photos", label: "Photos" },
            { key: "videos", label: "Videos" },
            { key: "favorites", label: "Favorites" },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMediaFilter(tab.key)}
              className={`h-8 px-4 rounded-full text-[13px] font-semibold transition-colors ${
                mediaFilter === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/70"
              }`}
              data-testid={`filter-${tab.key}`}
              aria-pressed={mediaFilter === tab.key}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Selection count bar, shown instead of the filter pills while
          Select mode is active. */}
      {selectMode && (
        <div className="container max-w-7xl mx-auto px-4 pt-4">
          <p className="text-sm text-muted-foreground">
            {selectedIds.size} selected
          </p>
        </div>
      )}

      <main className="container max-w-7xl mx-auto p-4 md:p-6 lg:p-8 pb-28 lg:pb-8">
        {uploadFiles.length > 0 && (
          <div className="mb-6">
            <UploadProgressList
              files={uploadFiles}
              onClear={() => setUploadFiles([])}
            />
          </div>
        )}
        {isLoadingMedia ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading media...</p>
          </div>
        ) : mediaItems.length === 0 ? (
          <EmptyState
            icon="cloud"
            title="No media yet"
            description="Upload your first photos or videos to this album."
            actionLabel="Upload Media"
            onAction={handleUploadClick}
          />
        ) : filteredMedia.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No {mediaFilter} in this album yet.
            </p>
          </div>
        ) : (
          <MediaGrid
            items={filteredMedia}
            onItemClick={handleMediaClick}
            selectable={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleItemSelected}
          />
        )}
      </main>

          {/* Bottom batch-action bar, shown while items are selected in
              Select mode — matches the Figma multi-select affordance. */}
          {selectMode && selectedIds.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t shadow-[0_-2px_16px_0_rgba(16,24,40,0.08)] lg:pl-64">
              <div className="container max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold">{selectedIds.size} selected</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-2xl"
                    onClick={() => setMoveDialogOpen(true)}
                    disabled={otherAlbums.length === 0}
                    data-testid="button-batch-move"
                  >
                    Move to Album
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-2xl"
                    onClick={() => batchDeleteMutation.mutate(Array.from(selectedIds))}
                    disabled={batchDeleteMutation.isPending}
                    data-testid="button-batch-delete"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Share link dialog */}
          <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Share "{album?.name}"</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Anyone with this link can view this album's photos and videos — no SnapVault account required.
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 rounded-xl border bg-muted px-3 py-2 text-sm"
                  data-testid="input-share-url"
                />
                <Button
                  size="sm"
                  className="rounded-xl shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    toast({ title: "Link copied" });
                  }}
                  data-testid="button-copy-share-link"
                >
                  Copy
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Move-to-album dialog for the batch action above */}
          <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Move {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"} to…</DialogTitle>
              </DialogHeader>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {otherAlbums.map((a: any) => (
                  <button
                    key={a.id}
                    onClick={() =>
                      batchMoveMutation.mutate({ ids: Array.from(selectedIds), targetAlbumId: a.id })
                    }
                    disabled={batchMoveMutation.isPending}
                    className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-muted transition-colors text-sm font-medium"
                    data-testid={`move-target-${a.id}`}
                  >
                    {a.name}
                  </button>
                ))}
                {otherAlbums.length === 0 && (
                  <p className="text-sm text-muted-foreground px-3 py-2">
                    Create another album first to move items into it.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <FloatingActionButton onClick={handleUploadClick} label="Upload Media" />

          {selectedMedia && (
            <MediaViewer
              open={viewerOpen}
              onOpenChange={setViewerOpen}
              filename={selectedMedia.filename}
              type={selectedMedia.type}
              path={selectedMedia.path || ""}
              createdAt={selectedMedia.createdAt}
              isFavorite={!!selectedMedia.isFavorite}
              onToggleFavorite={() =>
                toggleFavoriteMutation.mutate({ id: selectedMedia.id, isFavorite: !selectedMedia.isFavorite })
              }
              onDownload={handleDownload}
              onDelete={handleDeleteMedia}
              onNext={handleNextMedia}
              onPrevious={handlePreviousMedia}
              hasNext={hasNext}
              hasPrevious={hasPrevious}
              items={filteredMedia}
              currentIndex={currentMediaIndex}
              onSelectIndex={(i) => setSelectedMedia(filteredMedia[i])}
            />
          )}
        </div>
      </div>
      
      <PinDialog
        open={showPinDialog}
        onOpenChange={(open) => {
          setShowPinDialog(open);
          if (!open && (!album || albumError || mediaError)) {
            setLocation("/dashboard");
          }
        }}
        onSubmit={handlePinSubmit}
        title="Enter Magic PIN"
        description="This album is protected. Enter your 4-digit Magic PIN to view it."
        isLoading={isPinLoading}
      />

      <Footer className="mt-8" />
      <BottomNav currentPath={`/album/${albumId}`} />
    </div>
  );
}
