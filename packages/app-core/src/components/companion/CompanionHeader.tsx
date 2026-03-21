import type { UiLanguage } from "@miladyai/app-core/i18n";
import type { ShellView, UiTheme } from "@miladyai/app-core/state";
import { memo, type ReactNode } from "react";
import { ShellHeaderControls } from "./ShellHeaderControls";

export interface CompanionHeaderProps {
  activeShellView: ShellView;
  onShellViewChange: (view: ShellView) => void;
  uiLanguage: UiLanguage;
  setUiLanguage: (language: UiLanguage) => void;
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
  t: (key: string) => string;
  children?: ReactNode;
  showCompanionControls?: boolean;
  chatAgentVoiceMuted?: boolean;
  onToggleVoiceMute?: () => void;
  onNewChat?: () => void;
}

export const CompanionHeader = memo(function CompanionHeader(
  props: CompanionHeaderProps,
) {
  const {
    activeShellView,
    onShellViewChange,
    uiLanguage,
    setUiLanguage,
    uiTheme,
    setUiTheme,
    t,
    children,
    showCompanionControls,
    chatAgentVoiceMuted,
    onToggleVoiceMute,
    onNewChat,
  } = props;

  return (
    <header
      className="absolute inset-x-0 top-0 z-10"
      data-no-camera-drag="true"
    >
      <ShellHeaderControls
        activeShellView={activeShellView}
        onShellViewChange={onShellViewChange}
        uiLanguage={uiLanguage}
        setUiLanguage={setUiLanguage}
        uiTheme={uiTheme}
        setUiTheme={setUiTheme}
        t={t}
        className="pointer-events-auto px-3 py-2 sm:px-4 sm:py-3"
        showCompanionControls={showCompanionControls}
        chatAgentVoiceMuted={chatAgentVoiceMuted}
        onToggleVoiceMute={onToggleVoiceMute}
        onNewChat={onNewChat}
      >
        {children}
      </ShellHeaderControls>
    </header>
  );
});
