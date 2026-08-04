import { cn } from "@/lib/utils"

export function BalancedCardGrid({ className, ...props }) {
  return (
    <div
      className={cn(
        "grid items-stretch gap-4 [&>[data-slot=card]]:h-full",
        className,
      )}
      {...props}
    />
  )
}
