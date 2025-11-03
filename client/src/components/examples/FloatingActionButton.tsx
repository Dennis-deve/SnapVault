import { FloatingActionButton } from "../FloatingActionButton";

export default function FloatingActionButtonExample() {
  return (
    <div className="relative h-96 bg-muted/30">
      <FloatingActionButton onClick={() => console.log("FAB clicked")} />
    </div>
  );
}
