import * as React from "react"
import { cn } from "../../lib/utils"

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export function SectionHeader({ title, description, icon, className, ...props }: SectionHeaderProps) {
  return (
    <div className={cn("mb-6 space-y-1", className)} {...props}>
      <div className="flex items-center space-x-2">
        {icon && <div className="text-gray-500 dark:text-gray-400">{icon}</div>}
        <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
          {title}
        </h2>
      </div>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
    </div>
  )
}
