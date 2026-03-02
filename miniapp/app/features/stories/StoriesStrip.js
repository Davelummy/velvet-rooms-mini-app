"use client";

import { useEffect } from "react";
import { useStoriesStore } from "../../_store/useStoriesStore";
import { api } from "../../_lib/apiClient";
import { mapApiError } from "../../_lib/formatters";
import StoryAvatar from "./StoryAvatar";
import StoryViewer from "./StoryViewer";

export default function StoriesStrip() {
  const { storyGroups, stripLoading, setStoryGroups, setStripLoading, openViewer, viewer, closeViewer } = useStoriesStore();

  const fetchStories = async () => {
    setStripLoading(true);
    try {
      const data = await api.get("/api/stories");
      setStoryGroups(data.groups || []);
    } catch {
      // silent fail — stories are non-critical
    } finally {
      setStripLoading(false);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  if (stripLoading || storyGroups.length === 0) return null;

  return (
    <>
      <div className="stories-strip" style={{ padding: "12px 16px" }}>
        {storyGroups.map((group, i) => (
          <StoryAvatar
            key={group.model.id || i}
            group={group}
            groupIndex={i}
            onTap={openViewer}
          />
        ))}
      </div>

      <StoryViewer open={viewer.open} onClose={closeViewer} />
    </>
  );
}
