import { Component, type ReactNode } from "react";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("UI error:", error.message); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="center-screen"><div style={{ maxWidth: 420, display: "grid", gap: 12 }}>
        <Alert tone="danger">Something went wrong while rendering this page.</Alert>
        <Button onClick={() => location.reload()}>Reload</Button>
      </div></div>
    );
  }
}