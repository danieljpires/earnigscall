"use client";

import React from "react";
import { FullReportData } from "@/types";
import { useLanguage } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Badge } from "./ui/badge";
import { ScoreBar } from "./ui/score-bar";
import { SectionHeader } from "./ui/section-header";
import { QAItem } from "./qa-block";
import { 
  BarChart3, BrainCircuit, CheckCircle2, ChevronRight, 
  Lightbulb, AlertTriangle, TrendingUp, Presentation, CheckSquare, XSquare, Target,
  ArrowUpRight, ArrowDownRight, Minus, 
  Plus, SearchCode, Languages
} from "lucide-react";

export function EarningsReport({ report }: { report: FullReportData }) {
  const { t } = useLanguage();
  const gemini = report.geminiAnalysis;
  const local = report.localAnalysis;

  if (!gemini || !local) return null;

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      <div className="space-y-12">
        <section className="grid gap-6 md:grid-cols-3 items-start">
          <div className="md:col-span-2 space-y-6">
            <Card className="border-l-4 border-l-blue-600 print:h-auto print-break-inside-avoid shadow-sm">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Presentation className="h-5 w-5 text-blue-600" />
                  <CardTitle>{t("executiveSummary")}</CardTitle>
                </div>
                <CardDescription>Q{report.quarter} {report.year} Earnings Synthesis</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">
                  {gemini.executiveSummary}
                </p>
                
                <div className="mt-6">
                  <p className="text-sm font-semibold text-gray-500 mb-3">{t("themeTags")}</p>
                  <div className="flex flex-wrap gap-2">
                    {gemini.keyThemes?.map((theme, i) => (
                      <Badge key={i} variant="secondary">{theme}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="print:h-auto">
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  <CardTitle>Call Intelligence Scores</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <ScoreBar label={t("scoreSentiment")} score={local.overallSentiment} color="blue" />
                <ScoreBar label={t("scoreConfidence")} score={gemini.scores?.confidence || 50} color="emerald" />
                <ScoreBar label={t("scoreDefensiveness")} score={gemini.scores?.defensiveness || 50} color="amber" />
                <ScoreBar label={t("scoreRisk")} score={gemini.scores?.risk || 50} color="rose" />
                <ScoreBar label={t("scoreOutlook")} score={gemini.scores?.outlook || 50} color="indigo" />
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card className="border-t-4 border-t-emerald-500 print:h-auto print-break-inside-avoid shadow-sm">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" />
                <CardTitle>{t("bullishCase")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300">{gemini.bullishCase}</p>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 p-4 rounded-xl">
                <span className="font-semibold text-emerald-800 dark:text-emerald-400 block mb-1">{t("biggestOpportunity")}</span>
                <span className="text-emerald-700 dark:text-emerald-500 text-sm">{gemini.biggestOpportunity}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-rose-500 print:h-auto print-break-inside-avoid shadow-sm">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-rose-600" />
                <CardTitle>{t("bearishCase")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-700 dark:text-gray-300">{gemini.bearishCase}</p>
              <div className="bg-rose-50 dark:bg-rose-950/30 p-4 rounded-xl">
                <span className="font-semibold text-rose-800 dark:text-rose-400 block mb-1">{t("biggestRisk")}</span>
                <span className="text-rose-700 dark:text-rose-500 text-sm">{gemini.biggestRisk}</span>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="print-break-inside-avoid">
            <SectionHeader title={t("positives")} icon={<CheckSquare />} />
            <ul className="space-y-3">
              {gemini.positives?.map((pos, i) => (
                <li key={i} className="flex items-start">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mr-3 shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">{pos}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="print-break-inside-avoid">
            <SectionHeader title={t("negatives")} icon={<XSquare />} />
            <ul className="space-y-3">
              {gemini.negatives?.map((neg, i) => (
                <li key={i} className="flex items-start">
                  <AlertTriangle className="h-5 w-5 text-rose-500 mr-3 shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300">{neg}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card className="print:h-auto print-break-inside-avoid shadow-sm">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Target className="h-5 w-5 text-blue-600" />
                <CardTitle>{t("driversToWatch")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {gemini.driversToWatch?.map((driver, i) => (
                  <div key={i} className="border-b border-gray-100 dark:border-gray-800 pb-4 last:border-0 last:pb-0">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{driver.driver}</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{driver.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="print:h-auto print-break-inside-avoid shadow-sm">
              <CardHeader>
                <CardTitle>{t("managementOutlook")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{gemini.managementOutlook}</p>
              </CardContent>
            </Card>

            <Card className="print:h-auto print-break-inside-avoid shadow-sm">
              <CardHeader>
                <CardTitle>{t("behavioralRead")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{gemini.behavioralRead}</p>
              </CardContent>
            </Card>
          </div>
        </section>
        
        {report.hasPreviousCall && (gemini.previousCallComparison || gemini.comparisonMetrics) && (
          <section className="print-break-inside-avoid">
            <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-900/20 border-indigo-100 dark:border-indigo-900/50 shadow-sm overflow-hidden">
              <CardHeader className="border-b border-indigo-100/50 dark:border-indigo-900/50 pb-4">
                <CardTitle className="text-indigo-900 dark:text-indigo-400 flex items-center justify-between">
                  <span>{t("previousCallComparison")}</span>
                  <Badge variant="outline" className="bg-indigo-100/50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800">
                    Q{report.quarter - 1 || 4} vs Q{report.quarter}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Quantitative Metrics Grid */}
                {gemini.comparisonMetrics && gemini.comparisonMetrics.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {gemini.comparisonMetrics.map((item, idx) => (
                      <div key={idx} className="bg-white/60 dark:bg-gray-900/60 p-4 rounded-xl border border-indigo-100/50 dark:border-indigo-900/50 shadow-sm transition-all hover:shadow-md">
                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">{item.metric}</p>
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{item.currentValue}</p>
                            <p className="text-[10px] text-gray-500 font-medium">Anterior: {item.previousValue}</p>
                          </div>
                          <div className={`flex flex-col items-end ${item.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {item.isPositive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
                            <span className="text-xs font-bold">{item.difference}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Qualitative Synthesis */}
                {gemini.previousCallComparison && (
                  <div className="bg-indigo-100/30 dark:bg-indigo-900/20 p-5 rounded-2xl border border-indigo-100/50 dark:border-indigo-900/50">
                    <p className="text-indigo-900 dark:text-indigo-200 leading-relaxed font-medium">
                      {gemini.previousCallComparison}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {report.hasPreviousCall && gemini.deltaAnalysis && (
          <section className="print-break-inside-avoid">
            <SectionHeader 
              title={t("deltaAnalysisTitle")} 
              icon={<Languages className="h-6 w-6 text-indigo-600" />} 
              description="Deteção semântica de mudanças de tom e estratégia entre trimestres."
            />
            
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-tighter flex items-center">
                    <div className="w-2 h-2 rounded-full bg-gray-400 mr-2" />
                    {t("deltaPrevious")}
                  </h4>
                  <div className="p-5 bg-gray-50 dark:bg-gray-900/40 rounded-2xl border border-gray-100 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-400 leading-relaxed italic line-clamp-6 hover:line-clamp-none transition-all cursor-help">
                    "{gemini.deltaAnalysis.previousSnippet}"
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-tighter flex items-center">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 mr-2" />
                    {t("deltaCurrent")}
                  </h4>
                  <div className="p-5 bg-indigo-50/30 dark:bg-indigo-900/10 rounded-2xl border border-indigo-100/30 dark:border-indigo-900/30 text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-medium line-clamp-6 hover:line-clamp-none transition-all cursor-help">
                    "{gemini.deltaAnalysis.currentSnippet}"
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                <div className="divide-y divide-gray-50 dark:divide-gray-900">
                  {gemini.deltaAnalysis.keyChanges.map((change, idx) => (
                    <div key={idx} className="p-6 flex items-start gap-4 hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors">
                      <div className={`shrink-0 p-2 rounded-lg ${
                        change.type === 'added' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40' : 
                        change.type === 'removed' ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/40' : 
                        'bg-blue-100 text-blue-600 dark:bg-blue-950/40'
                      }`}>
                        {change.type === 'added' ? <Plus className="h-5 w-5" /> : 
                         change.type === 'removed' ? <Minus className="h-5 w-5" /> : 
                         <SearchCode className="h-5 w-5" />}
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <code className={`text-sm font-bold px-1.5 py-0.5 rounded ${
                            change.type === 'added' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50' : 
                            change.type === 'removed' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/50 line-through' : 
                            'bg-blue-50 text-blue-700 dark:bg-blue-900/50'
                          }`}>
                            {change.phrase}
                          </code>
                          <Badge variant="outline" className="text-[10px] uppercase font-black tracking-widest border-0 opacity-50">
                            {change.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed italic">
                          <span className="font-bold text-gray-400 not-italic mr-1">{t("deltaInsight")}:</span>
                          {change.insight}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <SectionHeader 
              title={t("questionsAndAnswers")} 
              description={t("questionsAndAnswersSubtitle")}
              icon={<BrainCircuit className="h-6 w-6 text-gray-600" />} 
              className="mb-0"
            />
            {gemini.targetQuestionCount !== undefined && (
              <Badge 
                variant={
                  (gemini.targetQuestionCount && gemini.targetQuestionCount > 0) ? (
                    gemini.extractedQuestionCount === gemini.targetQuestionCount ? "positive" : 
                    (gemini.extractedQuestionCount || 0) > ((gemini.targetQuestionCount || 0) * 0.8) ? "warning" : "negative"
                  ) : "secondary"
                } 
                className="flex items-center space-x-1 py-1.5 px-3"
              >
                {gemini.extractedQuestionCount === gemini.targetQuestionCount ? (
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                )}
                <span>
                  Integridade: {gemini.extractedQuestionCount} {gemini.targetQuestionCount && gemini.targetQuestionCount > 0 ? `/ ${gemini.targetQuestionCount}` : ""} interações
                </span>
              </Badge>
            )}
          </div>
          <div className="space-y-8">
            {gemini.qaAnalysis?.map((qa, i) => (
              <QAItem key={qa.id || i} qa={qa} className="print-break-inside-avoid pt-6 border-t border-gray-100" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
