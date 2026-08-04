import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    className,
    children,
    disabled = false,
    type = "button",
    ...props
  },
  ref,
) {
  const isDisabled = Boolean(disabled || loading);

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cn("ui-button", `ui-button-${variant}`, `ui-button-${size}`, className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      data-loading={loading || undefined}
      data-size={size}
      data-variant={variant}
    >
      {loading && <span className="ui-button-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
});
