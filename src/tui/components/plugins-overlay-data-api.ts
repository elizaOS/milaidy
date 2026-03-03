export async function installPluginViaApiRequest(
  request: <T>(routePath: string, init?: RequestInit) => Promise<T>,
  name: string,
): Promise<{ success: boolean; message: string }> {
  const response = await request<{
    ok?: boolean;
    message?: string;
    error?: string;
    plugin?: { name?: string; version?: string };
    requiresRestart?: boolean;
  }>("/api/plugins/install", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    return {
      success: false,
      message: response.error ?? `Failed to install ${name}`,
    };
  }

  const pluginName = response.plugin?.name ?? name;
  const version = response.plugin?.version;
  const restartHint = response.requiresRestart
    ? " Restart milady to load it."
    : "";

  return {
    success: true,
    message:
      response.message ??
      `${pluginName}${version ? `@${version}` : ""} installed.${restartHint}`,
  };
}
