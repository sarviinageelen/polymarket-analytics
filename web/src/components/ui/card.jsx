import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export const Card = forwardRef(function Card({ as: Component = "div", className, ...props }, ref) {
  return <Component {...props} ref={ref} className={cn("ui-card", className)} data-slot="card" />;
});

export const CardHeader = forwardRef(function CardHeader(
  { as: Component = "div", className, ...props },
  ref,
) {
  return <Component {...props} ref={ref} className={cn("ui-card-header", className)} data-slot="card-header" />;
});

export const CardTitle = forwardRef(function CardTitle(
  { as: Component = "h3", className, ...props },
  ref,
) {
  return <Component {...props} ref={ref} className={cn("ui-card-title", className)} data-slot="card-title" />;
});

export const CardDescription = forwardRef(function CardDescription(
  { as: Component = "p", className, ...props },
  ref,
) {
  return <Component {...props} ref={ref} className={cn("ui-card-description", className)} data-slot="card-description" />;
});

export const CardContent = forwardRef(function CardContent(
  { as: Component = "div", className, ...props },
  ref,
) {
  return <Component {...props} ref={ref} className={cn("ui-card-content", className)} data-slot="card-content" />;
});

export const CardFooter = forwardRef(function CardFooter(
  { as: Component = "div", className, ...props },
  ref,
) {
  return <Component {...props} ref={ref} className={cn("ui-card-footer", className)} data-slot="card-footer" />;
});

// Kept as a small compatibility alias while the domain views are migrated to Card names.
export const LayerCard = Card;
