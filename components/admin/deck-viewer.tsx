"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDeckDownloadUrl } from "@/app/actions/admin";

/**
 * Shows the uploaded deck inline via an iframe in a modal, rather than
 * opening it in a new tab — signed URL is fetched fresh each time the
 * dialog opens (5-minute expiry from getDeckDownloadUrl).
 */
export function DeckViewer({ deckPath }: { deckPath: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function handleOpen() {
    setLoading(true);
    const result = await getDeckDownloadUrl(deckPath);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setUrl(result.url);
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={loading} onClick={handleOpen}>
        {loading ? "Opening…" : "View deck"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl">
          <DialogHeader>
            <DialogTitle>Uploaded deck</DialogTitle>
          </DialogHeader>
          {url && (
            <iframe
              src={url}
              title="Uploaded deck"
              className="h-[75vh] w-full rounded-md border"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
