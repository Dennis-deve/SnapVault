import { CheckCircle2, ImageIcon, VideoIcon } from "lucide-react";

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
}

// Soft blue tints cycling per row, matching the Figma prototype's upload
// screen thumbnail placeholders.
const ICON_TINTS = ["#c7def3", "#b1d1e7", "#8ec1e2", "#bdd8ed", "#d1e4f4", "#a5cbe8"];

export function UploadProgressList({ files }: UploadProgressListProps) {
  const uploading = files.filter((f) => f.status === "uploading");
  const completed = files.filter((f) => f.status === "done");

  if (files.length === 0) return null;

  return (
    <div className="space-y-5">
      {uploading.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[15px] font-bold" data-testid="text-uploading-count">
            Uploading ({uploading.length} of {files.length})
          </h3>
          <div className="space-y-3">
            {uploading.map((file, i) => (
              <div
                key={file.id}
                className="bg-card rounded-2xl shadow-sm p-3.5 flex items-center gap-3"
                data-testid={`upload-row-${file.id}`}
              >
                <div
                  className="h-[50px] w-[50px] rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: ICON_TINTS[i % ICON_TINTS.length] }}
                >
                  {file.isVideo ? (
                    <VideoIcon className="h-5 w-5 text-white/90" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-white/90" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{file.name}</p>
                    <span className="text-[13px] font-semibold text-primary shrink-0">
                      {file.progress}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{file.sizeLabel}</p>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[15px] font-bold">Completed</h3>
          <div className="space-y-2">
            {completed.map((file, i) => (
              <div
                key={file.id}
                className="bg-card rounded-2xl shadow-sm p-2.5 flex items-center gap-3"
                data-testid={`upload-row-${file.id}`}
              >
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: ICON_TINTS[i % ICON_TINTS.length] }}
                >
                  {file.isVideo ? (
                    <VideoIcon className="h-4 w-4 text-white/90" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-white/90" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{file.sizeLabel}</p>
                </div>
                <span className="flex items-center gap-1 text-[13px] font-semibold text-[#34c759] shrink-0">
                  <CheckCircle2 className="h-4 w-4" />
                  Done
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
