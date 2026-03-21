import { useTheme } from "next-themes";
import { jsx as _jsx } from "react/jsx-runtime";
import { Toaster as Sonner } from "sonner";

const Toaster = ({ ...props }) => {
  const { theme = "system" } = useTheme();
  return _jsx(Sonner, {
    theme: theme,
    className: "toaster group",
    toastOptions: {
      classNames: {
        toast:
          "group toast group-[.toaster]:bg-bg group-[.toaster]:text-txt group-[.toaster]:border-border group-[.toaster]:shadow-lg",
        description: "group-[.toast]:text-muted",
        actionButton:
          "group-[.toast]:bg-primary group-[.toast]:text-primary-fg",
        cancelButton: "group-[.toast]:bg-bg-accent group-[.toast]:text-muted",
      },
    },
    ...props,
  });
};

export { Toaster };
