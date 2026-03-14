import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { CompanionHeader } from "../components/companion/CompanionHeader";
import type { UiLanguage } from "../i18n/messages";

const meta = {
  title: "Companion/CompanionHeader",
  component: CompanionHeader,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    name: "Eliza",
    agentState: "idle",
    stateColor: "text-ok border-ok",
    lifecycleBusy: false,
    restartBusy: false,
    pauseResumeBusy: false,
    pauseResumeDisabled: false,
    handlePauseResume: fn(),
    handleRestart: fn(),
    cameraZoomed: false,
    miladyCloudEnabled: true,
    miladyCloudConnected: false,
    miladyCloudCredits: 100,
    creditColor: "text-ok border-ok",
    miladyCloudTopUpUrl:
      "https://www.miladycloud.ai/dashboard/settings?tab=billing",
    evmShort: "0x12...34ab",
    solShort: null,
    conversationsOpen: false,
    autonomyOpen: false,
    toggleConversations: fn(),
    toggleAutonomy: fn(),
    uiLanguage: "en-US" as UiLanguage,
    setUiLanguage: fn(),
    t: (key: string) => key,
  },
} satisfies Meta<typeof CompanionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultRunning: Story = {};

export const Paused: Story = {
  args: {
    agentState: "paused",
    stateColor: "text-warn border-warn",
  },
};

export const Thinking: Story = {
  args: {
    agentState: "thinking",
    stateColor: "bg-blue-500",
    miladyCloudEnabled: true,
    miladyCloudConnected: true,
    miladyCloudCredits: 100,
    miladyCloudTopUpUrl:
      "https://www.miladycloud.ai/dashboard/settings?tab=billing",
  },
};

export const DisconnectedWithoutCredits: Story = {
  args: {
    miladyCloudConnected: false,
    miladyCloudCredits: null,
  },
};

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
