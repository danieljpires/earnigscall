import * as React from "react"
import { cn } from "@/lib/utils"

export interface ScoreBarProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  score: number; // 0 to 100
  color?: "blue" | "emerald" | "rose" | "amber" | "indigo";
}

export function ScoreBar({ label, score, color = "blue", className, ...props }: ScoreBarProps) {
  const colorMap = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    amber: "bg-amber-500",
    indigo: "bg-indigo-500",
  }

  const bgMap = {
    blue: "bg-blue-100 dark:bg-blue-950/50",
    emerald: "bg-emerald-100 dark:bg-emerald-950/50",
    rose: "bg-rose-100 dark:bg-rose-950/50",
    amber: "bg-amber-100 dark:bg-amber-950/50",
    indigo: "bg-indigo-100 dark:bg-indigo-950/50",
  }

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="font-semibold text-gray-900 dark:text-gray-100">{score.toFixed(0)}</span>
      </div>
      <div className={cn("h-2 w-full overflow-hidden rounded-full", bgMap[color])}>
        <div
          className={cn("h-full rounded-full transition-all duration-1000 ease-out", colorMap[color])}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  )
}
