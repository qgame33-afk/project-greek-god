"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Queries restored from the offline cache (older than this page load) count as fresh for the
 * staleTime, so an answer saved a second before a reload could show its old value. Today refetches
 * those once, in the background, when it mounts.
 */
export function useRefreshRestored() {
  const qc = useQueryClient();
  useEffect(() => {
    // when this page started, on the same clock as dataUpdatedAt
    const born = Date.now() - performance.now();
    void qc.refetchQueries({ type: "active", predicate: (q) => q.state.dataUpdatedAt > 0 && q.state.dataUpdatedAt < born });
  }, [qc]);
}
