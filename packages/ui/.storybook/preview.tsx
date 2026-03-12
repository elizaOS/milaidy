import type { Preview } from "@storybook/react";
import type React from "react";
import "./storybook.css";

const ThemeDecorator = (Story: React.ComponentType) => (
  <div className="dark" style={{ minHeight: "100vh" }}>
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
  },
};

export default preview;
