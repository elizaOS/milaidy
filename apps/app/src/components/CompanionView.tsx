import { useCallback, useState } from "react";
import {
  getVrmBackgroundUrl,
  getVrmPreviewUrl,
  getVrmUrl,
  useApp,
} from "../AppContext";
import { ChatModalView } from "./ChatModalView";
import { CompanionHeader } from "./companion/CompanionHeader";
import { CompanionHubNav } from "./companion/CompanionHubNav";
import { VrmStage } from "./companion/VrmStage";

export function CompanionView() {
  const {
    selectedVrmIndex,
    customVrmUrl,
    customBackgroundUrl,
    uiLanguage,
    setUiLanguage,
    setTab,
    setUiShellMode,
    // Header properties
    agentStatus,
    miladyCloudEnabled,
    miladyCloudConnected,
    miladyCloudCredits,
    miladyCloudCreditsCritical,
    miladyCloudCreditsLow,
    miladyCloudTopUpUrl,
    walletAddresses,
    lifecycleBusy,
    lifecycleAction,
    handlePauseResume,
    handleRestart,
    t,
  } = useApp();

  // Compute Header properties
  const name = agentStatus?.agentName ?? "Milady";
  const agentState = agentStatus?.state ?? "not_started";

  const stateColor =
    agentState === "running"
      ? "text-ok border-ok"
      : agentState === "paused" ||
          agentState === "restarting" ||
          agentState === "starting"
        ? "text-warn border-warn"
        : agentState === "error"
          ? "text-danger border-danger"
          : "text-muted border-muted";

  const restartBusy = lifecycleBusy && lifecycleAction === "restart";
  const pauseResumeBusy = lifecycleBusy;
  const pauseResumeDisabled =
    lifecycleBusy || agentState === "restarting" || agentState === "starting";

  const creditColor = miladyCloudCreditsCritical
    ? "border-danger text-danger"
    : miladyCloudCreditsLow
      ? "border-warn text-warn"
      : "border-ok text-ok";

  const evmShort = walletAddresses?.evmAddress
    ? `${walletAddresses.evmAddress.slice(0, 4)}...${walletAddresses.evmAddress.slice(-4)}`
    : null;
  const solShort = walletAddresses?.solanaAddress
    ? `${walletAddresses.solanaAddress.slice(0, 4)}...${walletAddresses.solanaAddress.slice(-4)}`
    : null;
  const [cameraZoomed, setCameraZoomed] = useState(true);
  const handleSwitchToNativeShell = useCallback(() => {
    setUiShellMode("native");
    setTab("chat");
  }, [setTab, setUiShellMode]);

  const safeSelectedVrmIndex = selectedVrmIndex > 0 ? selectedVrmIndex : 1;
  const vrmPath =
    selectedVrmIndex === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(safeSelectedVrmIndex);
  const fallbackPreviewUrl =
    selectedVrmIndex > 0
      ? getVrmPreviewUrl(safeSelectedVrmIndex)
      : getVrmPreviewUrl(1);
  const vrmBackgroundUrl =
    selectedVrmIndex === 0 && customVrmUrl
      ? customBackgroundUrl || getVrmBackgroundUrl(1)
      : getVrmBackgroundUrl(safeSelectedVrmIndex);

  return (
    <div
      className="absolute inset-0 overflow-hidden text-white font-display rounded-2xl bg-[radial-gradient(circle_at_50%_120%,#212942_0%,#12151e_80%)] animate-in fade-in zoom-in-95 duration-500"
      style={{
        backgroundImage: `url("${vrmBackgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 z-0 bg-cover opacity-60 bg-[radial-gradient(circle_at_10%_20%,rgba(255,255,255,0.03)_0%,transparent_40%),radial-gradient(circle_at_80%_80%,rgba(0,225,255,0.05)_0%,transparent_40%)] pointer-events-none" />

      {/* Model Layer */}
      <VrmStage
        vrmPath={vrmPath}
        fallbackPreviewUrl={fallbackPreviewUrl}
        cameraProfile={cameraZoomed ? "companion_close" : "companion"}
        t={t}
      />

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col px-8 py-6 pointer-events-none [&>*]:pointer-events-auto">
        <CompanionHeader
          cameraZoomed={cameraZoomed}
          setCameraZoomed={setCameraZoomed}
          name={name}
          agentState={agentState}
          stateColor={stateColor}
          lifecycleBusy={lifecycleBusy}
          restartBusy={restartBusy}
          pauseResumeBusy={pauseResumeBusy}
          pauseResumeDisabled={pauseResumeDisabled}
          handlePauseResume={handlePauseResume}
          handleRestart={handleRestart}
          miladyCloudEnabled={miladyCloudEnabled}
          miladyCloudConnected={miladyCloudConnected}
          miladyCloudCredits={miladyCloudCredits}
          creditColor={creditColor}
          miladyCloudTopUpUrl={miladyCloudTopUpUrl}
          evmShort={evmShort}
          solShort={solShort}
          handleSwitchToNativeShell={handleSwitchToNativeShell}
          uiLanguage={uiLanguage}
          setUiLanguage={setUiLanguage}
          t={t}
        />

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[45%] z-20 pointer-events-auto">
          <ChatModalView variant="companion-dock" />
        </div>

        {/* Main Content Area */}
        <div className="flex-1 grid grid-cols-[1fr_auto] gap-6 min-h-0 relative">
          {/* Center (Empty to show character) */}
          <div className="w-full h-full" />

          {/* Right Panel: Actions + Game HUD Menu */}
          <aside className="fixed top-1/2 -translate-y-1/2 right-6 flex flex-col items-end gap-4 z-40">
            {/* Game HUD Icon Menu */}
            <CompanionHubNav setTab={setTab} t={t} />
          </aside>
        </div>
      </div>
    </div>
  );
}
