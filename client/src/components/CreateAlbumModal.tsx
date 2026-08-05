import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Lock } from "lucide-react";
import { useState } from "react";

interface CreateAlbumModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAlbum: (name: string, description?: string, isLocked?: boolean, pin?: string) => void;
  hasPin?: boolean;
}

export function CreateAlbumModal({ open, onOpenChange, onCreateAlbum, hasPin = false }: CreateAlbumModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      if (isLocked && pin.length !== 4) return;
      onCreateAlbum(name.trim(), description.trim() || undefined, isLocked, isLocked ? pin : undefined);
      setName("");
      setDescription("");
      setIsLocked(false);
      setPin("");
      onOpenChange(false);
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 4);
    setPin(val);
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

          <div className="space-y-3 pt-1 border-t">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="album-lock-toggle"
                checked={isLocked}
                onCheckedChange={(checked) => setIsLocked(!!checked)}
              />
              <Label htmlFor="album-lock-toggle" className="flex items-center gap-1.5 cursor-pointer font-medium">
                <Lock className="h-4 w-4 text-primary" />
                Protect with Magic PIN
              </Label>
            </div>

            {isLocked && (
              <div className="space-y-2 pl-6 animate-fade-in">
                <Label htmlFor="album-pin" className="text-xs text-muted-foreground">
                  {hasPin ? "Enter your 4-digit Magic PIN to lock" : "Set your 4-digit Magic PIN"}
                </Label>
                <Input
                  id="album-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={pin}
                  onChange={handlePinChange}
                  className="rounded-xl w-36 tracking-widest text-center text-lg"
                  required
                />
              </div>
            )}
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
              disabled={!name.trim() || (isLocked && pin.length !== 4)}
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
