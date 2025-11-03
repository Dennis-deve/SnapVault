import { CreateAlbumModal } from "../CreateAlbumModal";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function CreateAlbumModalExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p-4">
      <Button onClick={() => setOpen(true)}>Open Create Album Modal</Button>
      <CreateAlbumModal
        open={open}
        onOpenChange={setOpen}
        onCreateAlbum={(name, desc) => console.log("Create album:", name, desc)}
      />
    </div>
  );
}
