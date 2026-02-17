declare module "@elizaos/tui" {
  export interface Component {
    render(width: number): string[];
    invalidate(): void;
  }

  export interface Focusable {
    focused: boolean;
    handleInput(data: string): void;
  }

  export interface SelectItem {
    value: string;
    label: string;
    description?: string;
  }

  export interface OverlayHandle {
    hide(): void;
  }

  export type AutocompleteItem = {
    value: string;
    label: string;
    description?: string;
  };

  export type SlashCommand = {
    name: string;
    description?: string;
  };

  export interface SelectListTheme {
    selectedPrefix?: (text: string) => string;
    selectedText?: (text: string) => string;
    description?: (text: string) => string;
    scrollInfo?: (text: string) => string;
    noMatch?: (text: string) => string;
  }

  export interface EditorTheme {
    borderColor?: (text: string) => string;
    selectList?: SelectListTheme;
  }

  export interface MarkdownTheme {
    heading?: (text: string) => string;
    link?: (text: string) => string;
    linkUrl?: (text: string) => string;
    code?: (text: string) => string;
    codeBlock?: (text: string) => string;
    codeBlockBorder?: (text: string) => string;
    quote?: (text: string) => string;
    quoteBorder?: (text: string) => string;
    hr?: (text: string) => string;
    listBullet?: (text: string) => string;
    bold?: (text: string) => string;
    italic?: (text: string) => string;
    strikethrough?: (text: string) => string;
    underline?: (text: string) => string;
  }

  export class ProcessTerminal {}

  export class Container implements Component {
    addChild(component: Component): void;
    clear(): void;
    render(width: number): string[];
    invalidate(): void;
  }

  export class Text implements Component {
    constructor(text: string, paddingX?: number, paddingY?: number);
    render(width: number): string[];
    invalidate(): void;
  }

  export class Spacer implements Component {
    constructor(lines?: number);
    render(width: number): string[];
    invalidate(): void;
  }

  export class Markdown implements Component {
    constructor(
      text: string,
      paddingX?: number,
      paddingY?: number,
      theme?: MarkdownTheme,
    );
    setText(text: string): void;
    render(width: number): string[];
    invalidate(): void;
  }

  export class Input implements Focusable, Component {
    focused: boolean;
    setValue(value: string): void;
    getValue(): string;
    handleInput(data: string): void;
    render(width: number): string[];
    invalidate(): void;
  }

  export class SelectList implements Focusable, Component {
    focused: boolean;
    onSelect?: (item: SelectItem) => void;
    onCancel?: () => void;
    constructor(
      items: SelectItem[],
      visibleCount?: number,
      theme?: SelectListTheme,
    );
    setSelectedIndex(index: number): void;
    setFilter(filter: string): void;
    handleInput(data: string): void;
    render(width: number): string[];
    invalidate(): void;
  }

  export class CombinedAutocompleteProvider {
    constructor(commands: SlashCommand[]);
  }

  export class Editor implements Focusable, Component {
    focused: boolean;
    onSubmit?: (text: string) => void;
    constructor(ui: TUI, theme?: EditorTheme, options?: { paddingX?: number });
    setText(value: string): void;
    addToHistory(value: string): void;
    setAutocompleteProvider(provider: CombinedAutocompleteProvider): void;
    handleInput(data: string): void;
    render(width: number): string[];
    invalidate(): void;
  }

  export class Loader implements Component {
    constructor(
      tui: TUI,
      spinnerFormatter: (spinner: string) => string,
      textFormatter: (text: string) => string,
      text?: string,
    );
    stop(): void;
    render(width: number): string[];
    invalidate(): void;
  }

  export class TUI {
    constructor(terminal?: ProcessTerminal);
    addChild(component: Component): void;
    setFocus(component: Focusable): void;
    start(): void;
    stop(): void;
    requestRender(): void;
    showOverlay(
      component: Component,
      options?: { anchor?: string; width?: string; maxHeight?: string },
    ): OverlayHandle;
  }

  export function matchesKey(data: string, key: string): boolean;
  export function visibleWidth(text: string): number;
  export function wrapTextWithAnsi(text: string, width: number): string[];
  export function truncateToWidth(
    text: string,
    width: number,
    ellipsis?: string,
  ): string;

  export function getEditorKeybindings(): {
    matches(data: string, key: string): boolean;
  };
}
