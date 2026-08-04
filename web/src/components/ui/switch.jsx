import { forwardRef, useState } from "react";
import { cn } from "../../lib/utils";

export const Switch = forwardRef(function Switch(
  {
    checked,
    defaultChecked = false,
    onCheckedChange,
    className,
    disabled = false,
    onClick,
    type = "button",
    ...props
  },
  ref,
) {
  const [uncontrolledChecked, setUncontrolledChecked] = useState(Boolean(defaultChecked));
  const isControlled = checked !== undefined;
  const isChecked = isControlled ? Boolean(checked) : uncontrolledChecked;

  function handleClick(event) {
    onClick?.(event);
    if (event.defaultPrevented || disabled) return;

    const nextChecked = !isChecked;
    if (!isControlled) setUncontrolledChecked(nextChecked);
    onCheckedChange?.(nextChecked);
  }

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      role="switch"
      aria-checked={isChecked}
      aria-disabled={disabled || undefined}
      className={cn("ui-switch", isChecked && "is-checked", className)}
      disabled={disabled}
      data-state={isChecked ? "checked" : "unchecked"}
      onClick={handleClick}
    >
      <span className="ui-switch-thumb" aria-hidden="true" />
    </button>
  );
});
