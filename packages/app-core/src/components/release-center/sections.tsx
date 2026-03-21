import { Button, Input } from "@miladyai/ui";
import { createElement } from "react";
import {
  DefinitionRow,
  StatusPill,
  formatTimestamp,
  partitionDescription,
} from "./shared";
import type {
  AppReleaseStatus,
  DesktopBuildInfo,
  DesktopReleaseNotesWindowInfo,
  DesktopSessionSnapshot,
  DesktopUpdaterSnapshot,
  WebGpuBrowserStatus,
  WgpuTagElement,
} from "./types";
import {
  DEFAULT_RELEASE_NOTES_URL,
  RELEASE_NOTES_PARTITION,
  SESSION_PARTITIONS,
} from "./types";

export function ReleaseStatusSection({
  busyAction,
  nativeUpdater,
  updateLoading,
  updateStatus,
  onApplyUpdate,
  onCheckForUpdates,
  onDetach,
  onRefresh,
}: {
  busyAction: string | null;
  nativeUpdater: DesktopUpdaterSnapshot | null;
  updateLoading: boolean;
  updateStatus: AppReleaseStatus | null | undefined;
  onApplyUpdate: () => void;
  onCheckForUpdates: () => void;
  onDetach: () => void;
  onRefresh: () => void;
}) {
  const appReleaseTone = updateStatus?.updateAvailable ? "warning" : "good";
  const nativeReleaseTone = nativeUpdater?.updateReady
    ? "good"
    : nativeUpdater?.updateAvailable
      ? "warning"
      : "neutral";

  return (
    <section className="rounded-2xl border border-border bg-bg-accent p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill
          label={`App: ${updateStatus?.currentVersion ?? "loading"}`}
          tone={appReleaseTone}
        />
        <StatusPill
          label={`Desktop: ${nativeUpdater?.currentVersion ?? "loading"}`}
          tone={nativeReleaseTone}
        />
        {nativeUpdater?.channel ? (
          <StatusPill
            label={`Channel: ${nativeUpdater.channel}`}
            tone="neutral"
          />
        ) : null}
      </div>

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-txt">Release Status</h3>
          <p className="mt-1 text-xs text-muted">
            Compare backend release metadata with the native Electrobun updater
            state.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busyAction === "refresh" || updateLoading}
            onClick={onRefresh}
          >
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busyAction === "detach-release"}
            onClick={onDetach}
          >
            Open Detached Release Center
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-bg p-3">
          <div className="text-xs font-semibold text-txt">
            App Release Service
          </div>
          <DefinitionRow
            label="Current version"
            value={updateStatus?.currentVersion}
          />
          <DefinitionRow
            label="Latest version"
            value={updateStatus?.latestVersion ?? "Current"}
          />
          <DefinitionRow label="Channel" value={updateStatus?.channel} />
          <DefinitionRow
            label="Last checked"
            value={
              updateStatus?.lastCheckAt
                ? new Date(updateStatus.lastCheckAt).toLocaleString()
                : "Not yet"
            }
          />
        </div>

        <div className="rounded-xl border border-border bg-bg p-3">
          <div className="mb-3 text-xs font-semibold text-txt">
            Native Electrobun Updater
          </div>
          <DefinitionRow
            label="Current version"
            value={nativeUpdater?.currentVersion}
          />
          <DefinitionRow
            label="Latest version"
            value={nativeUpdater?.latestVersion ?? "Current"}
          />
          <DefinitionRow
            label="Last status"
            value={nativeUpdater?.lastStatus?.message ?? "Idle"}
          />
          <DefinitionRow
            label="Status time"
            value={formatTimestamp(nativeUpdater?.lastStatus?.timestamp)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busyAction === "check-updates"}
              onClick={onCheckForUpdates}
            >
              Check / Download Update
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                busyAction === "apply-update" || !nativeUpdater?.updateReady
              }
              onClick={onApplyUpdate}
            >
              Apply Downloaded Update
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReleaseNotesSection({
  busyAction,
  nativeUpdater,
  releaseNotesUrl,
  releaseNotesWindow,
  onOpenWindow,
  onReleaseNotesUrlChange,
  onResetUrl,
}: {
  busyAction: string | null;
  nativeUpdater: DesktopUpdaterSnapshot | null;
  releaseNotesUrl: string;
  releaseNotesWindow: DesktopReleaseNotesWindowInfo | null;
  onOpenWindow: () => void;
  onReleaseNotesUrlChange: (value: string) => void;
  onResetUrl: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-accent p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-txt">
          Release Notes BrowserView
        </h3>
        <p className="mt-1 text-xs text-muted">
          Opens release notes in a dedicated sandboxed BrowserView on its own
          persistent session.
        </p>
      </div>

      <div className="space-y-3">
        <Input
          value={releaseNotesUrl}
          onChange={(event) => onReleaseNotesUrlChange(event.target.value)}
          placeholder={DEFAULT_RELEASE_NOTES_URL}
          className="font-mono text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busyAction === "open-release-notes"}
            onClick={onOpenWindow}
          >
            Open BrowserView Window
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busyAction === "reset-release-url"}
            onClick={onResetUrl}
          >
            Reset URL
          </Button>
        </div>

        {releaseNotesWindow ? (
          <div className="rounded-xl border border-border bg-bg p-3 text-xs text-txt">
            <DefinitionRow
              label="Window ID"
              value={releaseNotesWindow.windowId}
            />
            <DefinitionRow
              label="BrowserView ID"
              value={releaseNotesWindow.webviewId}
            />
            <DefinitionRow label="URL" value={releaseNotesWindow.url} />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-bg p-3 text-xs text-muted">
            Using updater URL:{" "}
            {nativeUpdater?.baseUrl ?? DEFAULT_RELEASE_NOTES_URL}
          </div>
        )}
      </div>
    </section>
  );
}

export function BuildRuntimeSection({
  buildInfo,
  busyAction,
  dockVisible,
  nativeUpdater,
  onToggleDock,
}: {
  buildInfo: DesktopBuildInfo | null;
  busyAction: string | null;
  dockVisible: boolean;
  nativeUpdater: DesktopUpdaterSnapshot | null;
  onToggleDock: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-accent p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-txt">
          BuildConfig and Shell Runtime
        </h3>
        <p className="mt-1 text-xs text-muted">
          Native runtime metadata sourced directly from Electrobun BuildConfig
          and shell APIs.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-bg p-3">
        <DefinitionRow label="Platform" value={buildInfo?.platform} />
        <DefinitionRow label="Architecture" value={buildInfo?.arch} />
        <DefinitionRow
          label="Default renderer"
          value={buildInfo?.defaultRenderer}
        />
        <DefinitionRow
          label="Available renderers"
          value={buildInfo?.availableRenderers.join(", ")}
        />
        <DefinitionRow label="Bun version" value={buildInfo?.bunVersion} />
        <DefinitionRow label="CEF version" value={buildInfo?.cefVersion} />
        <DefinitionRow
          label="Updater base URL"
          value={nativeUpdater?.baseUrl ?? DEFAULT_RELEASE_NOTES_URL}
        />
        <DefinitionRow
          label="Dock icon visible"
          value={
            buildInfo?.platform === "darwin"
              ? String(dockVisible)
              : "macOS only"
          }
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={
              busyAction === "toggle-dock" || buildInfo?.platform !== "darwin"
            }
            onClick={onToggleDock}
          >
            {dockVisible ? "Hide Dock Icon" : "Show Dock Icon"}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function SessionControlsSection({
  busyAction,
  sessionSnapshots,
  onClearCookies,
  onClearSession,
}: {
  busyAction: string | null;
  sessionSnapshots: Record<string, DesktopSessionSnapshot | undefined>;
  onClearCookies: (partition: string) => void;
  onClearSession: (partition: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-accent p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-txt">
          Session and Cookie Controls
        </h3>
        <p className="mt-1 text-xs text-muted">
          Explicit Session APIs for inspecting and clearing renderer storage.
        </p>
      </div>

      <div className="space-y-3">
        {SESSION_PARTITIONS.map(({ label, partition }) => {
          const snapshot = sessionSnapshots[partition];
          return (
            <div
              key={partition}
              className="rounded-xl border border-border bg-bg p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-txt">{label}</div>
                  <div className="mt-1 text-[11px] text-muted">
                    {partitionDescription(partition)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAction === `clear-cookies:${partition}`}
                    onClick={() => onClearCookies(partition)}
                  >
                    Clear Cookies
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyAction === `clear-session:${partition}`}
                    onClick={() => onClearSession(partition)}
                  >
                    Clear Storage
                  </Button>
                </div>
              </div>

              <div className="mt-3">
                <DefinitionRow
                  label="Partition"
                  value={snapshot?.partition ?? partition}
                />
                <DefinitionRow
                  label="Persistent"
                  value={snapshot ? String(snapshot.persistent) : undefined}
                />
                <DefinitionRow
                  label="Cookie count"
                  value={snapshot?.cookieCount}
                />
              </div>

              {snapshot?.cookies.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {snapshot.cookies.slice(0, 8).map((cookie) => (
                    <span
                      key={`${partition}:${cookie.name}:${cookie.domain ?? ""}`}
                      className="inline-flex items-center rounded-full border border-border bg-bg-accent px-2 py-1 text-[11px] text-txt"
                    >
                      {cookie.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-[11px] text-muted">
                  No cookies stored for this partition.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function WgpuSurfaceSection({
  webGpuStatus,
  wgpuHidden,
  wgpuPassthrough,
  wgpuReady,
  wgpuRef,
  wgpuTagAvailable,
  wgpuTransparent,
  onRunTest,
  onToggleHidden,
  onTogglePassthrough,
  onToggleTransparent,
}: {
  webGpuStatus: WebGpuBrowserStatus | null;
  wgpuHidden: boolean;
  wgpuPassthrough: boolean;
  wgpuReady: boolean;
  wgpuRef: { current: WgpuTagElement | null };
  wgpuTagAvailable: boolean;
  wgpuTransparent: boolean;
  onRunTest: () => void;
  onToggleHidden: () => void;
  onTogglePassthrough: () => void;
  onToggleTransparent: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-bg-accent p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-txt">Browser WGPU Surface</h3>
        <p className="mt-1 text-xs text-muted">
          Inline <code>&lt;electrobun-wgpu&gt;</code> preview plus browser
          WebGPU compatibility status from the active desktop renderer.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {wgpuTagAvailable ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-black/5">
              {createElement("electrobun-wgpu", {
                ref: (node: WgpuTagElement | null) => {
                  wgpuRef.current = node;
                },
                className: "block h-56 w-full",
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
              The WGPU custom element is not available in this renderer.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!wgpuTagAvailable} onClick={onRunTest}>
              Run Test
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!wgpuTagAvailable}
              onClick={onToggleTransparent}
            >
              {wgpuTransparent ? "Opaque" : "Transparent"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!wgpuTagAvailable}
              onClick={onTogglePassthrough}
            >
              {wgpuPassthrough ? "Passthrough Off" : "Passthrough On"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!wgpuTagAvailable}
              onClick={onToggleHidden}
            >
              {wgpuHidden ? "Show Surface" : "Hide Surface"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-bg p-3">
          <div className="mb-3 text-xs font-semibold text-txt">
            Browser WebGPU Status
          </div>
          <DefinitionRow
            label="Inline surface ready"
            value={String(wgpuReady)}
          />
          <DefinitionRow
            label="Renderer support"
            value={webGpuStatus?.available ? "Available" : "Not available"}
          />
          <DefinitionRow label="Renderer type" value={webGpuStatus?.renderer} />
          <DefinitionRow
            label="Chrome Beta"
            value={webGpuStatus?.chromeBetaPath ?? "Not detected"}
          />
          <div className="mt-3 rounded-lg border border-border bg-bg-accent px-3 py-2 text-xs text-muted">
            {webGpuStatus?.reason ?? "Waiting for desktop renderer status."}
          </div>
          {webGpuStatus?.downloadUrl ? (
            <div className="mt-3 text-xs">
              <a
                className="text-accent underline-offset-2 hover:underline"
                href={webGpuStatus.downloadUrl}
                target="_blank"
                rel="noreferrer"
              >
                Download Chrome Beta fallback
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
