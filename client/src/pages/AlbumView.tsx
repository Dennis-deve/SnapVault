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
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

  const albumId = params?.id;

  // Fetch album details
  const { data: album } = useQuery({
    queryKey: ["/api/albums", albumId],
    enabled: !!albumId,
  });

  // Fetch media for this album
  const { data: mediaItems = [], isLoading: isLoadingMedia } = useQuery({
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

  const handleDelete = async () => {
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
        showMenu={false}
        user={user ? { email: user.email } : undefined}
        onSettingsClick={() => setLocation("/settings")}
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
