import {
  glassButton,
  glassButtonPrimary,
} from "@/lib/glass-styles";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "glass" | "glassSecondary";
  fullWidth?: boolean;
}

const variants = {
  // Inside .storefront-theme the indigo variables resolve to gold, on which
  // white type measures about 1.9:1 — hence the scoped text override. Admin and
  // marketing sit outside that scope and keep indigo with white text.
  primary:
    "bg-indigo-600 text-white storefront:text-[var(--ink-900)] hover:bg-indigo-700 disabled:bg-indigo-300",
  secondary: "bg-white text-gray-900 border border-gray-300 hover:bg-gray-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "bg-transparent text-indigo-600 hover:bg-indigo-50",
  glass: `${glassButtonPrimary} disabled:opacity-50`,
  glassSecondary: `${glassButton} disabled:opacity-50`,
};

export function Button({
  variant = "primary",
  fullWidth,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
