import { useState, useEffect } from "react";
import { client, type CustomActionDef, type CustomActionHandler } from "../api-client";

interface CustomActionEditorProps {
  open: boolean;
  action?: CustomActionDef | null;
  onSave: (action: CustomActionDef) => void;
  onClose: () => void;
}

type HandlerType = "http" | "shell" | "code";

interface ParamDef {
  name: string;
  description: string;
  required: boolean;
}

interface HeaderRow {
  key: string;
  value: string;
}

export function CustomActionEditor({ open, action, onSave, onClose }: CustomActionEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [handlerType, setHandlerType] = useState<HandlerType>("http");

  // HTTP handler fields
  const [httpMethod, setHttpMethod] = useState<"GET" | "POST" | "PUT" | "DELETE" | "PATCH">("GET");
  const [httpUrl, setHttpUrl] = useState("");
  const [httpHeaders, setHttpHeaders] = useState<HeaderRow[]>([{ key: "", value: "" }]);
  const [httpBody, setHttpBody] = useState("");

  // Shell handler fields
  const [shellCommand, setShellCommand] = useState("");

  // Code handler fields
  const [code, setCode] = useState("");

  // Parameters
  const [parameters, setParameters] = useState<ParamDef[]>([]);

  // AI generate
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);

  // Test section
  const [testExpanded, setTestExpanded] = useState(false);
  const [testParams, setTestParams] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ output?: string; error?: string; duration?: number } | null>(null);
  const [testing, setTesting] = useState(false);

  // Populate form when action changes
  useEffect(() => {
    if (!open) return;

    if (action) {
      setName(action.name);
      setDescription(action.description || "");
      setParameters(action.parameters?.map(p => ({
        name: p.name,
        description: p.description || "",
        required: p.required || false
      })) || []);

      const handler = action.handler;
      if (handler.type === "http") {
        setHandlerType("http");
        setHttpMethod((handler.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH") || "GET");
        setHttpUrl(handler.url || "");
        const headers = handler.headers || {};
        setHttpHeaders(Object.keys(headers).length > 0
          ? Object.entries(headers).map(([k, v]) => ({ key: k, value: v }))
          : [{ key: "", value: "" }]
        );
        setHttpBody(handler.bodyTemplate || "");
      } else if (handler.type === "shell") {
        setHandlerType("shell");
        setShellCommand(handler.command || "");
      } else if (handler.type === "code") {
        setHandlerType("code");
        setCode(handler.code || "");
      }
    } else {
      // Reset for create mode
      setName("");
      setDescription("");
      setHandlerType("http");
      setHttpMethod("GET");
      setHttpUrl("");
      setHttpHeaders([{ key: "", value: "" }]);
      setHttpBody("");
      setShellCommand("");
      setCode("");
      setParameters([]);
      setAiPrompt("");
      setTestExpanded(false);
      setTestParams({});
      setTestResult(null);
    }
  }, [open, action]);

  const handleNameChange = (value: string) => {
    const normalized = value.toUpperCase().replace(/\s+/g, "_");
    setName(normalized);
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    try {
      const result = await client.generateCustomAction(aiPrompt.trim());
      if (!result.ok || !result.generated) return;
      const g = result.generated;

      if (typeof g.name === "string") setName(g.name.toUpperCase().replace(/\s+/g, "_"));
      if (typeof g.description === "string") setDescription(g.description);

      const handler = (g.handler ?? g) as Record<string, unknown>;
      const hType = (handler.type ?? g.handlerType) as string | undefined;

      if (hType === "http") {
        setHandlerType("http");
        if (typeof handler.method === "string") setHttpMethod(handler.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH");
        if (typeof handler.url === "string") setHttpUrl(handler.url);
        if (handler.headers && typeof handler.headers === "object") {
          setHttpHeaders(Object.entries(handler.headers as Record<string, string>).map(([k, v]) => ({ key: k, value: v })));
        }
        if (typeof handler.bodyTemplate === "string") setHttpBody(handler.bodyTemplate);
      } else if (hType === "shell") {
        setHandlerType("shell");
        if (typeof handler.command === "string") setShellCommand(handler.command);
      } else if (hType === "code") {
        setHandlerType("code");
        if (typeof handler.code === "string") setCode(handler.code);
      }

      if (Array.isArray(g.parameters)) {
        setParameters(
          (g.parameters as Array<{ name?: string; description?: string; required?: boolean }>)
            .filter((p) => p.name)
            .map((p) => ({
              name: p.name ?? "",
              description: p.description ?? "",
              required: p.required ?? false,
            }))
        );
      }
    } catch (err: any) {
      alert(`Generation failed: ${err.message || String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  const addParameter = () => {
    setParameters([...parameters, { name: "", description: "", required: false }]);
  };

  const removeParameter = (index: number) => {
    setParameters(parameters.filter((_, i) => i !== index));
  };

  const updateParameter = (index: number, field: keyof ParamDef, value: string | boolean) => {
    setParameters(parameters.map((p, i) =>
      i === index ? { ...p, [field]: value } : p
    ));
  };

  const addHeader = () => {
    setHttpHeaders([...httpHeaders, { key: "", value: "" }]);
  };

  const removeHeader = (index: number) => {
    setHttpHeaders(httpHeaders.filter((_, i) => i !== index));
  };

  const updateHeader = (index: number, field: "key" | "value", value: string) => {
    setHttpHeaders(httpHeaders.map((h, i) =>
      i === index ? { ...h, [field]: value } : h
    ));
  };

  const handleTest = async () => {
    if (!action?.id) {
      setTestResult({ error: "Save the action first to test it" });
      return;
    }

    setTesting(true);
    setTestResult(null);
    const startTime = Date.now();

    try {
      const result = await client.testCustomAction(action.id, testParams);
      const duration = Date.now() - startTime;
      setTestResult({ output: JSON.stringify(result, null, 2), duration });
    } catch (err: any) {
      const duration = Date.now() - startTime;
      setTestResult({ error: err.message || String(err), duration });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Name is required");
      return;
    }

    let handler: CustomActionHandler;

    if (handlerType === "http") {
      const headers: Record<string, string> = {};
      httpHeaders.forEach(h => {
        if (h.key.trim()) {
          headers[h.key.trim()] = h.value;
        }
      });

      handler = {
        type: "http",
        method: httpMethod,
        url: httpUrl,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        bodyTemplate: httpBody || undefined
      };
    } else if (handlerType === "shell") {
      handler = {
        type: "shell",
        command: shellCommand
      };
    } else {
      handler = {
        type: "code",
        code
      };
    }

    const actionDef = {
      name: name.trim(),
      description: description.trim(),
      similes: [] as string[],
      parameters: parameters.filter(p => p.name.trim()).map(p => ({
        name: p.name.trim(),
        description: p.description.trim(),
        required: p.required
      })),
      handler,
      enabled: action?.enabled ?? true,
    };

    try {
      const saved = action?.id
        ? await client.updateCustomAction(action.id, actionDef)
        : await client.createCustomAction(actionDef);

      onSave(saved);
    } catch (err: any) {
      alert(`Failed to save: ${err.message || String(err)}`);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-2xl border border-border bg-card shadow-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center px-5 py-3 border-b border-border shrink-0">
          <h2 className="flex-1 text-sm font-medium text-txt">
            {action ? "Edit Custom Action" : "New Custom Action"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-txt text-xl leading-none cursor-pointer"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          {/* AI Generate */}
          {!action && (
            <div className="flex flex-col gap-1 border border-accent/30 bg-accent/5 p-3">
              <label className="text-xs text-accent font-medium">Describe what you want this action to do</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !generating && handleGenerate()}
                  placeholder="e.g. Check if a website is up and return the status code"
                  className="flex-1 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
                />
                <button
                  onClick={handleGenerate}
                  disabled={generating || !aiPrompt.trim()}
                  className="px-3 py-1.5 text-xs border border-accent bg-accent text-white hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
              <span className="text-xs text-muted/70">The agent will generate the action config for you to review and edit</span>
            </div>
          )}

          {/* Name */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="MY_ACTION"
              className="flex-1 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this action do?"
              rows={2}
              className="flex-1 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Handler Type Tabs */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">Handler Type</label>
            <div className="flex gap-2">
              {(["http", "shell", "code"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setHandlerType(type)}
                  className={`px-3 py-1.5 text-xs border cursor-pointer ${
                    handlerType === type
                      ? "border-accent bg-accent text-white"
                      : "border-border text-muted hover:text-txt"
                  }`}
                >
                  {type === "http" ? "HTTP Request" : type === "shell" ? "Shell Command" : "JavaScript"}
                </button>
              ))}
            </div>
          </div>

          {/* Handler Config */}
          {handlerType === "http" && (
            <div className="flex flex-col gap-3 border border-border p-3">
              <div className="flex gap-2">
                <select
                  value={httpMethod}
                  onChange={(e) => setHttpMethod(e.target.value as "GET" | "POST" | "PUT" | "DELETE" | "PATCH")}
                  className="bg-surface border border-border px-2 py-1.5 text-sm text-txt outline-none focus:border-accent"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </select>
                <input
                  type="text"
                  value={httpUrl}
                  onChange={(e) => setHttpUrl(e.target.value)}
                  placeholder="https://api.example.com/{{param}}"
                  className="flex-1 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted">Headers (optional)</label>
                  <button
                    onClick={addHeader}
                    className="text-xs text-accent hover:opacity-80 cursor-pointer"
                  >
                    + Add
                  </button>
                </div>
                {httpHeaders.map((header, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={header.key}
                      onChange={(e) => updateHeader(i, "key", e.target.value)}
                      placeholder="Header-Name"
                      className="flex-1 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
                    />
                    <input
                      type="text"
                      value={header.value}
                      onChange={(e) => updateHeader(i, "value", e.target.value)}
                      placeholder="value or {{param}}"
                      className="flex-1 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => removeHeader(i)}
                      className="px-2 text-muted hover:text-txt cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted">Body Template (optional)</label>
                <textarea
                  value={httpBody}
                  onChange={(e) => setHttpBody(e.target.value)}
                  placeholder={'{"key": "{{param}}"}'}
                  rows={3}
                  className="bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent resize-none font-mono"
                />
              </div>
            </div>
          )}

          {handlerType === "shell" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">Command Template</label>
              <textarea
                value={shellCommand}
                onChange={(e) => setShellCommand(e.target.value)}
                placeholder="echo {{message}} > /tmp/output.txt"
                rows={4}
                className="bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent resize-none font-mono"
              />
              <span className="text-xs text-muted/70">Use {`{{paramName}}`} for parameter substitution</span>
            </div>
          )}

          {handlerType === "code" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted">JavaScript Code</label>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="// Available: params.paramName, fetch()\nreturn { result: params.input };"
                rows={6}
                className="bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent resize-none font-mono"
              />
            </div>
          )}

          {/* Parameters */}
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted">Parameters</label>
              <button
                onClick={addParameter}
                className="text-xs text-accent hover:opacity-80 cursor-pointer"
              >
                + Add Parameter
              </button>
            </div>
            {parameters.map((param, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  type="text"
                  value={param.name}
                  onChange={(e) => updateParameter(i, "name", e.target.value)}
                  placeholder="paramName"
                  className="w-32 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
                />
                <input
                  type="text"
                  value={param.description}
                  onChange={(e) => updateParameter(i, "description", e.target.value)}
                  placeholder="Description"
                  className="flex-1 bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
                />
                <label className="flex items-center gap-1 text-xs text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={param.required}
                    onChange={(e) => updateParameter(i, "required", e.target.checked)}
                    className="cursor-pointer"
                  />
                  Required
                </label>
                <button
                  onClick={() => removeParameter(i)}
                  className="px-2 text-muted hover:text-txt cursor-pointer"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          {/* Test Section */}
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <button
              onClick={() => setTestExpanded(!testExpanded)}
              className="flex items-center justify-between text-xs text-muted hover:text-txt cursor-pointer"
            >
              <span>Test Action</span>
              <span>{testExpanded ? "▼" : "▶"}</span>
            </button>
            {testExpanded && (
              <div className="flex flex-col gap-2 pl-2 border-l-2 border-border">
                {parameters.filter(p => p.name.trim()).map((param) => (
                  <div key={param.name} className="flex flex-col gap-1">
                    <label className="text-xs text-muted">{param.name}</label>
                    <input
                      type="text"
                      value={testParams[param.name] || ""}
                      onChange={(e) => setTestParams({ ...testParams, [param.name]: e.target.value })}
                      placeholder={param.description || "value"}
                      className="bg-surface border border-border px-2 py-1.5 text-sm text-txt placeholder:text-muted/50 outline-none focus:border-accent"
                    />
                  </div>
                ))}
                {testResult && (
                  <div className="bg-surface border border-border p-2 text-xs font-mono">
                    {testResult.error && (
                      <div className="text-red-400">Error: {testResult.error}</div>
                    )}
                    {testResult.output && (
                      <pre className="text-txt whitespace-pre-wrap">{testResult.output}</pre>
                    )}
                    {testResult.duration !== undefined && (
                      <div className="text-muted mt-1">Duration: {testResult.duration}ms</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          {testExpanded && (
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-1.5 text-xs border border-border text-muted hover:text-txt cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? "Testing..." : "Test"}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs border border-border text-muted hover:text-txt cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs border border-accent bg-accent text-white hover:opacity-90 cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
