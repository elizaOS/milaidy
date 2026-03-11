import { client } from "@milady/app-core/api";
import { Button, Input } from "@milady/ui";
import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { useBugReport } from "../hooks/useBugReport";
import { useTimeout } from "../hooks/useTimeout";

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
  const { setTimeout } = useTimeout();

  const { t } = useApp();
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
  }, [isOpen, setTimeout]);

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
    "w-full h-9 px-3 py-2 bg-bg text-sm text-txt shadow-sm transition-colors font-body";
  const textareaClass =
    "w-full px-3 py-2 border border-border bg-bg text-sm text-txt shadow-sm focus-visible:ring-1 focus-visible:ring-accent transition-colors font-body resize-y min-h-[60px]";
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
              {t("bugreportmodal.BugReportSubmitted")}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted hover:text-txt h-6 w-6"
              onClick={close}
            >
              {t("bugreportmodal.Times")}
            </Button>
          </div>
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-txt mb-3">
              {t("bugreportmodal.YourBugReportHas")}
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
            <Button
              variant="outline"
              size="sm"
              onClick={close}
              className="px-4 py-1.5 shadow-sm"
            >
              {t("bugreportmodal.Close")}
            </Button>
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
          <span className="font-bold text-sm flex-1">
            {t("bugreportmodal.ReportABug")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted hover:text-txt h-6 w-6"
            onClick={close}
          >
            {t("bugreportmodal.Times")}
          </Button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3 overflow-y-auto">
          {errorMsg && (
            <div className="text-xs text-danger border border-danger px-3 py-2">
              {errorMsg}
            </div>
          )}

          <label className={labelClass}>
            {t("bugreportmodal.Description")}{" "}
            <span className="text-danger">*</span>
            <textarea
              ref={descRef}
              className={textareaClass}
              placeholder={t("bugreportmodal.DescribeTheIssueY")}
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
            />
          </label>

          <label className={labelClass}>
            {t("bugreportmodal.StepsToReproduce")}{" "}
            <span className="text-danger">*</span>
            <textarea
              className={textareaClass}
              placeholder={"1. Go to ...\n2. Click on ...\n3. Observe ..."}
              value={form.stepsToReproduce}
              onChange={(e) => updateField("stepsToReproduce", e.target.value)}
              rows={3}
            />
          </label>

          <label className={labelClass}>
            {t("bugreportmodal.ExpectedBehavior")}
            <textarea
              className={textareaClass}
              placeholder={t("bugreportmodal.DescribeTheExpecte")}
              value={form.expectedBehavior}
              onChange={(e) => updateField("expectedBehavior", e.target.value)}
              rows={2}
            />
          </label>

          <label className={labelClass}>
            {t("bugreportmodal.ActualBehavior")}
            <textarea
              className={textareaClass}
              placeholder={t("bugreportmodal.DescribeTheActual")}
              value={form.actualBehavior}
              onChange={(e) => updateField("actualBehavior", e.target.value)}
              rows={2}
            />
          </label>

          <div className="flex gap-3">
            <label className={`${labelClass} flex-1`}>
              {t("bugreportmodal.Environment")}
              <select
                className={`${inputClass} border border-border focus-visible:ring-1 focus-visible:ring-accent`}
                value={form.environment}
                onChange={(e) => updateField("environment", e.target.value)}
              >
                <option value="">{t("bugreportmodal.Select")}</option>
                {ENV_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: Custom <Input> component is inside <label> */}
            <label className={`${labelClass} flex-1`}>
              {t("bugreportmodal.NodeVersion")}
              <Input
                className={inputClass}
                placeholder={t("bugreportmodal.22X")}
                value={form.nodeVersion}
                onChange={(e) => updateField("nodeVersion", e.target.value)}
              />
            </label>
          </div>

          {/* biome-ignore lint/a11y/noLabelWithoutControl: Custom <Input> component is inside <label> */}
          <label className={labelClass}>
            {t("bugreportmodal.ModelProvider")}
            <Input
              className={inputClass}
              placeholder={t("bugreportmodal.AnthropicOpenAI")}
              value={form.modelProvider}
              onChange={(e) => updateField("modelProvider", e.target.value)}
            />
          </label>

          {/* Collapsible Logs */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-[11px] font-bold text-muted hover:text-txt hover:bg-transparent cursor-pointer flex items-center gap-1"
              onClick={() => setShowLogs(!showLogs)}
            >
              <ChevronRight
                className="w-3 h-3 inline-block transition-transform"
                style={{ transform: showLogs ? "rotate(90deg)" : "none" }}
              />

              {t("bugreportmodal.Logs")}
            </Button>
            {showLogs && (
              <textarea
                className={`${textareaClass} mt-1 font-mono text-xs`}
                placeholder={t("bugreportmodal.PasteRelevantError")}
                value={form.logs}
                onChange={(e) => updateField("logs", e.target.value)}
                rows={4}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={close}
            className="px-3 py-1.5 shadow-sm"
          >
            {t("bugreportmodal.Cancel")}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyAndOpen}
              disabled={!canSubmit}
              className="px-3 py-1.5 shadow-sm"
            >
              {copied ? "Copied!" : "Copy & Open GitHub"}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-3 py-1.5 shadow-sm"
            >
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
