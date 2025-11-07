import { Cloud, FolderOpen, Search, Video, Image } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: "cloud" | "folder" | "search" | "video" | "image";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = "folder",
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const Icon = 
    icon === "cloud" ? Cloud : 
    icon === "search" ? Search : 
    icon === "video" ? Video :
    icon === "image" ? Image :
    FolderOpen;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="h-24 w-24 rounded-full bg-muted/50 flex items-center justify-center mb-6">
        <Icon className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2 text-center">{title}</h3>
      <p className="text-muted-foreground text-center max-w-md mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="rounded-2xl" data-testid="button-empty-action">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
