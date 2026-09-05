import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { UploadCard } from "@/components/UploadCard";
import { UploadModal } from "@/components/UploadModal";
import { useUploadQueue, useCompletedCounter } from "@/lib/uploadQueue";
import { AlbumCard } from "@/components/AlbumCard";
import { CreateAlbumCard } from "@/components/CreateAlbumCard";
import { EmptyState } from "@/components/EmptyState";
import { CreateAlbumModal } from "@/components/CreateAlbumModal";
import { MediaViewer } from "@/components/MediaViewer";
import { PinDialog } from "@/components/PinDialog";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Video, Image as ImageIcon, FolderOpen, Upload } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { setAlbumUnlockToken, clearAlbumUnlockToken } from "@/lib/albumUnlock";
import { StorageCard } from "@/components/StorageCard";
import { UploadProgressList, type UploadFileState } from "@/components/UploadProgressList";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // One shared, app-wide upload queue (bounded parallelism, per-file
  // cancel/retry, stable upload ids for server-side dedup).
  const { items: uploadFiles, enqueue, cancel, retry, clearFinished } = useUploadQueue();
  const isUploading = uploadFiles.some((f) => f.status !== "done" && f.status !== "error" && f.status !== "cancelled");
  const lastSeenDone = useCompletedCounter(uploadFiles);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinAction, setPinAction] = useState<{ albumId: string; action: 'lock' | 'unlock' | 'view' } | null>(null);
  const [isPinLoading, setIsPinLoading] = useState(false);

  // Fetch albums from backend
  const { data: albums = [], isLoading: isLoadingAlbums } = useQuery<any[]>({
    queryKey: ["/api/albums"],
    enabled: !!user,
  });

  // Storage usage — powers the StorageCard below (previously built but
  // never wired up to real data).
  const { data: storageUsage } = useQuery<{ usedGB: number; totalGB: number }>({
    queryKey: ["/api/storage/usage"],
    enabled: !!user,
  });

  // Create album mutation
  const createAlbumMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; isLocked?: boolean; pin?: string }) => {
      return apiRequest("/api/albums", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const handleUploadClick = () => {
    if (albums.length === 0) {
      toast({
        title: "No albums",
        description: "Please create an album first before uploading media.",
        variant: "destructive",
      });
      return;
    }
    setShowUploadModal(true);
  };

  const handleAlbumSelectForUpload = async (albumId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*';
    // Many Android Chrome/WebView builds silently fail to open the native
    // picker when the input is never attached to the DOM — keep it
    // invisible but present in the document, and clean it up afterwards.
    input.style.position = 'fixed';
    input.style.top = '-1000px';
    input.style.left = '-1000px';
    input.style.opacity = '0';
    document.body.appendChild(input);

    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.onchange = (e: any) => {
      const files = e.target?.files;
      if (!files || files.length === 0) {
        cleanup();
        return;
      }
      // Enqueue everything; the shared queue owns concurrency, retries,
      // cancellation and progress. One bad file can't stop the rest.
      enqueue(Array.from(files) as File[], albumId);
      toast({
        title: "Uploading…",
        description: `${files.length} file(s) queued.`,
      });
      cleanup();
    };

    input.click();
  };

  // When uploads for this view complete, refresh what they changed.
  useEffect(() => {
    if (lastSeenDone > 0) {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
      queryClient.invalidateQueries({ queryKey: ["/api/storage/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/media"] });
    }
  }, [lastSeenDone]);

  const handleCreateAlbum = async (name: string, description?: string, isLocked?: boolean, pin?: string) => {
    try {
      await createAlbumMutation.mutateAsync({ name, description, isLocked, pin });
      toast({
        title: "Album created!",
        description: `"${name}" has been created successfully${isLocked ? ' and protected with PIN' : ''}.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create album",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
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
  };

  const handleLockToggle = (albumId: string) => {
    const album = albums.find((a: any) => a.id === albumId);
    if (!album) return;

    // Check if user has set up a Magic PIN
    if (!user?.pin) {
      toast({
        title: "No Magic PIN",
        description: "Please set up a Magic PIN in Settings first.",
        variant: "destructive",
      });
      setLocation("/settings");
      return;
    }

    setPinAction({ albumId, action: album.isLocked ? 'unlock' : 'lock' });
    setShowPinDialog(true);
  };

  const handlePinSubmit = async (pin: string) => {
    if (!pinAction) return;

    setIsPinLoading(true);
    try {
      if (pinAction.action === 'view') {
        const { unlockToken } = await apiRequest(`/api/albums/${pinAction.albumId}/unlock-session`, {
          method: "POST",
          body: JSON.stringify({ pin }),
        });

        if (unlockToken) {
          setAlbumUnlockToken(pinAction.albumId, unlockToken);
        }

        setShowPinDialog(false);
        setPinAction(null);
        setLocation(`/album/${pinAction.albumId}`);
        return;
      }

      // Direct lock/unlock API call (server verifies PIN)
      const endpoint = `/api/albums/${pinAction.albumId}/${pinAction.action}`;
      await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({ pin }),
      });

      if (pinAction.action === 'lock') {
        clearAlbumUnlockToken(pinAction.albumId);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });

      toast({
        title: pinAction.action === 'lock' ? "Album Locked" : "Album Unlocked",
        description: `The album has been ${pinAction.action}ed successfully.`,
      });

      setShowPinDialog(false);
      setPinAction(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Invalid PIN",
        variant: "destructive",
      });
    } finally {
      setIsPinLoading(false);
    }
  };

  const videoAlbums = albums.filter((album: any) => album.name.toLowerCase().includes('video') || album.itemCount === 0);
  const photoAlbums = albums.filter((album: any) => !album.name.toLowerCase().includes('video') || album.itemCount === 0);

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        showMenu={true}
        user={user ? { email: user.email } : undefined}
        onSettingsClick={() => setLocation("/settings")}
        onLogout={handleLogout}
        onSearchClick={() => setLocation("/search")}
        onHomeClick={() => setLocation("/dashboard")}
        onMenuClick={() => setSidebarOpen(true)}
      />

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <AppSidebar 
            onNavigate={(path) => {
              setLocation(path);
              setSidebarOpen(false);
            }}
            currentPath="/dashboard"
          />
        </SheetContent>
      </Sheet>

      <div className="flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <AppSidebar 
            onNavigate={setLocation}
            currentPath="/dashboard"
          />
        </div>

        <main className="flex-1 container max-w-7xl mx-auto p-4 md:p-6 lg:p-8 pb-32 lg:pb-8">
          <div className="space-y-4">
            {/* Compact Top Bar - Visible above the fold without scrolling */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/50 p-4 rounded-xl border">
              <div>
                <h1 className="text-xl font-display font-bold">Welcome back!</h1>
                <p className="text-xs text-muted-foreground">Organize and access your cloud media</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {storageUsage && (
                  <div className="bg-background border px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5 text-primary" />
                    <span>{storageUsage.usedGB.toFixed(1)} GB used</span>
                  </div>
                )}
                <Button onClick={handleUploadClick} size="sm" className="gap-1.5 shadow-sm">
                  <Upload className="h-3.5 w-3.5" />
                  Upload Media
                </Button>
              </div>
            </div>

            {/* Per-file upload progress */}
            {uploadFiles.length > 0 && (
              <UploadProgressList
                files={uploadFiles.map((f) => ({
                  ...f,
                  sizeLabel: formatFileSize(f.size),
                  isVideo: f.type.startsWith("video/"),
                }))}
                onClear={clearFinished}
                onCancel={cancel}
                onRetry={retry}
              />
            )}

          {/* Tabbed Albums Section */}
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3 max-w-md">
              <TabsTrigger value="all" className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                All Albums
              </TabsTrigger>
              <TabsTrigger value="videos" className="flex items-center gap-2">
                <Video className="h-4 w-4" />
                Videos
              </TabsTrigger>
              <TabsTrigger value="photos" className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Photos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-display font-semibold">All Albums</h2>
                  <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Create Album
                  </Button>
                </div>

                {isLoadingAlbums ? (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground">Loading albums...</p>
                  </div>
                ) : albums.length === 0 ? (
                  <EmptyState
                    icon="folder"
                    title="No albums yet"
                    description="Create your first album to start organizing your photos and videos."
                    actionLabel="Create Album"
                    onAction={() => setShowCreateModal(true)}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <div className="animate-scale-in">
                      <CreateAlbumCard onClick={() => setShowCreateModal(true)} />
                    </div>
                    {albums.map((album: any, index: number) => (
                      <div 
                        key={album.id}
                        className={`animate-scale-in ${index % 6 === 0 ? 'stagger-1' : index % 6 === 1 ? 'stagger-2' : index % 6 === 2 ? 'stagger-3' : index % 6 === 3 ? 'stagger-4' : index % 6 === 4 ? 'stagger-5' : 'stagger-6'}`}
                      >
                        <AlbumCard
                          id={album.id}
                          name={album.name}
                          itemCount={album.itemCount}
                          thumbnail={album.thumbnail}
                          isLocked={album.isLocked === 1}
                          onClick={() => {
                            if (album.isLocked === 1) {
                              setPinAction({ albumId: album.id, action: 'view' });
                              setShowPinDialog(true);
                            } else {
                              setLocation(`/album/${album.id}`);
                            }
                          }}
                          onLockToggle={handleLockToggle}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="videos" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-display font-semibold">Video Albums</h2>
                  <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Create Video Album
                  </Button>
                </div>

                {videoAlbums.length === 0 ? (
                  <EmptyState
                    icon="video"
                    title="No video albums yet"
                    description="Create a video album to organize your video content."
                    actionLabel="Create Video Album"
                    onAction={() => setShowCreateModal(true)}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <div className="animate-scale-in">
                      <CreateAlbumCard onClick={() => setShowCreateModal(true)} />
                    </div>
                    {videoAlbums.map((album: any, index: number) => (
                      <div 
                        key={album.id}
                        className={`animate-scale-in ${index % 6 === 0 ? 'stagger-1' : index % 6 === 1 ? 'stagger-2' : index % 6 === 2 ? 'stagger-3' : index % 6 === 3 ? 'stagger-4' : index % 6 === 4 ? 'stagger-5' : 'stagger-6'}`}
                      >
                        <AlbumCard
                          id={album.id}
                          name={album.name}
                          itemCount={album.itemCount}
                          thumbnail={album.thumbnail}
                          isLocked={album.isLocked === 1}
                          onClick={() => {
                            if (album.isLocked === 1) {
                              setPinAction({ albumId: album.id, action: 'view' });
                              setShowPinDialog(true);
                            } else {
                              setLocation(`/album/${album.id}`);
                            }
                          }}
                          onLockToggle={handleLockToggle}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="photos" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-display font-semibold">Photo Albums</h2>
                  <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Create Photo Album
                  </Button>
                </div>

                {photoAlbums.length === 0 ? (
                  <EmptyState
                    icon="image"
                    title="No photo albums yet"
                    description="Create a photo album to organize your images."
                    actionLabel="Create Photo Album"
                    onAction={() => setShowCreateModal(true)}
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <div className="animate-scale-in">
                      <CreateAlbumCard onClick={() => setShowCreateModal(true)} />
                    </div>
                    {photoAlbums.map((album: any, index: number) => (
                      <div 
                        key={album.id}
                        className={`animate-scale-in ${index % 6 === 0 ? 'stagger-1' : index % 6 === 1 ? 'stagger-2' : index % 6 === 2 ? 'stagger-3' : index % 6 === 3 ? 'stagger-4' : index % 6 === 4 ? 'stagger-5' : 'stagger-6'}`}
                      >
                        <AlbumCard
                          id={album.id}
                          name={album.name}
                          itemCount={album.itemCount}
                          thumbnail={album.thumbnail}
                          isLocked={album.isLocked === 1}
                          onClick={() => {
                            if (album.isLocked === 1) {
                              setPinAction({ albumId: album.id, action: 'view' });
                              setShowPinDialog(true);
                            } else {
                              setLocation(`/album/${album.id}`);
                            }
                          }}
                          onLockToggle={handleLockToggle}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
          </div>
        </main>
      </div>

      <BottomNav currentPath="/dashboard" onUploadClick={handleUploadClick} />

      <CreateAlbumModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreateAlbum={handleCreateAlbum}
        hasPin={!!user?.pin}
      />

      <UploadModal
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
        albums={albums}
        onAlbumSelect={handleAlbumSelectForUpload}
      />

      <PinDialog
        open={showPinDialog}
        onOpenChange={(open) => {
          setShowPinDialog(open);
          if (!open) setPinAction(null);
        }}
        onSubmit={handlePinSubmit}
        title={
          pinAction?.action === 'lock' ? "Lock Album" : 
          pinAction?.action === 'unlock' ? "Unlock Album" : 
          "Enter PIN to View"
        }
        description={
          pinAction?.action === 'lock' ? "Enter your Magic PIN to lock this album." :
          pinAction?.action === 'unlock' ? "Enter your Magic PIN to unlock this album." :
          "This album is locked. Enter your Magic PIN to view it."
        }
        isLoading={isPinLoading}
      />
      
      <Footer className="mt-8" />
    </div>
  );
}
