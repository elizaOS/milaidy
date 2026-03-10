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
    name: "Milady",
    agentState: "running",
    stateColor: "text-ok border-ok",
    lifecycleBusy: false,
    restartBusy: false,
    pauseResumeBusy: false,
    pauseResumeDisabled: false,
    handlePauseResume: fn(),
    handleRestart: fn(),
    cloudEnabled: true,
    cloudConnected: true,
    cloudCredits: 12.5,
    creditColor: "text-ok border-ok",
    cloudTopUpUrl: "#",
    evmShort: "0x12...34ab",
    solShort: null,
    handleSwitchToNativeShell: fn(),
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

export const DisconnectedWithoutCredits: Story = {
  args: {
    cloudConnected: false,
    cloudCredits: null,
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
