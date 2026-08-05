import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface FloatingActionButtonProps {
  onClick?: () => void;
  label?: string;
}

export function FloatingActionButton({ onClick, label = "Add" }: FloatingActionButtonProps) {
  return (
    <Button
      onClick={onClick}
      size="icon"
      className="fixed bottom-24 right-6 h-14 w-14 rounded-full shadow-xl md:hidden z-40"
      data-testid="button-fab"
    >
      <Plus className="h-6 w-6" />
      <span className="sr-only">{label}</span>
    </Button>
  );
}
