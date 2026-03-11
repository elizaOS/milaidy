import type { ModelOption } from "@milady/app-core/api";
import { useApp } from "../../AppContext";

export function ModelSelectionStep() {
  const {
    t,
    onboardingOptions,
    onboardingSmallModel,
    onboardingLargeModel,
    setState,
  } = useApp();

  const handleSmallModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("onboardingSmallModel", e.target.value);
  };

  const handleLargeModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("onboardingLargeModel", e.target.value);
  };

  return (
    <div className="max-w-[500px] mx-auto mt-10 text-center font-body">
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        <h2 className="text-[28px] font-normal mb-1 text-txt-strong">
          {t("onboardingwizard.ModelSelection")}
        </h2>
      </div>
      <div className="flex flex-col gap-4 text-left max-w-[600px] mx-auto">
        <div>
          <span className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
            {t("onboardingwizard.SmallModel")}
          </span>
          <select
            value={onboardingSmallModel}
            onChange={handleSmallModelChange}
            className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
          >
            {onboardingOptions?.models?.small?.map((model: ModelOption) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="text-[13px] font-bold text-txt-strong block mb-2 text-left">
            {t("onboardingwizard.LargeModel")}
          </span>
          <select
            value={onboardingLargeModel}
            onChange={handleLargeModelChange}
            className="w-full px-3 py-2 border border-border bg-card text-sm mt-2 focus:border-accent focus:outline-none"
          >
            {onboardingOptions?.models?.large?.map((model: ModelOption) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
