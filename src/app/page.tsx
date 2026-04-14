"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { TickerAutocomplete } from "@/components/ticker-autocomplete";
import { EarningsReport } from "@/components/earnings-report";
import { FullReportData } from "@/types";
import { Loader2, AlertCircle, BarChart2 } from "lucide-react";

function HomeContent() {
  const { t, language } = useLanguage();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<FullReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"ticker" | "manual">("ticker");
  const [manualTicker, setManualTicker] = useState("");
  const [manualText, setManualText] = useState("");
  const [progress, setProgress] = useState(0);

  const handleAnalyze = async (ticker: string, manualTranscript?: string, companyName?: string) => {
    setIsLoading(true);
    setError(null);
    setReport(null);
    setProgress(20);

    try {
      // PHASE 1: Combined Synthesis (Summary, Drivers, Outlook)
      // This call now waits for Gemini to finish the main analysis!
      const res = await fetch("/api/earnings-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, language, manualTranscript, companyName }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Erro de Servidor" }));
        throw new Error(errData.error || "A API do Gemini ou o servidor falhou.");
      }

      const data = await res.json();
      if (!data.report) throw new Error("Resposta inválida do servidor.");

      // Show results immediately
      setReport(data.report);
      setProgress(60);

      // PHASE 2: Background Q&A Extraction
      if (data.report.isPartial && data.report.geminiAnalysis?.chunkCount > 0) {
        const total = data.report.geminiAnalysis.chunkCount;
        // Process only first few chunks for background extraction to stay safe
        for (let i = 0; i < Math.min(total, 5); i++) {
          try {
            const qRes = await fetch("/api/analysis/qa", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ticker, 
                year: data.report.year, 
                quarter: data.report.quarter,
                chunkIndex: i, 
                language, 
                isManual: !!manualTranscript
              }),
            });
            if (qRes.ok) {
              const qData = await qRes.json();
              if (qData.qaAnalysis) {
                setReport(prev => {
                  if (!prev) return null;
                  const currentQA = prev.geminiAnalysis.qaAnalysis || [];
                  return {
                    ...prev,
                    geminiAnalysis: {
                      ...prev.geminiAnalysis,
                      qaAnalysis: [...currentQA, ...qData.qaAnalysis],
                      extractedQuestionCount: currentQA.length + qData.qaAnalysis.length
                    }
                  };
                });
              }
            }
          } catch (e) {
            console.error("QA Chunk failed:", i);
          }
          setProgress(prev => Math.min(prev + 10, 95));
        }
      }
      
      setProgress(100);
    } catch (err: any) {
      console.error("Analysis Failed:", err);
      setError(err.message || "Ocorreu um erro inesperado na análise.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen pb-24 bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-40 dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-2">
            <BarChart2 className="h-8 w-8 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">{t("appTitle")}</h1>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-12 pb-12 text-center">
        <div className="flex justify-center mb-8">
           <img src="/logo.png" alt="Logo" className="h-24 w-auto dark:brightness-200" />
        </div>
        <h2 className="text-4xl font-extrabold text-gray-900 dark:text-gray-50 mb-8">{t("heroTitle")}</h2>
        
        {!isLoading && (
          <div className="flex justify-center mb-6">
            <button onClick={() => setInputMode(inputMode === "ticker" ? "manual" : "ticker")} className="text-blue-600 font-medium bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-full">
              {inputMode === "ticker" ? t("toggleToManual") : t("toggleToSearch")}
            </button>
          </div>
        )}

        {inputMode === "ticker" ? (
          <TickerAutocomplete onSelect={(t, name) => handleAnalyze(t, undefined, name)} isLoading={isLoading} />
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto text-left bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Ticker</label>
              <input value={manualTicker} onChange={e => setManualTicker(e.target.value)} placeholder="MSFT" className="w-full p-4 rounded-xl border dark:border-gray-700 dark:bg-gray-800" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Transcrição</label>
              <textarea rows={6} value={manualText} onChange={e => setManualText(e.target.value)} placeholder="Cole aqui..." className="w-full p-4 rounded-xl border dark:border-gray-700 dark:bg-gray-800 font-mono text-xs" />
            </div>
            <button onClick={() => handleAnalyze(manualTicker, manualText)} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-95">Analisar Chamada</button>
          </div>
        )}

        {isLoading && (
          <div className="mt-12 flex flex-col items-center">
            <div className="relative h-16 w-16 mb-4">
              <Loader2 className="h-16 w-16 animate-spin text-blue-600" />
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-blue-700">{Math.round(progress)}%</div>
            </div>
            <p className="text-gray-500 font-medium">A analisar dados financeiros... (Pode demorar 10-15s)</p>
          </div>
        )}

        {error && (
          <div className="mt-8 p-6 bg-rose-50 text-rose-700 rounded-2xl border border-rose-100 flex items-start text-left max-w-lg mx-auto shadow-sm">
            <AlertCircle className="mr-3 h-6 w-6 shrink-0" /> 
            <div>
               <p className="font-bold mb-1">Erro na Analise</p>
               <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
      </section>

      {report && (
        <div className="mx-auto max-w-6xl px-6 animate-in fade-in duration-700">
          <EarningsReport report={report} />
        </div>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-950 font-bold text-blue-600">A carregar interface...</div>}>
      <HomeContent />
    </Suspense>
  );
}
