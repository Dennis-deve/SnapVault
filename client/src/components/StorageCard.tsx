import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { HardDrive } from "lucide-react";

interface StorageCardProps {
  usedGB: number;
  totalGB: number;
}

export function StorageCard({ usedGB, totalGB }: StorageCardProps) {
  const percentage = (usedGB / totalGB) * 100;

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <HardDrive className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-lg">Storage</h3>
            <p className="text-sm text-muted-foreground" data-testid="text-storage-usage">
              {usedGB.toFixed(1)} GB / {totalGB} GB
            </p>
          </div>
          <Progress value={percentage} className="h-2 mb-2" />
          <p className="text-sm text-muted-foreground">
            {(totalGB - usedGB).toFixed(1)} GB available
          </p>
        </div>
      </div>
    </Card>
  );
}
