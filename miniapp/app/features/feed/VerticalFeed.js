"use client";

import { useEffect, useRef, useCallback } from "react";
import { useFeedStore } from "../../_store/useFeedStore";
import { api } from "../../_lib/apiClient";
import { mapApiError } from "../../_lib/formatters";
import FeedCard from "./FeedCard";
import { EmptyState } from "../../_components/ui-kit";

const LOAD_THRESHOLD = 3; // load more when 3 items from end

export default function VerticalFeed({ onModelTap, onBook }) {
  const {
    activeTab,
    forYouItems, forYouCursor, forYouLoading, forYouHasMore,
    followingItems, followingCursor, followingLoading, followingHasMore,
    setForYouItems, appendForYouItems, setForYouCursor, setForYouLoading, setForYouHasMore,
    setFollowingItems, appendFollowingItems, setFollowingCursor, setFollowingLoading, setFollowingHasMore,
    currentIndex, setCurrentIndex,
  } = useFeedStore();

  const viewportRef = useRef(null);

  const items = activeTab === "foryou" ? forYouItems : followingItems;
  const loading = activeTab === "foryou" ? forYouLoading : followingLoading;
  const hasMore = activeTab === "foryou" ? forYouHasMore : followingHasMore;
  const cursor = activeTab === "foryou" ? forYouCursor : followingCursor;

  const fetchFeed = useCallback(async (append = false) => {
    const isForYou = activeTab === "foryou";
    const setLoading = isForYou ? setForYouLoading : setFollowingLoading;
    const setItems = isForYou ? setForYouItems : setFollowingItems;
    const appendItems = isForYou ? appendForYouItems : appendFollowingItems;
    const setCursor = isForYou ? setForYouCursor : setFollowingCursor;
    const setHasMore = isForYou ? setForYouHasMore : setFollowingHasMore;

    setLoading(true);
    try {
      const params = { tab: activeTab, limit: 20 };
      if (append && cursor) params.cursor = cursor;
      const data = await api.get("/api/feed", params);
      const newItems = data.items || [];
      if (append) {
        appendItems(newItems);
      } else {
        setItems(newItems);
      }
      setCursor(data.nextCursor || null);
      setHasMore(!!data.nextCursor && newItems.length > 0);
    } catch (err) {
      // silently fail on feed errors
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (items.length === 0) {
      fetchFeed(false);
    }
  }, [activeTab]);

  // Scroll-snap observation
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const slides = viewport.querySelectorAll(".feed-slide");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.dataset.index, 10);
            setCurrentIndex(idx);
            // Load more if near end
            if (idx >= items.length - LOAD_THRESHOLD && hasMore && !loading) {
              fetchFeed(true);
            }
          }
        });
      },
      { root: viewport, threshold: 0.6 }
    );

    slides.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [items.length, hasMore, loading]);

  if (!loading && items.length === 0) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <EmptyState
          title={activeTab === "following" ? "Follow creators to see their posts" : "No content yet"}
          body="Check back soon."
        />
      </div>
    );
  }

  return (
    <div ref={viewportRef} className="feed-viewport">
      {items.map((item, idx) => (
        <div key={item.id} data-index={idx}>
          <FeedCard item={item} onModelTap={onModelTap} onBook={onBook} />
        </div>
      ))}
      {loading && (
        <div className="feed-slide" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", border: "3px solid var(--line)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
        </div>
      )}
    </div>
  );
}
