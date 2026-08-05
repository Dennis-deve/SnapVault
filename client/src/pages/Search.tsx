import { Navbar } from "@/components/Navbar";
import { AppSidebar } from "@/components/AppSidebar";
import { SearchBar } from "@/components/SearchBar";
import { MediaGrid } from "@/components/MediaGrid";
import { MediaViewer } from "@/components/MediaViewer";
import { EmptyState } from "@/components/EmptyState";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl } from "@/lib/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
      return apiRequest(`/api/media/search?q=${encodeURIComponent(debouncedQuery)}`);
    },
    enabled: debouncedQuery.length > 0,
  });

  // Recent searches
  const { data: recentSearches = [] } = useQuery<{ id: string; query: string }[]>({
    queryKey: ["/api/search/recent"],
    enabled: searchQuery.length === 0,
  });

  const logSearchMutation = useMutation({
    mutationFn: async (query: string) => {
      return apiRequest("/api/search/recent", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/search/recent"] });
    },
  });

  const removeRecentSearchMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/search/recent/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/search/recent"] });
    },
  });

  const clearRecentSearchesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/search/recent", {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/search/recent"] });
    },
  });

  // Log a search once it settles
  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      logSearchMutation.mutate(debouncedQuery.trim());
    }
  }, [debouncedQuery]);

  // Favorite toggle mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      return apiRequest(`/api/media/${id}/favorite`, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite }),
      });
    },
    onSuccess: (_data, { id, isFavorite }) => {
      queryClient.setQueryData<Media[]>(["/api/media/search", debouncedQuery], (old = []) =>
        old.map((m) => (m.id === id ? { ...m, isFavorite: isFavorite ? 1 : 0 } : m))
      );
      setSelectedMedia((prev: Media | null) => (prev && prev.id === id ? { ...prev, isFavorite: isFavorite ? 1 : 0 } : prev));
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update favorite", variant: "destructive" });
    },
  });

  // Filter results based on selected filter
  const filteredResults = searchResults.filter((item) => {
    if (selectedFilter === "images") return item.type.startsWith("image/");
    if (selectedFilter === "videos") return item.type.startsWith("video/");
    if (selectedFilter === "favorites") return !!item.isFavorite;
    return true;
  });

  const filters = [
    { id: "all", label: "All" },
    { id: "images", label: "Images" },
    { id: "videos", label: "Videos" },
    { id: "favorites", label: "Favorites" },
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
      const res = await fetch(getApiUrl(`/api/media/${mediaId}`), {
        method: "DELETE",
        credentials: "include",
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

  const handleNextMedia = () => {
    const currentIndex = filteredResults.findIndex((item) => item.id === selectedMedia?.id);
    if (currentIndex < filteredResults.length - 1) {
      setSelectedMedia(filteredResults[currentIndex + 1]);
    }
  };

  const handlePreviousMedia = () => {
    const currentIndex = filteredResults.findIndex((item) => item.id === selectedMedia?.id);
    if (currentIndex > 0) {
      setSelectedMedia(filteredResults[currentIndex - 1]);
    }
  };

  const currentMediaIndex = selectedMedia 
    ? filteredResults.findIndex((item) => item.id === selectedMedia.id)
    : -1;
  
  const hasNext = currentMediaIndex >= 0 && currentMediaIndex < filteredResults.length - 1;
  const hasPrevious = currentMediaIndex > 0;

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

        <main className="flex-1 container max-w-7xl mx-auto p-4 md:p-6 lg:p-8 pb-28 lg:pb-8">
        <div className="space-y-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search photos and videos..."
          />

          <div className="flex gap-2 flex-wrap">
            {filters.map((filter) => {
              const isActive = selectedFilter === filter.id || (filter.id === "all" && selectedFilter === null);
              return (
                <button
                  key={filter.id}
                  onClick={() => setSelectedFilter(filter.id === "all" ? null : filter.id)}
                  className={`h-8 px-4 rounded-full text-[13px] font-semibold transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground hover:bg-muted/70"
                  }`}
                  data-testid={`filter-${filter.id}`}
                  aria-pressed={isActive}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {searchQuery.length === 0 ? (
            recentSearches.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[15px] font-bold">Recent Searches</p>
                  <button
                    onClick={() => clearRecentSearchesMutation.mutate()}
                    className="text-[13px] font-semibold text-primary"
                    data-testid="button-clear-recent-searches"
                  >
                    Clear All
                  </button>
                </div>
                <div className="space-y-1">
                  {recentSearches.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-2 rounded-xl hover:bg-muted transition-colors"
                    >
                      <button
                        onClick={() => setSearchQuery(entry.query)}
                        className="flex-1 text-left px-3 py-2.5 text-sm"
                        data-testid={`recent-search-${entry.id}`}
                      >
                        {entry.query}
                      </button>
                      <button
                        onClick={() => removeRecentSearchMutation.mutate(entry.id)}
                        className="h-8 w-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label={`Remove "${entry.query}" from recent searches`}
                        data-testid={`remove-recent-search-${entry.id}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon="search"
                title="Start searching"
                description="Search for photos and videos by name, date, or album."
              />
            )
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
              <p className="text-[15px] font-bold mb-4">
                Results &nbsp;•&nbsp; {filteredResults.length} item{filteredResults.length !== 1 ? 's' : ''}
              </p>
              <MediaGrid
                items={filteredResults.map(item => ({
                  id: item.id,
                  filename: item.filename,
                  type: item.type,
                  path: item.path,
                  isFavorite: item.isFavorite,
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
          items={filteredResults}
          currentIndex={currentMediaIndex}
          onSelectIndex={(i) => setSelectedMedia(filteredResults[i])}
        />
      )}
      
      <Footer className="mt-8" />
      <BottomNav currentPath="/search" />
    </div>
  );
}
