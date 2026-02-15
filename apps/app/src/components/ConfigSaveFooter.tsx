export function ConfigSaveFooter({
  dirty,
  saving,
  saveError,
  saveSuccess,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  onSave: () => void;
}) {
  if (!dirty) {
    return null;
  }

  return (
    <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--border)]">
      {saveError && (
        <span className="text-xs text-red-500">{saveError}</span>
      )}
      {saveSuccess && (
        <span className="text-xs text-green-600">Saved!</span>
      )}
      <button
        type="button"
        className="px-4 py-1.5 text-xs font-semibold bg-[var(--accent)] text-[var(--accent-foreground)] cursor-pointer hover:opacity-90 disabled:opacity-50"
        disabled={saving}
        onClick={onSave}
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
