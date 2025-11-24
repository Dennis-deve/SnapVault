import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MediaViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  type: string;
  path: string;
  onDownload?: () => void;
  onDelete?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

export function MediaViewer({ 
  open, 
  onOpenChange, 
  filename, 
  type, 
  path, 
  onDownload, 
  onDelete,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious
}: MediaViewerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 border-0 bg-background">
        <div className="relative h-[95vh] flex flex-col">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            {onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="rounded-full h-10 w-10"
                    data-testid="button-delete"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this media?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the media file.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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

          {/* Previous Button */}
          {hasPrevious && onPrevious && (
            <Button
              size="icon"
              variant="secondary"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full h-12 w-12 shadow-lg"
              onClick={onPrevious}
              data-testid="button-previous"
              title="Previous media"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}

          {/* Next Button */}
          {hasNext && onNext && (
            <Button
              size="icon"
              variant="secondary"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full h-12 w-12 shadow-lg"
              onClick={onNext}
              data-testid="button-next"
              title="Next media"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}

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
