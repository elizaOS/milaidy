import {
  invokeDesktopBridgeRequest,
  isElectrobunRuntime,
} from "@miladyai/app-core/bridge";
import { useApp } from "@miladyai/app-core/state";
import { useEffect, useRef } from "react";

export function DesktopOnboardingRuntime() {
  const { onboardingLoading, onboardingStep } = useApp();
  const requestedBackgroundNoticeRef = useRef(false);

  useEffect(() => {
    if (!isElectrobunRuntime()) {
      return;
    }
    if (onboardingLoading || onboardingStep !== "senses") {
      return;
    }
    if (requestedBackgroundNoticeRef.current) {
      return;
    }

    requestedBackgroundNoticeRef.current = true;
    void invokeDesktopBridgeRequest<{ shown: boolean }>({
      rpcMethod: "desktopShowBackgroundNotice",
      ipcChannel: "desktop:showBackgroundNotice",
    }).catch((error) => {
      console.warn("[Milady] Failed to show desktop background notice:", error);
    });
  }, [onboardingLoading, onboardingStep]);

  return null;
}
