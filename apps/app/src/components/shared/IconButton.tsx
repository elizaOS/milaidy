import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonVariant = "ghost" | "accent" | "danger";
type IconButtonSize = "sm" | "md";

interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  label: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  active?: boolean;
}

const SIZE_CLASS: Record<IconButtonSize, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11 min-h-[44px] min-w-[44px]",
};

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  ghost: "btn-ghost text-txt hover:text-accent",
  accent: "btn-accent",
  danger: "border-danger bg-danger/10 text-danger hover:bg-danger/20",
};

export function IconButton({
  active = false,
  children,
  className = "",
  label,
  size = "md",
  type = "button",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  const activeClass =
    active && variant === "ghost"
      ? "border-accent bg-accent-subtle text-accent"
      : "";

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`${SIZE_CLASS[size]} inline-flex items-center justify-center rounded-md border transition-all duration-200 focus-ring ${VARIANT_CLASS[variant]} ${activeClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
