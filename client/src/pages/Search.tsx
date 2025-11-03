import { Navbar } from "@/components/Navbar";
import { SearchBar } from "@/components/SearchBar";
import { MediaGrid } from "@/components/MediaGrid";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useLocation } from "wouter";

export default function Search() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);

  // todo: remove mock functionality
  const mockResults = searchQuery.length > 0 ? [
    { id: "1", filename: "IMG_1001.jpg", type: "image/jpeg", path: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400" },
    { id: "2", filename: "IMG_1002.jpg", type: "image/jpeg", path: "https://images.unsplash.com/photo-1511593358241-7eea1f3c84e5?w=400" },
  ] : [];

  const filters = [
    { id: "all", label: "All" },
    { id: "images", label: "Images" },
    { id: "videos", label: "Videos" },
    { id: "recent", label: "Recent" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        showMenu={false}
        user={{ email: "user@example.com" }}
        onSettingsClick={() => setLocation("/settings")}
        onLogout={() => setLocation("/")}
      />

      <main className="container max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
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
          ) : mockResults.length === 0 ? (
            <EmptyState
              icon="search"
              title="No results found"
              description={`No media found matching "${searchQuery}".`}
            />
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Found {mockResults.length} results
              </p>
              <MediaGrid
                items={mockResults}
                onItemClick={(item) => console.log("Media clicked:", item)}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
