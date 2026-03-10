/**
 * SocialLinksWidget — Configurable social links bar for streams.
 *
 * Displays social handles (Twitter, Discord, etc.) in a compact strip.
 */

import type { WidgetDefinition, WidgetRenderProps } from "../types";
import { registerWidget } from "../registry";

function SocialLinksComponent({ instance }: WidgetRenderProps) {
  const twitter = (instance.config.twitter as string) || "";
  const discord = (instance.config.discord as string) || "";
  const github = (instance.config.github as string) || "";
  const website = (instance.config.website as string) || "";
  const telegram = (instance.config.telegram as string) || "";

  const links = [
    twitter && { label: "X", value: `@${twitter}`, color: "#1d9bf0" },
    discord && { label: "Discord", value: discord, color: "#5865f2" },
    github && { label: "GitHub", value: github, color: "#8b949e" },
    telegram && { label: "TG", value: telegram, color: "#26a5e4" },
    website && { label: "Web", value: website, color: "#6366f1" },
  ].filter(Boolean) as Array<{ label: string; value: string; color: string }>;

  if (links.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center rounded-lg text-[10px] text-gray-600"
        style={{ background: "rgba(10,12,20,0.7)", backdropFilter: "blur(8px)" }}
      >
        Configure social links
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex items-center gap-3 px-3 rounded-lg overflow-hidden"
      style={{
        background: "rgba(10, 12, 20, 0.75)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgba(99,102,241,0.15)",
      }}
    >
      {links.map((link) => (
        <span key={link.label} className="flex items-center gap-1 shrink-0">
          <span className="text-[9px] font-bold uppercase" style={{ color: link.color }}>
            {link.label}
          </span>
          <span className="text-[10px] text-gray-300">{link.value}</span>
        </span>
      ))}
    </div>
  );
}

const definition: WidgetDefinition = {
  type: "social-links",
  name: "Social Links",
  description: "Display social handles on stream",
  subscribesTo: [],
  defaultPosition: { x: 0, y: 95, width: 50, height: 4 },
  defaultZIndex: 11,
  configSchema: {
    twitter: { type: "string", label: "Twitter/X Handle", default: "" },
    discord: { type: "string", label: "Discord Invite", default: "" },
    github: { type: "string", label: "GitHub Username", default: "" },
    telegram: { type: "string", label: "Telegram", default: "" },
    website: { type: "string", label: "Website URL", default: "" },
  },
  defaultConfig: {
    twitter: "",
    discord: "",
    github: "",
    telegram: "",
    website: "",
  },
  render: SocialLinksComponent,
};

registerWidget(definition);
export default definition;
