declare module "electrobun/view" {
  type WebviewEventHandler = (...args: unknown[]) => void;

  export interface WebviewTagElement extends HTMLElement {
    src: string;
    partition: string;
    loadURL(url: string): void;
    on(event: string, handler: WebviewEventHandler): void;
    off(event: string, handler: WebviewEventHandler): void;
    goBack(): void;
    goForward(): void;
    reload(): void;
    canGoBack(): boolean;
    canGoForward(): boolean;
  }
}
