"use server";

import { createClient } from "@/lib/supabase/server";
import { buildUploadPath } from "@/lib/upload-path";

const BUCKETS = { "id-card": "member-id-cards", deck: "registration-decks" } as const;
export type UploadKind = keyof typeof BUCKETS;

/**
 * A one-time signed upload link into the signed-in leader's own folder.
 * The browser uploads the file straight to Supabase Storage with it (so
 * large decks don't pass through our server), without needing access to
 * the session. Storage records the leader as the file's owner, which is
 * what owns_upload() checks at submission. The storage insert policy still
 * applies when the link is created, and the buckets still enforce their
 * file-type and size limits on upload.
 */
export async function createUploadUrl(
  kind: UploadKind,
  fileName: string,
): Promise<{ success: true; path: string; token: string } | { success: false; error: string }> {
  const bucket = BUCKETS[kind];
  if (!bucket || !fileName || fileName.length > 200) {
    return { success: false, error: "Upload failed. Try again." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Your session has expired. Sign in again to upload." };
  }
  const path = buildUploadPath(user.id, fileName);
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) {
    return { success: false, error: "Upload failed. Try again." };
  }
  return { success: true, path: data.path, token: data.token };
}
