import type { ComponentProps } from "react";
import { lazy, Suspense } from "react";

// Re-export the type — it's just a type, no runtime cost.
export type { VrmStageAvatarEntry } from "@milady/app-core/components/VrmStage";

// Lazy-load VrmStage to defer three/@pixiv/three-vrm/@sparkjsdev/spark.
const LazyVrmStage = lazy(() =>
  import("@milady/app-core/components/VrmStage").then((m) => ({
    default: m.VrmStage,
  })),
);

// Extract props from the inner memoized component that the lazy wrapper wraps.
// React.LazyExoticComponent<T> erases prop info, so we reach through using the
// module's VrmStage type directly (type-only import, no runtime cost).
type VrmStageProps = ComponentProps<
  typeof import("@milady/app-core/components/VrmStage").VrmStage
>;

export function VrmStage(props: VrmStageProps) {
  return (
    <Suspense fallback={null}>
      <LazyVrmStage {...props} />
    </Suspense>
  );
}
