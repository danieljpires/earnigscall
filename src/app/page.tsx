"use client";

import React, { useState, useEffect, Suspense } from "react";
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
  const [loadingStep, setLoadingStep] = useState(0);

  const fetchWithRetry = async (url: string, options: any, maxRetries = 2): Promise<Response> => {
    let lastErr: any;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const res = await fetch(url, options);
        if (res.status >= 500 && i < maxRetries) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return res;
      } catch (err) {
        lastErr = err;
        if (i < maxRetries) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      }
    }
    throw lastErr || new Error("Connection failed");
  };

  const handleAnalyze = async (ticker: string, manualTranscript?: string, companyName?: string) => {
    setIsLoading(true);
    setError(null);
    setReport(null);
    setProgress(10);
    setLoadingStep(1);

    try {
      const res = await fetchWithRetry("/api/earnings-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, language, manualTranscript, companyName }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Server Error" }));
        throw new Error(errData.error || "Failed to load transcript");
      }

      const data = await res.json();
      if (!data.report) throw new Error("Invalid response from server");

      setReport(data.report);
      setProgress(40);

      // Start Parallel Synthesis and Q&A
      if (data.report.isPartial) {
        setLoadingStep(5);
        
        // 1. Synthesis Task
        const synthPromise = (async () => {
          try {
            const sRes = await fetch("/api/analysis/synthesis", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ticker,
                year: data.report.year,
                quarter: data.report.quarter,
                language,
                overallSentiment: data.report.localAnalysis?.overallSentiment
              }),
            });
            if (sRes.ok) {
              const sData = await sRes.json();
              if (sData.synthesis) {
                setReport(prev => prev ? {
                  ...prev,
                  geminiAnalysis: { ...prev.geminiAnalysis, ...sData.synthesis }
                } : null);
              }
            }
          } catch (e) { console.error("Synthesis failed", e); }
        })();

        // 2. Q&A Task (First 2 chunks only for speed)
        const qaPromise = (async () => {
           const chunks = data.report.geminiAnalysis?.chunkCount || 0;
           for (let i = 0; i < Math.min(chunks, 3); i++) {
             try {
               const qRes = await fetch("/api/analysis/qa", {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({
                   ticker, year: data.report.year, quarter: data.report.quarter,
                   chunkIndex: i, language, isManual: !!manualTranscript
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
                         qaAnalysis: [...currentQA, ...qData.qaAnalysis]
                       }
                     };
                   });
                 }
               }
             } catch (e) {}
             setProgress(prev => Math.min(prev + 20, 95));
           }
        })();

        await Promise.all([synthPromise, qaPromise]);
      }
      
      setProgress(100);
      setLoadingStep(6);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
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
        <h2 className="text-4xl font-extrabold text-gray-900 dark:text-gray-50 mb-4">{t("heroTitle")}</h2>
        
        {!isLoading && (
          <div className="flex justify-center mb-6">
            <button onClick={() => setInputMode(inputMode === "ticker" ? "manual" : "ticker")} className="text-blue-600 font-medium">
              {inputMode === "ticker" ? t("toggleToManual") : t("toggleToSearch")}
            </button>
          </div>
        )}

        {inputMode === "ticker" ? (
          <TickerAutocomplete onSelect={(t, name) => handleAnalyze(t, undefined, name)} isLoading={isLoading} />
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto text-left">
            <input value={manualTicker} onChange={e => setManualTicker(e.target.value)} placeholder="Ticker (ex: MSFT)" className="w-full p-4 rounded-xl border dark:bg-gray-900" />
            <textarea rows={6} value={manualText} onChange={e => setManualText(e.target.value)} placeholder="Cole aqui a transcrição..." className="w-full p-4 rounded-xl border dark:bg-gray-900" />
            <button onClick={() => handleAnalyze(manualTicker, manualText)} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold">Analisar</button>
          </div>
        )}

        {isLoading && (
          <div className="mt-8 flex flex-col items-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
            <p className="text-blue-700 font-medium">{t(`loadingStep${loadingStep}`)}</p>
            <div className="w-64 bg-gray-200 h-2 rounded-full mt-4 overflow-hidden">
               <div className="bg-blue-600 h-full transition-all" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-8 p-4 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 flex items-center justify-center">
            <AlertCircle className="mr-2" /> {error}
          </div>
        )}
      </section>

      {report && (
        <div className="mx-auto max-w-6xl px-6">
          <EarningsReport report={report} />
        </div>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>}>
      <HomeContent />
    </Suspense>
  );
}
