import { revalidatePath } from "next/cache";

/**
 * Call after any successful change to data the staff dashboard shows
 * (verification, status, judge assignments, scores, deletions, staff,
 * registration window, results). Next.js keeps visited pages in a
 * client-side cache, so without this, going back to the team list after
 * editing a team showed the list as it was before the edit until the next
 * live refresh. Revalidating from a Server Action clears that cache too.
 */
export function revalidateDashboard(): void {
  revalidatePath("/dashboard", "layout");
}
