import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../api-client";
import { useBugReport } from "../hooks/useBugReport";

const ENV_OPTIONS = ["macOS", "Windows", "Linux", "Other"] as const;
const GITHUB_NEW_ISSUE_URL =
  "https://github.com/milady-ai/milady/issues/new?template=bug_report.yml";

interface BugReportForm {
  description: string;
  stepsToReproduce: string;
  expectedBehavior: string;
  actualBehavior: string;
  environment: string;
  nodeVersion: string;
  modelProvider: string;
  logs: string;
}

const EMPTY_FORM: BugReportForm = {
  description: "",
  stepsToReproduce: "",
  expectedBehavior: "",
  actualBehavior: "",
  environment: "",
  nodeVersion: "",
  modelProvider: "",
  logs: "",
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function BugReportModal() {
  const { isOpen, close } = useBugReport();
  const [form, setForm] = useState<BugReportForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Fetch env info on open with cancellation guard
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    setForm(EMPTY_FORM);
    setSubmitting(false);
    setResultUrl(null);
    setErrorMsg(null);
    setShowLogs(false);
    setCopied(false);

    client
      .checkBugReportInfo()
      .then((info) => {
        if (cancelled) return;
        if (info.nodeVersion)
          setForm((f) => ({ ...f, nodeVersion: info.nodeVersion ?? "" }));
        if (info.platform)
          setForm((f) => ({
            ...f,
            environment:
              info.platform === "darwin"
                ? "macOS"
                : info.platform === "win32"
                  ? "Windows"
                  : info.platform === "linux"
                    ? "Linux"
                    : "Other",
          }));
      })
      .catch(() => {});
    setTimeout(() => descRef.current?.focus(), 50);

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const updateField = useCallback(
    <K extends keyof BugReportForm>(key: K, value: BugReportForm[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    [],
  );

  const formatMarkdown = useCallback((): string => {
    const strip = (s: string, max = 10_000) =>
      s.replace(/<[^>]*>/g, "").slice(0, max);
    const lines: string[] = [];
    lines.push(`### Description\n${strip(form.description)}`);
    lines.push(`\n### Steps to Reproduce\n${strip(form.stepsToReproduce)}`);
    if (form.expectedBehavior)
      lines.push(`\n### Expected Behavior\n${strip(form.expectedBehavior)}`);
    if (form.actualBehavior)
      lines.push(`\n### Actual Behavior\n${strip(form.actualBehavior)}`);
    lines.push(
      `\n### Environment\n${strip(form.environment || "Not specified", 200)}`,
    );
    if (form.nodeVersion)
      lines.push(`\n### Node Version\n${strip(form.nodeVersion, 200)}`);
    if (form.modelProvider)
      lines.push(`\n### Model Provider\n${strip(form.modelProvider, 200)}`);
    if (form.logs)
      lines.push(`\n### Logs\n\`\`\`\n${strip(form.logs, 50_000)}\n\`\`\``);
    return lines.join("\n");
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!form.description.trim() || !form.stepsToReproduce.trim()) {
      setErrorMsg("Description and Steps to Reproduce are required.");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const result = await client.submitBugReport({
        description: form.description,
        stepsToReproduce: form.stepsToReproduce,
        expectedBehavior: form.expectedBehavior,
        actualBehavior: form.actualBehavior,
        environment: form.environment,
        nodeVersion: form.nodeVersion,
        modelProvider: form.modelProvider,
        logs: form.logs,
      });
      if (result.url) {
        setResultUrl(result.url);
      } else if (result.fallback) {
        // No GITHUB_TOKEN on server — copy report and open GitHub manually
        const ok = await copyText(formatMarkdown());
        setCopied(ok);
        globalThis.window?.open(result.fallback, "_blank", "noopener");
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to submit bug report",
      );
    } finally {
      setSubmitting(false);
    }
  }, [form, formatMarkdown]);

  const handleCopyAndOpen = useCallback(async () => {
    const ok = await copyText(formatMarkdown());
    setCopied(ok);
    globalThis.window?.open(GITHUB_NEW_ISSUE_URL, "_blank", "noopener");
  }, [formatMarkdown]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const labelClass = "block text-[11px] font-bold text-muted mb-1";
  const inputClass =
    "w-full px-3 py-2 border border-border bg-bg text-sm text-txt outline-none focus:border-accent transition-colors font-body";
  const textareaClass = `${inputClass} resize-y min-h-[60px]`;
  const canSubmit =
    form.description.trim() && form.stepsToReproduce.trim() && !submitting;

  const backdropProps = {
    className:
      "fixed inset-0 z-50 flex items-center justify-center bg-black/50",
    onClick: (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) close();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") close();
    },
    role: "dialog" as const,
    "aria-modal": true as const,
    tabIndex: -1,
  };

  // Success state
  if (resultUrl) {
    return (
      <div {...backdropProps}>
        <div className="w-full max-w-md border border-border bg-card shadow-lg flex flex-col">
          <div className="flex items-center px-5 py-3 border-b border-border">
            <span className="font-bold text-sm flex-1">
              Bug Report Submitted
            </span>
            <button
              type="button"
              className="text-muted hover:text-txt text-lg leading-none px-1 cursor-pointer"
              onClick={close}
            >
              &times;
            </button>
          </div>
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-txt mb-3">
              Your bug report has been submitted successfully.
            </p>
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:underline break-all"
            >
              {resultUrl}
            </a>
          </div>
          <div className="flex justify-end px-5 py-3 border-t border-border">
            <button
              type="button"
              onClick={close}
              className="px-4 py-1.5 border border-border text-sm text-muted hover:text-txt cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div {...backdropProps}>
      <div className="w-full max-w-lg border border-border bg-card shadow-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center px-5 py-3 border-b border-border shrink-0">
          <span className="font-bold text-sm flex-1">Report a Bug</span>
          <button
            type="button"
            className="text-muted hover:text-txt text-lg leading-none px-1 cursor-pointer"
            onClick={close}
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          {errorMsg && (
            <div className="text-xs text-danger border border-danger px-3 py-2">
              {errorMsg}
            </div>
          )}

          <label className={labelClass}>
            Description <span className="text-danger">*</span>
            <textarea
              ref={descRef}
              className={textareaClass}
              placeholder="Describe the issue you encountered."
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
            />
          </label>

          <label className={labelClass}>
            Steps to Reproduce <span className="text-danger">*</span>
            <textarea
              className={textareaClass}
              placeholder={"1. Go to ...\n2. Click on ...\n3. Observe ..."}
              value={form.stepsToReproduce}
              onChange={(e) => updateField("stepsToReproduce", e.target.value)}
              rows={3}
            />
          </label>

          <label className={labelClass}>
            Expected Behavior
            <textarea
              className={textareaClass}
              placeholder="Describe the expected result."
              value={form.expectedBehavior}
              onChange={(e) => updateField("expectedBehavior", e.target.value)}
              rows={2}
            />
          </label>

          <label className={labelClass}>
            Actual Behavior
            <textarea
              className={textareaClass}
              placeholder="Describe the actual result."
              value={form.actualBehavior}
              onChange={(e) => updateField("actualBehavior", e.target.value)}
              rows={2}
            />
          </label>

          <div className="flex gap-3">
            <label className={`${labelClass} flex-1`}>
              Environment
              <select
                className={inputClass}
                value={form.environment}
                onChange={(e) => updateField("environment", e.target.value)}
              >
                <option value="">Select...</option>
                {ENV_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${labelClass} flex-1`}>
              Node Version
              <input
                type="text"
                className={inputClass}
                placeholder="22.x"
                value={form.nodeVersion}
                onChange={(e) => updateField("nodeVersion", e.target.value)}
              />
            </label>
          </div>

          <label className={labelClass}>
            Model Provider
            <input
              type="text"
              className={inputClass}
              placeholder="Anthropic / OpenAI / Ollama"
              value={form.modelProvider}
              onChange={(e) => updateField("modelProvider", e.target.value)}
            />
          </label>

          {/* Collapsible Logs */}
          <div>
            <button
              type="button"
              className="text-[11px] font-bold text-muted hover:text-txt cursor-pointer flex items-center gap-1"
              onClick={() => setShowLogs(!showLogs)}
            >
              <span
                className="inline-block transition-transform"
                style={{ transform: showLogs ? "rotate(90deg)" : "none" }}
              >
                ▶
              </span>
              Logs
            </button>
            {showLogs && (
              <textarea
                className={`${textareaClass} mt-1 font-mono text-xs`}
                placeholder="Paste relevant error output or logs"
                value={form.logs}
                onChange={(e) => updateField("logs", e.target.value)}
                rows={4}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={close}
            className="px-3 py-1.5 border border-border text-sm text-muted hover:text-txt cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyAndOpen}
              disabled={!canSubmit}
              className="px-3 py-1.5 border border-border text-sm text-muted hover:text-txt cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? "Copied!" : "Copy & Open GitHub"}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-3 py-1.5 border border-accent bg-accent text-white text-sm cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
