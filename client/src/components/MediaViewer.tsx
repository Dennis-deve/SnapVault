import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

interface MediaViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  type: string;
  path: string;
  onDownload?: () => void;
}

export function MediaViewer({ open, onOpenChange, filename, type, path, onDownload }: MediaViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-0 bg-background">
        <div className="relative h-[95vh] flex flex-col">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <Button
              size="icon"
              variant="secondary"
              className="rounded-full h-10 w-10"
              onClick={onDownload}
              data-testid="button-download"
            >
              <Download className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="rounded-full h-10 w-10"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-viewer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 flex items-center justify-center p-12">
            {type.startsWith('image/') ? (
              <img
                src={path}
                alt={filename}
                className="max-w-full max-h-full object-contain"
              />
            ) : type.startsWith('video/') ? (
              <video
                src={path}
                controls
                className="max-w-full max-h-full"
              />
            ) : null}
          </div>

          <div className="p-4 border-t bg-card">
            <p className="text-sm font-medium text-center truncate">{filename}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
