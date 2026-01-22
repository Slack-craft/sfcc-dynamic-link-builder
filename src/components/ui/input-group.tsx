import * as React from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

const InputGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex w-full items-stretch", className)}
      {...props}
    />
  )
)
InputGroup.displayName = "InputGroup"

const InputGroupAddon = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center border border-input bg-background px-2 text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
)
InputGroupAddon.displayName = "InputGroupAddon"

const InputGroupText = React.forwardRef<HTMLSpanElement, React.ComponentProps<"span">>(
  ({ className, ...props }, ref) => (
    <span ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
)
InputGroupText.displayName = "InputGroupText"

const InputGroupInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentPropsWithoutRef<typeof Input>
>(({ className, ...props }, ref) => (
  <Input
    ref={ref}
    className={cn("rounded-none border-l-0", className)}
    {...props}
  />
))
InputGroupInput.displayName = "InputGroupInput"

export { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText }
