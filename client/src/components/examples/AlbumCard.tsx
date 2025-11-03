import { AlbumCard } from "../AlbumCard";

export default function AlbumCardExample() {
  return (
    <div className="p-4 max-w-xs">
      <AlbumCard
        id="1"
        name="Vacation 2025"
        itemCount={42}
        onClick={() => console.log("Album clicked")}
      />
    </div>
  );
}
