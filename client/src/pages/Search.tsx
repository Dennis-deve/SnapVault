import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/AppSidebar";
import { SearchBar } from "@/components/SearchBar";
import { MediaGrid } from "@/components/MediaGrid";
import { MediaViewer } from "@/components/MediaViewer";
import { EmptyState } from "@/components/EmptyState";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Media } from "@shared/schema";

export default function Search() {
  const [, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<Media | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch search results
  const { data: searchResults = [], isLoading } = useQuery<Media[]>({
    queryKey: ["/api/media/search", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return [];
      const res = await fetch(`/api/media/search?q=${encodeURIComponent(debouncedQuery)}`);
      if (!res.ok) throw new Error("Failed to search media");
      return res.json();
    },
    enabled: debouncedQuery.length > 0,
  });

  // Filter results based on selected filter
  const filteredResults = searchResults.filter((item) => {
    if (selectedFilter === "images") return item.type.startsWith("image/");
    if (selectedFilter === "videos") return item.type.startsWith("video/");
    return true;
  });

  const filters = [
    { id: "all", label: "All" },
    { id: "images", label: "Images" },
    { id: "videos", label: "Videos" },
  ];

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

  // Delete media mutation
  const deleteMediaMutation = useMutation({
    mutationFn: async (mediaId: string) => {
      const res = await fetch(`/api/media/${mediaId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete media");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media/search"] });
      setSelectedMedia(null);
      setViewerOpen(false);
      toast({
        title: "Success",
        description: "Media deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDeleteMedia = () => {
    if (!selectedMedia) return;
    deleteMediaMutation.mutate(selectedMedia.id);
  };

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
            currentPath="/search"
          />
        </SheetContent>
      </Sheet>

      <div className="flex">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <AppSidebar 
            onNavigate={setLocation}
            currentPath="/search"
          />
        </div>

        <main className="flex-1 container max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
        <div className="space-y-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search photos and videos..."
          />

          <div className="flex gap-2 flex-wrap">
            {filters.map((filter) => (
              <Badge
                key={filter.id}
                variant={selectedFilter === filter.id ? "default" : "outline"}
                className="cursor-pointer rounded-2xl px-4 py-2 hover-elevate"
                onClick={() => setSelectedFilter(filter.id === selectedFilter ? null : filter.id)}
                data-testid={`filter-${filter.id}`}
              >
                {filter.label}
              </Badge>
            ))}
          </div>

          {searchQuery.length === 0 ? (
            <EmptyState
              icon="search"
              title="Start searching"
              description="Search for photos and videos by name, date, or album."
            />
          ) : isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredResults.length === 0 ? (
            <EmptyState
              icon="search"
              title="No results found"
              description={`No media found matching "${searchQuery}".`}
            />
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Found {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
              </p>
              <MediaGrid
                items={filteredResults.map(item => ({
                  id: item.id,
                  filename: item.filename,
                  type: item.type,
                  path: item.path,
                }))}
                onItemClick={(item) => {
                  const mediaItem = filteredResults.find(m => m.id === item.id);
                  if (mediaItem) {
                    setSelectedMedia(mediaItem);
                    setViewerOpen(true);
                  }
                }}
              />
            </div>
          )}
        </div>
        </main>
      </div>

      {/* Media Viewer */}
      {selectedMedia && (
        <MediaViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          filename={selectedMedia.filename}
          type={selectedMedia.type}
          path={selectedMedia.path}
          onDelete={handleDeleteMedia}
        />
      )}
      
      <Footer className="mt-8" />
    </div>
  );
}
