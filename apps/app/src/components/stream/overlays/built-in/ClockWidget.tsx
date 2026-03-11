/**
 * ClockWidget — Simple live clock / stream timer overlay.
 *
 * Shows current time and optional stream duration counter.
 */

import { useEffect, useState } from "react";
import type { WidgetDefinition, WidgetRenderProps } from "../types";
import { registerWidget } from "../registry";

function ClockComponent({ instance }: WidgetRenderProps) {
  const showDate = (instance.config.showDate as boolean) ?? false;
  const use24h = (instance.config.use24h as boolean) ?? true;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const date = new Date(now);
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: !use24h,
  });
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const accentColor = (instance.config.accentColor as string) || "#6366f1";

  return (
    <div
      className="w-full h-full flex items-center justify-center rounded-lg"
      style={{
        background: "rgba(10, 12, 20, 0.75)",
        backdropFilter: "blur(8px)",
        border: `1px solid ${accentColor}33`,
      }}
    >
      <div className="text-center">
        <div
          className="text-lg font-mono font-bold tracking-wider"
          style={{ color: accentColor }}
        >
          {timeStr}
        </div>
        {showDate && (
          <div className="text-[10px] text-gray-400 mt-0.5">{dateStr}</div>
        )}
      </div>
    </div>
  );
}

const definition: WidgetDefinition = {
  type: "clock",
  name: "Clock",
  description: "Live clock overlay with optional date",
  subscribesTo: [],
  defaultPosition: { x: 88, y: 2, width: 10, height: 6 },
  defaultZIndex: 13,
  configSchema: {
    accentColor: {
      type: "color",
      label: "Color",
      default: "#6366f1",
    },
    use24h: {
      type: "boolean",
      label: "24-hour format",
      default: true,
    },
    showDate: {
      type: "boolean",
      label: "Show Date",
      default: false,
    },
  },
  defaultConfig: { accentColor: "#6366f1", use24h: true, showDate: false },
  render: ClockComponent,
};

registerWidget(definition);
export default definition;
