"use client";

import React from "react";

export default class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep the app usable when a single tab subtree fails.
    console.error("[TabErrorBoundary]", this.props.tabKey, error, info);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.tabKey !== this.props.tabKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onReset === "function") {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flow-card">
          <h3>Unable to load this tab</h3>
          <p className="helper error">
            {this.state.error?.message || "A client-side error occurred while rendering this tab."}
          </p>
          <button type="button" className="cta ghost" onClick={this.handleReset}>
            Back to safe tab
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
