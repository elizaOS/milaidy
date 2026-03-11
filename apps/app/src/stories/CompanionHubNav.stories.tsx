import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { CompanionHubNav } from "../components/companion/CompanionHubNav";

const meta = {
  title: "Companion/CompanionHubNav",
  component: CompanionHubNav,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dark",
    },
  },
  args: {
    setTab: fn(),
    t: (key: string) => key,
  },
  decorators: [
    (Story) => (
      <div
        style={{
          padding: "2rem",
          width: "100%",
          height: "100vh",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompanionHubNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MobileView: Story = {
  parameters: {
    viewport: {
      defaultViewport: "iphonex",
    },
  },
};

export const TabletView: Story = {
  parameters: {
    viewport: {
      defaultViewport: "ipad",
    },
  },
};
