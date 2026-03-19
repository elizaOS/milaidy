declare namespace JSX {
  interface IntrinsicElements {
    "electrobun-webview": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    > & {
      html?: string;
      partition?: string;
      preload?: string;
      renderer?: "cef" | "native";
      sandbox?: boolean | "" | "true";
      src?: string;
    };
  }
}
