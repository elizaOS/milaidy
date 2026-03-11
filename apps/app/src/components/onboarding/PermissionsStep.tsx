import { useApp } from "../../AppContext";
import { PermissionsOnboardingSection } from "../PermissionsSection";

export function PermissionsStep() {
  const { handleOnboardingNext } = useApp();

  return (
    <div className="max-w-[600px] mx-auto mt-10 font-body">
      <PermissionsOnboardingSection
        onContinue={(options) => void handleOnboardingNext(options)}
      />
    </div>
  );
}
