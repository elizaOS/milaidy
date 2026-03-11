import { useEffect, useRef, useState } from "react";
import { useApp } from "../../AppContext";

const FALLBACK_NAMES = [
  "Eliza", "Nova", "Aria", "Lyra", "Mira",
  "Kira", "Sora", "Yuki", "Rei", "Hana",
  "Nyx", "Echo", "Luna", "Zara", "Iris",
];

function pickRandomName(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? "Eliza";
}

export function IdentityStep() {
  const { onboardingName, onboardingOptions, handleOnboardingNext, handleOnboardingBack, setState } = useApp();

  const hasPickedRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const [displayText, setDisplayText] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pick a random name on first mount
  useEffect(() => {
    if (hasPickedRef.current) return;
    hasPickedRef.current = true;

    const serverNames = onboardingOptions?.names ?? [];
    const pool = serverNames.length > 0 ? serverNames : FALLBACK_NAMES;
    const chosen = pickRandomName(pool);
    setState("onboardingName", chosen);
  }, [onboardingOptions, setState]);

  // Typewriter reveal of the name
  useEffect(() => {
    if (revealed) return;
    const name = onboardingName || "Eliza";
    let i = 0;
    setDisplayText("");

    const startDelay = setTimeout(() => {
      const tick = () => {
        i += 1;
        setDisplayText(name.slice(0, i));
        if (i < name.length) {
          timerRef.current = setTimeout(tick, 80 + Math.random() * 60);
        } else {
          setRevealed(true);
        }
      };
      tick();
    }, 600);

    return () => {
      clearTimeout(startDelay);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onboardingName, revealed]);

  // Re-roll: pick a new random name
  const handleReroll = () => {
    const serverNames = onboardingOptions?.names ?? [];
    const pool = serverNames.length > 0 ? serverNames : FALLBACK_NAMES;
    // Avoid picking the same name
    const filtered = pool.length > 1 ? pool.filter((n) => n !== onboardingName) : pool;
    const chosen = pickRandomName(filtered);
    setState("onboardingName", chosen);
    setRevealed(false);
    setDisplayText("");
  };

  return (
    <>
      <div className="onboarding-section-title">Designation</div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>

      <div className="onboarding-question" style={{ fontSize: 14, fontWeight: 400, marginBottom: 8 }}>
        My name is
      </div>

      <div
        style={{
          fontSize: 36,
          fontWeight: 300,
          letterSpacing: "0.06em",
          color: "#f0b90b",
          textAlign: "center",
          minHeight: 52,
          marginBottom: 8,
        }}
      >
        {displayText}
        {!revealed && (
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: "1em",
              background: "#f0b90b",
              marginLeft: 2,
              verticalAlign: "baseline",
              animation: "onboarding-cursor-blink 0.8s step-end infinite",
            }}
          />
        )}
      </div>

      <div style={{ textAlign: "center", opacity: revealed ? 1 : 0, transition: "opacity 0.5s" }}>
        <button
          type="button"
          className="onboarding-back-link"
          style={{ fontSize: 11, letterSpacing: "0.08em" }}
          onClick={handleReroll}
        >
          ↻ New name
        </button>
      </div>

      <p className="onboarding-desc" style={{ opacity: revealed ? 1 : 0, transition: "opacity 0.5s" }}>
        You can rename me anytime in settings.
      </p>

      <div className="onboarding-panel-footer">
        <button className="onboarding-back-link" onClick={handleOnboardingBack} type="button">
          ← Back
        </button>
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          disabled={!revealed}
          type="button"
          style={{ opacity: revealed ? 1 : 0.3, transition: "opacity 0.4s" }}
        >
          Confirm
        </button>
      </div>
    </>
  );
}
