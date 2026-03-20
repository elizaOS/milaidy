declare module "electrobun/view" {
  export interface WebviewTagElement extends HTMLElement {
    src: string;
    partition: string;
    loadURL(url: string): void;
    on(event: string, handler: (...args: any[]) => void): void;
    off(event: string, handler: (...args: any[]) => void): void;
    goBack(): void;
    goForward(): void;
    reload(): void;
    canGoBack(): boolean;
    canGoForward(): boolean;
  }
}
