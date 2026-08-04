import { forwardRef, useId } from "react";
import { cn } from "../../lib/utils";

export const Input = forwardRef(function Input(
  { label, className, wrapperClassName, containerClassName, disabled = false, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? (label != null ? generatedId : undefined);

  const input = (
    <input
      {...props}
      ref={ref}
      id={inputId}
      className={cn("native-input", "ui-input", className)}
      disabled={disabled}
    />
  );

  if (label == null) return input;

  return (
    <label
      className={cn("ui-field", disabled && "ui-field-disabled", wrapperClassName ?? containerClassName)}
      htmlFor={inputId}
    >
      <span className="field-label">{label}</span>
      {input}
    </label>
  );
});
