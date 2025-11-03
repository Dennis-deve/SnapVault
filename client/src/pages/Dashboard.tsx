import { Navbar } from "@/components/Navbar";
import { UploadCard } from "@/components/UploadCard";
import { StorageCard } from "@/components/StorageCard";
import { AlbumCard } from "@/components/AlbumCard";
import { CreateAlbumCard } from "@/components/CreateAlbumCard";
import { EmptyState } from "@/components/EmptyState";
import { CreateAlbumModal } from "@/components/CreateAlbumModal";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // todo: remove mock functionality
  const [albums, setAlbums] = useState([
    { id: "1", name: "Vacation 2025", itemCount: 42 },
    { id: "2", name: "Family Photos", itemCount: 128 },
    { id: "3", name: "Work Events", itemCount: 35 },
  ]);

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

  const handleCreateAlbum = (name: string, description?: string) => {
    const newAlbum = {
      id: Date.now().toString(),
      name,
      itemCount: 0,
    };
    setAlbums([...albums, newAlbum]);
    toast({
      title: "Album created!",
      description: `"${name}" has been created successfully.`,
    });
  };

  const handleLogout = () => {
    toast({
      title: "Logged out",
      description: "You have been logged out successfully.",
    });
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        showMenu={false}
        user={{ email: "user@example.com" }}
        onSettingsClick={() => setLocation("/settings")}
        onLogout={handleLogout}
      />

      <main className="container max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <UploadCard
              onUploadClick={handleUpload}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
            />
            <StorageCard usedGB={3.2} totalGB={5} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-semibold">My Albums</h2>
            </div>

            {albums.length === 0 ? (
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
                {albums.map((album) => (
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
