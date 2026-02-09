/**
 * Provider logo mapping
 * Maps provider IDs to their logo image paths for dark and light themes
 */

const PROVIDER_LOGO_MAP_DARK: Record<string, string> = {
  openai: "/logos/openai-icon-white.png",
  anthropic: "/logos/anthropic-icon.png",
  groq: "/logos/groq-icon-white.png",
  google: "/logos/gemini-icon.png",
  gemini: "/logos/gemini-icon.png",
  ollama: "/logos/ollama-icon-white.png",
  xai: "/logos/grok-icon-white.png",
  grok: "/logos/grok-icon-white.png",
  openrouter: "/logos/openrouter-icon-white.png",
  elizacloud: "/logos/elizaos-icon.png",
  deepseek: "/logos/deepseek-icon.png",
  mistral: "/logos/mistra-icon.png",
  together: "/logos/together-ai-icon.png",
  "together-ai": "/logos/together-ai-icon.png",
};

const PROVIDER_LOGO_MAP_LIGHT: Record<string, string> = {
  openai: "/logos/openai-icon.png",
  anthropic: "/logos/anthropic-icon.png",
  groq: "/logos/groq-icon.png",
  google: "/logos/gemini-icon.png",
  gemini: "/logos/gemini-icon.png",
  ollama: "/logos/ollama-icon.png",
  xai: "/logos/grok-icon.png",
  grok: "/logos/grok-icon.png",
  openrouter: "/logos/openrouter-icon.png",
  elizacloud: "/logos/elizaos-icon.png",
  deepseek: "/logos/deepseek-icon.png",
  mistral: "/logos/mistra-icon.png",
  together: "/logos/together-ai-icon.png",
  "together-ai": "/logos/together-ai-icon.png",
};

/**
 * Get the logo path for a provider based on theme
 * @param providerId - The provider ID (e.g., "openai", "anthropic")
 * @param isDarkMode - Whether dark mode is active (default: true)
 * @returns The logo image path or a fallback SVG data URI
 */
export function getProviderLogo(providerId: string, isDarkMode: boolean = true): string {
  const logoMap = isDarkMode ? PROVIDER_LOGO_MAP_DARK : PROVIDER_LOGO_MAP_LIGHT;
  const logo = logoMap[providerId.toLowerCase()];
  if (logo) {
    return logo;
  }

  // Fallback: generate a colored square with initials
  return generateFallbackLogo(providerId);
}

/**
 * Generate a fallback logo for unknown providers
 * Creates a colored square with the provider's initials
 */
function generateFallbackLogo(providerId: string): string {
  const initials = providerId.slice(0, 2).toUpperCase();
  const colors = ['3b82f6', 'ef4444', '10b981', 'f59e0b', '8b5cf6', 'ec4899'];
  const colorIndex = providerId.charCodeAt(0) % colors.length;
  const bgColor = colors[colorIndex];

  return `data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='24' height='24' rx='4' fill='%23${bgColor}'/%3E%3Ctext x='12' y='16' font-family='sans-serif' font-size='10' font-weight='bold' fill='white' text-anchor='middle'%3E${initials}%3C/text%3E%3C/svg%3E`;
}
