"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Page<T> = { items: T[]; total: number };

/** Rows per page: 30, or ?pageSize=N (1–100) in the URL — handy for testing scrolling with few teams. */
export function pageSizeFrom(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 30;
}

/**
 * A list that loads page by page as you scroll (the dashboard team lists).
 * `queryKey` identifies the current search/filters/sort — when it changes,
 * the list starts again from the top. Attach `sentinelRef` to an element
 * after the last row: when it scrolls into view the next page loads.
 * A slow response for an older query never overwrites a newer one.
 */
export function usePagedList<T>({
  initialItems,
  initialTotal,
  queryKey,
  pageSize,
  load,
}: {
  initialItems: T[];
  initialTotal: number;
  queryKey: string;
  pageSize: number;
  load: (offset: number, limit: number) => Promise<Page<T> | null>;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      const id = ++request.current;
      setLoading(true);
      setFailed(false);
      const page = await loadRef.current(offset, pageSize).catch(() => null);
      if (id !== request.current) return; // a newer query or reload took over
      setLoading(false);
      if (!page) {
        setFailed(true);
        return;
      }
      setTotal(page.total);
      setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
    },
    [pageSize],
  );

  // A new search/filter/sort starts from the top (not on first render —
  // the server already sent page one).
  const firstKey = useRef(queryKey);
  useEffect(() => {
    if (queryKey === firstKey.current) return;
    firstKey.current = queryKey;
    void fetchPage(0, true);
  }, [queryKey, fetchPage]);

  const hasMore = items.length < total;

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    void fetchPage(itemsRef.current.length, false);
  }, [loading, hasMore, fetchPage]);

  const reload = useCallback(() => fetchPage(0, true), [fetchPage]);

  // Loads the next page when the marker after the last row comes near the
  // bottom of the screen.
  const observer = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const sentinelRef = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!node) return;
    observer.current = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMoreRef.current();
    }, { rootMargin: "400px" });
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  return { items, setItems, total, loading, failed, hasMore, loadMore, reload, sentinelRef };
}

/**
 * Runs `task` every `intervalMs` while the tab is visible, and when the tab
 * regains focus — a light replacement for refreshing the whole page.
 */
export function useVisiblePolling(task: () => void, intervalMs: number) {
  const taskRef = useRef(task);
  taskRef.current = task;
  useEffect(() => {
    let last = Date.now();
    function run() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 5_000) return;
      last = Date.now();
      taskRef.current();
    }
    const timer = setInterval(run, intervalMs);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [intervalMs]);
}

/** `value`, but only once it has stopped changing for `ms` (search boxes). */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
