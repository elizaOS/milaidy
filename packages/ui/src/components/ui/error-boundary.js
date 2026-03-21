import * as React from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Button } from "./button";
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }
  resetErrorBoundary = () => {
    this.setState({ error: null });
  };
  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetErrorBoundary);
      }
      return _jsxs("div", {
        className:
          "flex flex-col items-center justify-center gap-3 p-6 text-center border border-destructive/30 bg-destructive/5 rounded-md",
        children: [
          _jsx("p", {
            className: "text-sm font-semibold text-destructive",
            children: "Something went wrong",
          }),
          _jsx("p", {
            className: "text-xs text-muted max-w-sm",
            children: this.state.error.message,
          }),
          _jsx(Button, {
            type: "button",
            variant: "outline",
            size: "sm",
            className: "rounded-md text-xs",
            onClick: this.resetErrorBoundary,
            children: "Try Again",
          }),
        ],
      });
    }
    return this.props.children;
  }
}
