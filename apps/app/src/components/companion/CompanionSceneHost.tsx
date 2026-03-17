import type { ReactNode } from "react";
import { lazy, Suspense } from "react";

// The hook has no 3D dependencies — safe to import statically from the barrel.
export { useSharedCompanionScene } from "@miladyai/app-core/components";

// Lazy-load the heavy 3D scene components.  CompanionSceneHost (in app-core)
// statically imports VrmStage → VrmViewer → VrmEngine → three, so deferring
// this import keeps three/@pixiv/three-vrm/@sparkjsdev/spark out of the
// initial bundle.
const LazyCompanionSceneHost = lazy(() =>
  import("@miladyai/app-core/components/CompanionSceneHost").then((m) => ({
    default: m.CompanionSceneHost,
  })),
);

const LazySharedCompanionScene = lazy(() =>
  import("@miladyai/app-core/components/CompanionSceneHost").then((m) => ({
    default: m.SharedCompanionScene,
  })),
);

export function CompanionSceneHost(props: {
  active: boolean;
  interactive?: boolean;
  children?: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <LazyCompanionSceneHost {...props} />
    </Suspense>
  );
}

export function SharedCompanionScene(props: {
  active: boolean;
  interactive?: boolean;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <LazySharedCompanionScene {...props} />
    </Suspense>
  );
}
