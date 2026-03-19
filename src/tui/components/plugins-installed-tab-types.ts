export interface PluginParam {
  key: string;
  label: string;
  value: string;
  required?: boolean;
  sensitive?: boolean;
  values?: string[];
}

export interface PluginListItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
  version: string;
  configStatus: { set: number; total: number };
  parameters: PluginParam[];
}

export interface InstalledTabOptions {
  getPlugins: () => Promise<PluginListItem[]>;
  onTogglePlugin: (id: string, enabled: boolean) => Promise<void>;
  onConfigSave: (id: string, config: Record<string, string>) => Promise<void>;
  onClose: () => void;
  requestRender: () => void;
}

export type InstalledTabState =
  | "list"
  | "edit-select"
  | "edit-value"
  | "add-key";
