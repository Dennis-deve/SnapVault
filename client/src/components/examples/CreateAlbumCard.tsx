import { CreateAlbumCard } from "../CreateAlbumCard";

export default function CreateAlbumCardExample() {
  return (
    <div className="p-4 max-w-xs">
      <CreateAlbumCard onClick={() => console.log("Create album clicked")} />
    </div>
  );
}
