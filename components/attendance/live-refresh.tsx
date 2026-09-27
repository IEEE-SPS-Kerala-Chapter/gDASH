"use client";

import { useLiveRefresh } from "@/components/admin/use-live-refresh";

/** Keeps the attendance page current while scanning is happening. */
export function AttendanceLiveRefresh() {
  useLiveRefresh({ intervalMs: 15_000 });
  return null;
}
