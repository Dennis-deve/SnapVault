import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

interface CreateAlbumModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAlbum: (name: string, description?: string) => void;
}

export function CreateAlbumModal({ open, onOpenChange, onCreateAlbum }: CreateAlbumModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreateAlbum(name.trim(), description.trim() || undefined);
      setName("");
      setDescription("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display font-semibold">Create Album</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="album-name">Album Name</Label>
            <Input
              id="album-name"
              placeholder="Vacation 2025"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-2xl"
              data-testid="input-album-name"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="album-description">Description (Optional)</Label>
            <Textarea
              id="album-description"
              placeholder="Add a description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-2xl resize-none"
              rows={3}
              data-testid="input-album-description"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-2xl"
              data-testid="button-cancel-album"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              className="rounded-2xl"
              data-testid="button-create-album"
            >
              Create
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
