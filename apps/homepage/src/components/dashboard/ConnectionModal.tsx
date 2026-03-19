import { useState } from "react";

interface ConnectionModalProps {
  onSubmit: (data: {
    name: string;
    url: string;
    type: "remote";
    token?: string;
  }) => void;
  onClose: () => void;
}

export function ConnectionModal({ onSubmit, onClose }: ConnectionModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md mx-4 space-y-5 animate-fade-up shadow-2xl">
        <div>
          <h3 className="text-lg font-medium text-text-light">
            Connect Remote Agent
          </h3>
          <p className="text-sm text-text-muted mt-1">
            Connect to a self-hosted Milady backend.
          </p>
        </div>

        <label className="block">
          <span className="text-sm text-text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Remote Agent"
            className="mt-1.5 w-full bg-dark border border-border px-4 py-2.5 text-sm text-text-light rounded-xl
              focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/20
              placeholder:text-text-muted/50 transition-all duration-150"
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-muted">URL</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://my-agent.example.com"
            className="mt-1.5 w-full bg-dark border border-border px-4 py-2.5 text-sm text-text-light rounded-xl
              focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/20
              placeholder:text-text-muted/50 transition-all duration-150"
          />
        </label>

        <label className="block">
          <span className="text-sm text-text-muted">
            Access Key <span className="text-text-muted/50">(optional)</span>
          </span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="milady_xxx..."
            type="password"
            className="mt-1.5 w-full bg-dark border border-border px-4 py-2.5 text-sm text-text-light rounded-xl
              focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/20
              placeholder:text-text-muted/50 transition-all duration-150"
          />
        </label>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() =>
              onSubmit({ name, url, type: "remote", token: token || undefined })
            }
            disabled={!name || !url}
            className="flex-1 px-5 py-2.5 bg-brand text-dark font-medium text-sm rounded-xl
              hover:bg-brand-hover active:scale-[0.98] transition-all duration-150
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Connect
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-text-muted text-sm rounded-xl
              hover:text-text-light hover:bg-dark transition-all duration-150"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
