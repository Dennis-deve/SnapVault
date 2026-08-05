import { CheckCircle2, ImageIcon, VideoIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface UploadFileState {
  id: string;
  name: string;
  sizeLabel: string;
  progress: number; // 0-100
  status: "uploading" | "done" | "error";
  isVideo: boolean;
}

interface UploadProgressListProps {
  files: UploadFileState[];
  onClear?: () => void;
}

const ICON_TINTS = ["#c7def3", "#b1d1e7", "#8ec1e2", "#bdd8ed", "#d1e4f4", "#a5cbe8"];

export function UploadProgressList({ files, onClear }: UploadProgressListProps) {
  const uploading = files.filter((f) => f.status === "uploading");
  const completed = files.filter((f) => f.status === "done");

  if (files.length === 0) return null;

  return (
    <div className="space-y-4 bg-card/60 p-4 rounded-2xl border shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <span>Upload Tracker</span>
          <span className="text-xs font-normal text-muted-foreground">
            ({completed.length}/{files.length} done)
          </span>
        </h3>
        {onClear && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
            onClick={onClear}
            title="Dismiss tracker"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {uploading.length > 0 && (
        <div className="space-y-3">
          {uploading.map((file, i) => (
            <div
              key={file.id}
              className="bg-background rounded-xl p-3 flex items-center gap-3 border"
            >
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: ICON_TINTS[i % ICON_TINTS.length] }}
              >
                {file.isVideo ? (
                  <VideoIcon className="h-4 w-4 text-white/90" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-white/90" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold truncate">{file.name}</p>
                  <span className="text-xs font-bold text-primary shrink-0">
                    {file.progress}%
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-1.5">{file.sizeLabel}</p>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-200"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-2">
          {completed.map((file, i) => (
            <div
              key={file.id}
              className="bg-background/80 rounded-xl p-2.5 flex items-center gap-3 border"
            >
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: ICON_TINTS[i % ICON_TINTS.length] }}
              >
                {file.isVideo ? (
                  <VideoIcon className="h-3.5 w-3.5 text-white/90" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 text-white/90" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">{file.sizeLabel}</p>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400 shrink-0">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Done
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
