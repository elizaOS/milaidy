/**
 * Extended tooltip components for contextual help, icon buttons, guided
 * tours, and spotlight onboarding overlays.
 *
 * All exports here are framework-agnostic (no app context dependency).
 *
 * Note: The Radix-based `Tooltip` is exported from `./tooltip`. This file
 * exports a custom CSS-only hover tooltip (`HoverTooltip`), `IconTooltip`,
 * `Spotlight`, and `useGuidedTour`.
 */
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function HoverTooltip({
  children,
  content,
  position = "top",
  delay = 300,
  showArrow = true,
  className = "",
  visible: controlledVisible,
  onDismiss,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);
  const isVisibleState =
    controlledVisible !== undefined ? controlledVisible : isVisible;
  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  }, [delay]);
  const hide = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsVisible(false), 150);
  }, []);
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);
  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };
  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-border border-l-transparent border-r-transparent border-b-transparent",
    bottom:
      "bottom-full left-1/2 -translate-x-1/2 border-b-border border-l-transparent border-r-transparent border-t-transparent",
    left: "left-full top-1/2 -translate-y-1/2 border-l-border border-t-transparent border-b-transparent border-r-transparent",
    right:
      "right-full top-1/2 -translate-y-1/2 border-r-border border-t-transparent border-b-transparent border-l-transparent",
  };
  return _jsxs("button", {
    type: "button",
    ref: containerRef,
    className:
      "relative inline-flex bg-transparent border-0 p-0 cursor-default",
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    children: [
      children,
      isVisibleState &&
        _jsx("div", {
          className: `absolute z-50 ${positionClasses[position]} ${className}`,
          children: _jsxs("div", {
            className:
              "relative bg-bg-elevated border border-border rounded-lg shadow-xl p-3 max-w-xs",
            children: [
              onDismiss &&
                _jsx("button", {
                  type: "button",
                  onClick: onDismiss,
                  className:
                    "absolute top-1 right-1 p-1 text-muted hover:text-txt rounded",
                  "aria-label": "Dismiss tooltip",
                  children: _jsx(X, { className: "w-3 h-3" }),
                }),
              content,
              showArrow &&
                _jsx("div", {
                  className: `absolute w-0 h-0 border-4 ${arrowClasses[position]}`,
                }),
            ],
          }),
        }),
    ],
  });
}
/* ── IconTooltip ─────────────────────────────────────────────────────── */
/**
 * Lightweight tooltip for icon buttons.
 *
 * Uses a `<div>` wrapper (not `<button>`) so it can safely wrap interactive
 * elements like icon buttons without nesting buttons.
 */
export function IconTooltip({ children, label, shortcut, position = "top" }) {
  const posClass =
    position === "top"
      ? "bottom-full left-1/2 -translate-x-1/2 mb-2"
      : "top-full left-1/2 -translate-x-1/2 mt-2";
  const arrowClass =
    position === "top"
      ? "top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-bg-elevated"
      : "bottom-full left-1/2 -translate-x-1/2 -mb-1 border-4 border-transparent border-b-bg-elevated";
  return _jsxs("div", {
    className: "relative group",
    children: [
      children,
      _jsxs("div", {
        className: `absolute ${posClass} px-2 py-1 bg-bg-elevated border border-border text-[11px] text-txt-strong rounded-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-lg pointer-events-none`,
        role: "tooltip",
        children: [
          _jsx("div", { className: "font-medium", children: label }),
          shortcut &&
            _jsx("div", { className: "text-muted mt-0.5", children: shortcut }),
          _jsx("div", { className: `absolute ${arrowClass}` }),
        ],
      }),
    ],
  });
}
export function Spotlight({
  target,
  title,
  description,
  step,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  labels = {},
}) {
  const [targetRect, setTargetRect] = useState(null);
  useEffect(() => {
    const element = document.querySelector(target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
    }
  }, [target]);
  if (!targetRect) return null;
  const padding = 8;
  return _jsxs("div", {
    className: "fixed inset-0 z-[300] pointer-events-none",
    children: [
      _jsx("div", {
        className: "absolute inset-0 bg-black/60 pointer-events-auto",
        style: {
          clipPath: `polygon(
            0% 0%,
            0% 100%,
            ${targetRect.left - padding}px 100%,
            ${targetRect.left - padding}px ${targetRect.top - padding}px,
            ${targetRect.right + padding}px ${targetRect.top - padding}px,
            ${targetRect.right + padding}px ${targetRect.bottom + padding}px,
            ${targetRect.left - padding}px ${targetRect.bottom + padding}px,
            ${targetRect.left - padding}px 100%,
            100% 100%,
            100% 0%
          )`,
        },
      }),
      _jsxs("div", {
        className:
          "absolute bg-card border border-border rounded-xl shadow-2xl p-5 max-w-sm pointer-events-auto",
        style: {
          top: targetRect.bottom + padding + 16,
          left: Math.min(targetRect.left, window.innerWidth - 340),
        },
        children: [
          _jsxs("div", {
            className: "flex items-center justify-between mb-3",
            children: [
              _jsxs("span", {
                className: "text-xs text-muted font-medium",
                children: [
                  labels.stepOf ?? "Step",
                  " ",
                  step,
                  " of ",
                  totalSteps,
                ],
              }),
              _jsx("button", {
                type: "button",
                onClick: onSkip,
                className: "text-xs text-muted hover:text-txt",
                children: labels.skipTour ?? "Skip Tour",
              }),
            ],
          }),
          _jsx("h3", {
            className: "text-lg font-bold text-txt-strong mb-2",
            children: title,
          }),
          _jsx("p", {
            className: "text-sm text-muted mb-4",
            children: description,
          }),
          _jsxs("div", {
            className: "flex items-center justify-between",
            children: [
              _jsx("button", {
                type: "button",
                onClick: onPrev,
                disabled: step === 1,
                className:
                  "px-4 py-2 text-sm border border-border rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-bg-hover transition-colors",
                children: labels.previous ?? "Previous",
              }),
              _jsx("div", {
                className: "flex gap-1",
                children: Array.from(
                  { length: totalSteps },
                  (_, idx) => idx,
                ).map((dotIndex) =>
                  _jsx(
                    "div",
                    {
                      className: `w-2 h-2 rounded-full transition-colors ${dotIndex + 1 === step ? "bg-accent" : "bg-border"}`,
                    },
                    `step-dot-${dotIndex}`,
                  ),
                ),
              }),
              _jsx("button", {
                type: "button",
                onClick: onNext,
                className:
                  "px-4 py-2 text-sm bg-accent text-accent-fg rounded-lg hover:opacity-90 transition-opacity",
                children:
                  step === totalSteps
                    ? (labels.finish ?? "Finish")
                    : (labels.next ?? "Next"),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
export function useGuidedTour(steps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const start = useCallback(() => {
    setIsActive(true);
    setCurrentStep(0);
  }, []);
  const next = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      setIsActive(false);
    }
  }, [currentStep, steps.length]);
  const prev = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);
  const skip = useCallback(() => {
    setIsActive(false);
  }, []);
  return {
    isActive,
    currentStep,
    step: steps[currentStep],
    start,
    next,
    prev,
    skip,
    totalSteps: steps.length,
  };
}
