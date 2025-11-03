import { Navbar } from "@/components/Navbar";
import { UploadCard } from "@/components/UploadCard";
import { AlbumCard } from "@/components/AlbumCard";
import { CreateAlbumCard } from "@/components/CreateAlbumCard";
import { EmptyState } from "@/components/EmptyState";
import { CreateAlbumModal } from "@/components/CreateAlbumModal";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch albums from backend
  const { data: albums = [], isLoading: isLoadingAlbums } = useQuery({
    queryKey: ["/api/albums"],
    enabled: !!user,
  });

  // Create album mutation
  const createAlbumMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest("/api/albums", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/albums"] });
    },
  });

  const handleUpload = () => {
    setIsUploading(true);
    setUploadProgress(0);
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          toast({
            title: "Upload complete!",
            description: "Your files have been uploaded successfully.",
          });
          return 0;
        }
        return prev + 10;
      });
    }, 300);
  };

  const handleCreateAlbum = async (name: string, description?: string) => {
    try {
      await createAlbumMutation.mutateAsync({ name, description });
      toast({
        title: "Album created!",
        description: `"${name}" has been created successfully.`,
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        showMenu={false}
        user={user ? { email: user.email } : undefined}
        onSettingsClick={() => setLocation("/settings")}
        onLogout={handleLogout}
      />

      <main className="container max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-6">
          <UploadCard
            onUploadClick={handleUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
          />

          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-semibold">My Albums</h2>
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
                <CreateAlbumCard onClick={() => setShowCreateModal(true)} />
                {albums.map((album: any) => (
                  <AlbumCard
                    key={album.id}
                    id={album.id}
                    name={album.name}
                    itemCount={album.itemCount}
                    onClick={() => setLocation(`/album/${album.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <FloatingActionButton
        onClick={() => setShowCreateModal(true)}
        label="Create Album"
      />

      <CreateAlbumModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreateAlbum={handleCreateAlbum}
      />
    </div>
  );
}
