import { UploadCard } from "../UploadCard";
import { useState } from "react";

export default function UploadCardExample() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = () => {
    setIsUploading(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsUploading(false);
          return 0;
        }
        return prev + 10;
      });
    }, 300);
  };

  return (
    <div className="p-4 max-w-2xl">
      <UploadCard
        onUploadClick={handleUpload}
        isUploading={isUploading}
        uploadProgress={progress}
      />
    </div>
  );
}
