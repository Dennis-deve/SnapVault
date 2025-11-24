import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/AppSidebar";
import { MediaGrid } from "@/components/MediaGrid";
import { MediaViewer } from "@/components/MediaViewer";
import { EmptyState } from "@/components/EmptyState";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ArrowLeft, MoreVertical, Upload, Lock } from "lucide-react";
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { uploadFile } from "@/lib/upload";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null)[0];

  const albumId = params?.id;

  // Fetch album details
  const { data: album } = useQuery<any>({
    queryKey: ["/api/albums", albumId],
    enabled: !!albumId,
  });

  // Fetch media for this album (even if locked, user authenticated with PIN)
  const { data: mediaItems = [], isLoading: isLoadingMedia } = useQuery<any[]>({
    queryKey: ["/api/albums", albumId, "media"],
    enabled: !!albumId,
  });

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

  const handleMediaClick = (item: any) => {
    setSelectedMedia(item);
    setViewerOpen(true);
  };

  const handleNextMedia = () => {
    const currentIndex = mediaItems.findIndex((item: any) => item.id === selectedMedia?.id);
    if (currentIndex < mediaItems.length - 1) {
      setSelectedMedia(mediaItems[currentIndex + 1]);
    }
  };

  const handlePreviousMedia = () => {
    const currentIndex = mediaItems.findIndex((item: any) => item.id === selectedMedia?.id);
    if (currentIndex > 0) {
      setSelectedMedia(mediaItems[currentIndex - 1]);
    }
  };

  const currentMediaIndex = selectedMedia 
    ? mediaItems.findIndex((item: any) => item.id === selectedMedia.id)
    : -1;
  
  const hasNext = currentMediaIndex >= 0 && currentMediaIndex < mediaItems.length - 1;
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

    setIsUploading(true);

    try {
      const fileArray = Array.from(files);
      const totalFiles = fileArray.length;
      let completed = 0;

      // Upload files sequentially on mobile for better reliability (parallel can overwhelm mobile networks)
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const batchSize = isMobile ? 1 : 3;
      
      for (let i = 0; i < fileArray.length; i += batchSize) {
        const batch = fileArray.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (file) => {
            // Use upload helper with JWT authentication and progress tracking
            await uploadFile(file, albumId, (percent) => {
              console.log(`${file.name}: ${percent}%`);
            });

            completed++;
            
            // Show progress for multiple files
            if (totalFiles > 1) {
              toast({
                title: `📤 ${completed}/${totalFiles} uploaded`,
                description: file.name,
                duration: 2000,
              });
            }
          })
        );
      }

      queryClient.invalidateQueries({ queryKey: ["/api/albums", albumId, "media"] });
      toast({
        title: "✅ Upload complete!",
        description: `${totalFiles} file(s) uploaded successfully.`,
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
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-display font-semibold truncate">
              {album?.name || "Album"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
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
                <Button variant="ghost" size="icon" data-testid="button-album-menu">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-testid="button-edit-album">Edit Album</DropdownMenuItem>
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

      <main className="container max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
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
        ) : (
          <MediaGrid items={mediaItems} onItemClick={handleMediaClick} />
        )}
      </main>

          <FloatingActionButton onClick={handleUploadClick} label="Upload Media" />

          {selectedMedia && (
            <MediaViewer
              open={viewerOpen}
              onOpenChange={setViewerOpen}
              filename={selectedMedia.filename}
              type={selectedMedia.type}
              path={selectedMedia.path || ""}
              onDownload={handleDownload}
              onDelete={handleDeleteMedia}
              onNext={handleNextMedia}
              onPrevious={handlePreviousMedia}
              hasNext={hasNext}
              hasPrevious={hasPrevious}
            />
          )}
        </div>
      </div>
      
      <Footer className="mt-8" />
    </div>
  );
}
