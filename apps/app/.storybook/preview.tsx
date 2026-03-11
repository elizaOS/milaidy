import { INITIAL_VIEWPORTS } from "@storybook/addon-viewport";
import type { Preview } from "@storybook/react";
import type React from "react";
import "../src/styles.css";

const ThemeDecorator = (Story: React.ComponentType) => (
  <div
    className="dark"
    style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--text)",
    }}
  >
    <div style={{ padding: "2rem" }}>
      <Story />
    </div>
  </div>
);

const preview: Preview = {
  decorators: [ThemeDecorator],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disable: true,
    },
    layout: "fullscreen",
    viewport: {
      viewports: INITIAL_VIEWPORTS,
    },
  },
};

export default preview;
