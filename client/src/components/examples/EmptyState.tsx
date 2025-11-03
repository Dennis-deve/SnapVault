import { EmptyState } from "../EmptyState";

export default function EmptyStateExample() {
  return (
    <div className="p-4">
      <EmptyState
        icon="folder"
        title="No albums yet"
        description="Create your first album to start organizing your photos and videos."
        actionLabel="Create Album"
        onAction={() => console.log("Action clicked")}
      />
    </div>
  );
}
