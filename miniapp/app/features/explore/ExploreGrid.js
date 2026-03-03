"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../../_lib/apiClient";
import { mapApiError } from "../../_lib/formatters";
import ModelCard from "./ModelCard";
import ExploreSearch from "./ExploreSearch";
import { SkeletonGallery } from "../../_components/SkeletonCard";
import { EmptyState, ErrorState } from "../../_components/ui-kit";

const PAGE_SIZE = 20;

export default function ExploreGrid({ onModelTap, onBook }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const debounceRef = useRef(null);

  const fetchModels = useCallback(async (q = "", off = 0, append = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get("/api/explore", { q, limit: PAGE_SIZE, offset: off });
      const items = data.items || data || [];
      if (append) {
        setModels((prev) => [...prev, ...items]);
      } else {
        setModels(items);
      }
      setOffset(off + items.length);
      setHasMore(items.length === PAGE_SIZE);
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels("", 0, false);
  }, []);

  const handleQueryChange = (q) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchModels(q, 0, false);
    }, 400);
  };

  if (loading && models.length === 0) return (
    <div>
      <ExploreSearch value={query} onChange={handleQueryChange} />
      <div style={{ padding: "0 16px" }}>
        <SkeletonGallery />
      </div>
    </div>
  );

  if (error) return <ErrorState message={error} onRetry={() => fetchModels(query, 0)} />;

  return (
    <div>
      <ExploreSearch value={query} onChange={handleQueryChange} />
      {models.length === 0 ? (
        <EmptyState title="No creators found" body="Try a different search." />
      ) : (
        <>
          <div className="explore-grid" style={{ padding: "0 16px 16px" }}>
            {models.map((model) => (
              <ModelCard
                key={model.id || model.user_id}
                model={model}
                onTap={onModelTap}
                onBook={onBook}
              />
            ))}
          </div>
          {hasMore && !loading && (
            <button
              onClick={() => fetchModels(query, offset, true)}
              style={{ width: "100%", padding: "14px", border: "none", background: "none", color: "var(--muted)", cursor: "pointer" }}
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
