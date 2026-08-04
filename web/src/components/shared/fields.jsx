import { useId } from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

export function Field({ label, hint, children, className, htmlFor }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      {label && <Label htmlFor={htmlFor} className="text-xs font-medium">{label}</Label>}
      {children}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function SelectField({ label, value, onValueChange, options, placeholder, disabled, className, hint, ariaLabel }) {
  const generatedId = useId()
  return (
    <Field label={label} hint={hint} className={className} htmlFor={generatedId}>
      <Select value={value || ""} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={generatedId} className="h-10 w-full bg-background" aria-label={ariaLabel || label}>
          <SelectValue placeholder={placeholder || "Select an option"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => {
            const item = typeof option === "string" ? { value: option, label: option } : option
            return <SelectItem key={item.value} value={String(item.value)}>{item.label}</SelectItem>
          })}
        </SelectContent>
      </Select>
    </Field>
  )
}
