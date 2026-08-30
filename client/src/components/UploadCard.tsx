import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface UploadCardProps {
  onUploadClick?: () => void;
  isUploading?: boolean;
  uploadProgress?: number;
}

export function UploadCard({ onUploadClick, isUploading, uploadProgress = 0 }: UploadCardProps) {
  return (
    <Card className="p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Upload Media</h3>
              <p className="text-sm text-muted-foreground">Photos and videos</p>
            </div>
          </div>
          <Button
            onClick={onUploadClick}
            disabled={isUploading}
            className="rounded-2xl"
            data-testid="button-upload"
          >
            {isUploading ? 'Uploading...' : 'Select Files'}
          </Button>
        </div>
        {isUploading && uploadProgress !== undefined && (
          <div className="w-full space-y-2">
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              {uploadProgress}% uploaded
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
