import { ChatAvatar } from "../ChatAvatar";

/** Avatar overlay — renders as small PIP or full canvas depending on mode. */
export function AvatarPip({
  isSpeaking,
  displayMode = "pip",
}: {
  isSpeaking: boolean;
  displayMode?: "pip" | "full";
}) {
  if (displayMode === "full") {
    return (
      <div className="absolute inset-0 z-[5] pointer-events-none">
        <ChatAvatar isSpeaking={isSpeaking} />
      </div>
    );
  }

  return (
    <div className="absolute bottom-3 left-3 z-10 w-[140px] h-[180px] xl:w-[180px] xl:h-[220px] rounded-lg overflow-hidden border border-border/50 bg-bg/60 backdrop-blur-sm shadow-lg pointer-events-none">
      <ChatAvatar isSpeaking={isSpeaking} />
    </div>
  );
}
