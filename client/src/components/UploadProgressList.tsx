import { CheckCircle2, ImageIcon, VideoIcon, X, AlertCircle, RotateCw, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadItemStatus } from "@/lib/uploadQueue";

export interface UploadFileState {
  id: string;
  name: string;
  sizeLabel: string;
  progress: number; // 0-100
  status: UploadItemStatus;
  isVideo: boolean;
  error?: string | null;
}

interface UploadProgressListProps {
  files: UploadFileState[];
  onClear?: () => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
}

const ICON_TINTS = ["#c7def3", "#b1d1e7", "#8ec1e2", "#bdd8ed", "#d1e4f4", "#a5cbe8"];

function StatusBadge({ file }: { file: UploadFileState }) {
  if (file.status === "error") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 shrink-0">
        <AlertCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    );
  }
  if (file.status === "cancelled") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground shrink-0">
        <Ban className="h-3.5 w-3.5" />
        Cancelled
      </span>
    );
  }
  if (file.status === "done") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400 shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Done
      </span>
    );
  }
  return null;
}

export function UploadProgressList({ files, onClear, onCancel, onRetry }: UploadProgressListProps) {
  const active = files.filter((f) => f.status !== "done" && f.status !== "error" && f.status !== "cancelled");
  const completed = files.filter((f) => f.status === "done");
  const failed = files.filter((f) => f.status === "error" || f.status === "cancelled");

  if (files.length === 0) return null;

  return (
    <div className="space-y-4 bg-card/60 p-4 rounded-2xl border shadow-sm" data-testid="upload-tracker">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <span>Upload Tracker</span>
          <span className="text-xs font-normal text-muted-foreground">
            ({completed.length}/{files.length} done{failed.length > 0 ? `, ${failed.length} need attention` : ""})
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

      {active.length > 0 && (
        <div className="space-y-3">
          {active.map((file, i) => (
            <div
              key={file.id}
              className="bg-background rounded-xl p-3 flex items-center gap-3 border"
              data-testid={`upload-item-${file.id}`}
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
                    {file.status === "compressing" ? "Preparing…" : `${file.progress}%`}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-1.5">{file.sizeLabel}</p>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-200"
                    style={{ width: `${file.status === "compressing" ? 2 : file.progress}%` }}
                  />
                </div>
              </div>
              {onCancel && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => onCancel(file.id)}
                  title="Cancel this upload"
                  data-testid={`upload-cancel-${file.id}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {failed.length > 0 && (
        <div className="space-y-2">
          {failed.map((file, i) => (
            <div
              key={file.id}
              className="bg-background rounded-xl p-2.5 flex items-center gap-3 border border-red-200 dark:border-red-900/50"
              data-testid={`upload-failed-${file.id}`}
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
                <p className="text-[11px] text-muted-foreground truncate" title={file.error ?? undefined}>
                  {file.error || (file.status === "cancelled" ? "Cancelled" : "Upload failed")}
                </p>
              </div>
              <StatusBadge file={file} />
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full text-xs shrink-0 gap-1"
                  onClick={() => onRetry(file.id)}
                  data-testid={`upload-retry-${file.id}`}
                >
                  <RotateCw className="h-3 w-3" />
                  Retry
                </Button>
              )}
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
              data-testid={`upload-done-${file.id}`}
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
              <StatusBadge file={file} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
