"use client";

import { EmptyState } from "../../_components/ui-kit";

export default function FollowersTab({
  followersStats,
  followersStatus,
  followers,
  filteredFollowers,
  followersFilter,
  onFilterChange,
  resolveDisplayName,
  formatPresence,
}) {
  return (
    <div className="flow-card">
      <h3>Your Followers</h3>
      {followersStats && (
        <div className="metric-grid">
          <div className="metric-card">
            <span>Total followers</span>
            <strong>{followersStats.total}</strong>
          </div>
          <div className="metric-card">
            <span>New (7 days)</span>
            <strong>{followersStats.last_7d}</strong>
          </div>
          <div className="metric-card">
            <span>Growth (7 days)</span>
            <strong>
              {followersStats.growth_7d >= 0 ? "+" : ""}
              {followersStats.growth_7d}
            </strong>
          </div>
          <div className="metric-card">
            <span>New (30 days)</span>
            <strong>{followersStats.last_30d}</strong>
          </div>
        </div>
      )}
      <div className="dash-actions">
        <button
          type="button"
          className={`cta ${followersFilter === "all" ? "primary" : "ghost"}`}
          onClick={() => onFilterChange("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`cta ${followersFilter === "online" ? "primary" : "ghost"}`}
          onClick={() => onFilterChange("online")}
        >
          Online
        </button>
        <button
          type="button"
          className={`cta ${followersFilter === "offline" ? "primary" : "ghost"}`}
          onClick={() => onFilterChange("offline")}
        >
          Offline
        </button>
      </div>
      {followersStatus && <p className="helper error">{followersStatus}</p>}
      {!followersStatus && followers.length === 0 && (
        <EmptyState title="No followers yet" body="Share content and go live to grow your audience." />
      )}
      {!followersStatus && followers.length > 0 && filteredFollowers.length === 0 && (
        <EmptyState title="No followers match this filter" body="Try switching back to all followers." />
      )}
      {!followersStatus && filteredFollowers.length > 0 && (
        <div className="gallery-grid">
          {filteredFollowers.map((item) => (
            <div key={`follower-${item.id}`} className="gallery-card">
              <div className="gallery-body">
                <div className="list-row">
                  <div className="avatar small">
                    {item.avatar_url ? (
                      <img loading="lazy" decoding="async" src={item.avatar_url} alt="Follower" />
                    ) : (
                      <span>{resolveDisplayName(item, "U")[0]}</span>
                    )}
                  </div>
                  <div>
                    <strong>{resolveDisplayName(item)}</strong>
                    <p className="muted">{item.role || "user"}</p>
                  </div>
                </div>
                <div className="gallery-actions">
                  <span className={`status-pill ${item.is_online ? "success" : ""}`}>
                    {formatPresence(item.is_online, item.last_seen_at)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
