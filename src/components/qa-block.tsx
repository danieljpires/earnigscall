"use client";

import React, { useState } from "react";
import { QABlock } from "@/types";
import { useLanguage } from "@/lib/i18n";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { MessageCircle, User, Zap, ChevronDown, ChevronUp } from "lucide-react";

export function QAItem({ qa, className }: { qa: QABlock; className?: string }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  // Attempt to categorize significance based on sentiment and behavior
  const behaviorColor = qa.behavioralLabel?.toLowerCase().includes("defensive") 
    ? "warning" 
    : qa.behavioralLabel?.toLowerCase().includes("confident")
      ? "positive" : "secondary";

  const sentimentColor = qa.sentimentScore > 20 
    ? "positive" 
    : qa.sentimentScore < -20 
      ? "negative" : "neutral";

  return (
    <Card className={`overflow-hidden ${className || ""}`}>
      <div className="bg-gray-50 px-6 py-4 dark:bg-gray-900/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t("questionBy")}</p>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">{qa.questionBy}</h4>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant={sentimentColor as any}>{t("sentiment")} {qa.sentimentLabel || ""}</Badge>
            {qa.behavioralLabel && (
              <Badge variant={behaviorColor as any}>{qa.behavioralLabel}</Badge>
            )}
          </div>
        </div>
        
        <div className="mt-4">
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            <span className="font-medium">Q: </span> {qa.question}
          </p>
        </div>
      </div>

      <CardContent className="px-6 py-5">
        <div className="flex items-start space-x-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{t("answeredBy")} {qa.answeredBy}</p>
            <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-200">
              {expanded ? (
                qa.answer
              ) : (
                <>
                  {qa.answer?.substring(0, 300) || ""}
                  {(qa.answer?.length || 0) > 300 && "..."}
                </>
              )}
            </div>
            
            {(qa.answer?.length || 0) > 300 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                {expanded ? (
                  <><ChevronUp className="mr-1 h-4 w-4" /> Ver Menos</>
                ) : (
                  <><ChevronDown className="mr-1 h-4 w-4" /> Ler Completo</>
                )}
              </button>
            )}

            {qa.importanceDescription && (
              <div className="mt-4 rounded-xl bg-amber-50 p-4 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
                <div className="flex items-center space-x-2 mb-2">
                  <Zap className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                  <span className="text-sm font-bold text-amber-900 dark:text-amber-400">{t("importance")}</span>
                </div>
                <p className="text-sm text-amber-800 dark:text-amber-500">{qa.importanceDescription}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
