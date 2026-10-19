"use client";

import { useQueryClient, type Query } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Queries restored from the offline cache (older than this page load) count as fresh for the
 * staleTime, so a plan, template or mode saved a second before a reload could show its old
 * value (and an edit made on top of it would save over the newer one). While a Train screen is
 * mounted, each restored query is refetched once, in the background, as soon as something
 * watches it — including queries that only start once the signed-in user is known, which is
 * after the first render.
 */
export function useRefreshRestored() {
  const qc = useQueryClient();
  useEffect(() => {
    // when this page started, on the same clock as dataUpdatedAt: only a restored copy is older
    const born = Date.now() - performance.now();
    const cache = qc.getQueryCache();
    const done = new Set<string>();
    const check = (q: Query) => {
      if (done.has(q.queryHash) || !q.isActive()) return;
      if (!(q.state.dataUpdatedAt > 0 && q.state.dataUpdatedAt < born)) return;
      done.add(q.queryHash);
      void qc.refetchQueries({ queryKey: q.queryKey, exact: true, type: "active" });
    };
    cache.findAll({ type: "active" }).forEach(check);
    return cache.subscribe((e) => {
      if (e.type === "observerAdded" || e.type === "observerOptionsUpdated") check(e.query);
    });
  }, [qc]);
}
