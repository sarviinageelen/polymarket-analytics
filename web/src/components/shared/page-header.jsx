import { cn } from "@/lib/utils"

export function PageHeader({ eyebrow, title, description, meta, actions, className }) {
  return (
    <header className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
      </div>
      {(meta || actions) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {meta}
          {actions}
        </div>
      )}
    </header>
  )
}
