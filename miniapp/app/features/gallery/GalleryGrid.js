"use client";

import { useEffect, useCallback } from "react";
import { useGalleryStore } from "../../_store/useGalleryStore";
import { api } from "../../_lib/apiClient";
import { mapApiError } from "../../_lib/formatters";
import { EmptyState, ErrorState } from "../../_components/ui-kit";
import { SkeletonGallery } from "../../_components/SkeletonCard";
import GalleryCard from "./GalleryCard";
import PullToRefresh from "../../_components/PullToRefresh";
import { usePullToRefresh } from "../../_hooks/usePullToRefresh";
import { useRef, useState } from "react";

const PAGE_SIZE = 18;

export default function GalleryGrid({ modelId, purchases = [], onItemTap }) {
  const { items, loading, page, hasMore, filter, setItems, appendItems, setLoading, setPage, setHasMore } = useGalleryStore();
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const { pullEl, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh({
    onRefresh: () => fetchPage(1, true),
    containerRef,
  });

  const purchasedIds = new Set(purchases.map((p) => p.content_id || p.id));

  const fetchPage = useCallback(async (pageNum = 1, replace = false) => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: pageNum, limit: PAGE_SIZE };
      if (modelId) params.model_id = modelId;
      if (filter && filter !== "all") params.tier = filter;
      const data = await api.get("/api/content", params);
      const newItems = data.items || data || [];
      if (replace) {
        setItems(newItems);
      } else {
        appendItems(newItems);
      }
      setPage(pageNum);
      setHasMore(newItems.length === PAGE_SIZE);
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  }, [modelId, filter, setItems, appendItems, setLoading, setPage, setHasMore]);

  useEffect(() => {
    fetchPage(1, true);
  }, [filter, modelId]);

  if (loading && items.length === 0) return <SkeletonGallery />;
  if (error) return <ErrorState message={error} onRetry={() => fetchPage(1, true)} />;
  if (items.length === 0) return <EmptyState title="No content yet" body="Content will appear here once uploaded." />;

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <PullToRefresh ref={pullEl} />
      <div className="content-grid-3col">
        {items.map((item) => (
          <GalleryCard
            key={item.id}
            item={item}
            onTap={onItemTap}
            isPurchased={purchasedIds.has(item.id)}
          />
        ))}
      </div>
      {hasMore && !loading && (
        <button
          onClick={() => fetchPage(page + 1)}
          style={{
            width: "100%",
            padding: "14px",
            margin: "16px 0",
            borderRadius: "14px",
            border: "1px solid var(--line)",
            background: "none",
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          Load more
        </button>
      )}
    </div>
  );
}
