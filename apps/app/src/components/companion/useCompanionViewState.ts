import { useCallback } from "react";
import { useApp } from "../../AppContext";
import { client } from "../../api-client";
import { resolveApiUrl } from "../../asset-url";
import type { TranslatorFn } from "./walletUtils";

/** VRM/background upload callbacks for CompanionView. */
export function useCompanionViewState(_t: TranslatorFn) {
  const { selectedVrmIndex, setState } = useApp();

  const handleRosterVrmUpload = useCallback(
    (file: File) => {
      if (!file.name.toLowerCase().endsWith(".vrm")) return;
      void (async () => {
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf.slice(0, 32));
        const text = new TextDecoder().decode(bytes);
        if (text.startsWith("version https://git-lfs.github.com/spec/v1")) {
          alert("This .vrm is a Git LFS pointer, not the real model file.");
          return;
        }
        if (
          bytes.length < 4 ||
          bytes[0] !== 0x67 ||
          bytes[1] !== 0x6c ||
          bytes[2] !== 0x54 ||
          bytes[3] !== 0x46
        ) {
          alert("Invalid VRM file. Please select a valid .vrm binary.");
          return;
        }
        const previousIndex = selectedVrmIndex;
        const url = URL.createObjectURL(file);
        setState("customVrmUrl", url);
        setState("selectedVrmIndex", 0);
        client
          .uploadCustomVrm(file)
          .then(() => {
            setState(
              "customVrmUrl",
              resolveApiUrl(`/api/avatar/vrm?t=${Date.now()}`),
            );
            requestAnimationFrame(() => URL.revokeObjectURL(url));
          })
          .catch(() => {
            setState("selectedVrmIndex", previousIndex);
            URL.revokeObjectURL(url);
          });
      })();
    },
    [selectedVrmIndex, setState],
  );

  const handleBgUpload = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      setState("customBackgroundUrl", url);
      if (selectedVrmIndex !== 0) setState("selectedVrmIndex", 0);
      client
        .uploadCustomBackground(file)
        .then(() => {
          setState(
            "customBackgroundUrl",
            resolveApiUrl(`/api/avatar/background?t=${Date.now()}`),
          );
          requestAnimationFrame(() => URL.revokeObjectURL(url));
        })
        .catch(() => {
          setState("customBackgroundUrl", "");
          URL.revokeObjectURL(url);
        });
    },
    [selectedVrmIndex, setState],
  );

  return {
    handleRosterVrmUpload,
    handleBgUpload,
  };
}
