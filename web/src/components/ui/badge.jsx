import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export const Badge = forwardRef(function Badge(
  { variant = "neutral", appearance, className, children, ...props },
  ref,
) {
  const hasDot = appearance === "dot";

  return (
    <span
      {...props}
      ref={ref}
      className={cn("ui-badge", `ui-badge-${variant}`, hasDot && "ui-badge-dot", className)}
      data-appearance={appearance}
      data-variant={variant}
    >
      {hasDot && <span className="ui-badge-dot-indicator" aria-hidden="true" />}
      {children}
    </span>
  );
});
