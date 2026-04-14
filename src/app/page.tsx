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

  // Auto-populate from URL parameters (Bookmarklet support)
  useEffect(() => {
    const urlTicker = searchParams.get("ticker");
    const isManualRequested = searchParams.get("manual") === "true";
    
    if (urlTicker || isManualRequested) {
      setInputMode("manual");
      if (urlTicker) setManualTicker(urlTicker);
      
      // Focus the textarea after a short delay
      setTimeout(() => {
        const textarea = document.querySelector('textarea');
        if (textarea) textarea.focus();
      }, 500);
    }
  }, [searchParams]);

  const handleAnalyze = async (ticker: string, manualTranscript?: string, companyName?: string) => {
    setIsLoading(true);
    setError(null);
    setReport(null);
    setProgress(0);
    setLoadingStep(1);

    let progressInterval: NodeJS.Timeout | null = null;
    
    // Start progress simulation for the initial phase
    progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        const increment = prev < 30 ? 1 : 0.2;
        return Math.min(prev + increment, 90);
      });
    }, 500);

    try {
      // 1. Final Analysis Request (Covers Manual, SDK, and Scraper Fallbacks)
      setLoadingStep(4); // "Generating synthesis..."
      const res = await fetch("/api/earnings-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          ticker, 
          language, 
          manualTranscript, 
          companyName
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "ERRO" }));
        throw new Error(errData.error || t("error"));
      }

      const data = await res.json();
      if (data.report) {
        setReport(data.report);
        
        // Phase 2: Parallel Q&A Extraction
        if (data.report.geminiAnalysis?.chunkCount > 0) {
          const totalChunks = data.report.geminiAnalysis.chunkCount;
          setLoadingStep(5); // "Extracting Q&A..."
          
          // Create an array of tasks and execute them in parallel
          const qaTasks = Array.from({ length: totalChunks }, (_, i) => i).map(async (i) => {
            try {
              const qaRes = await fetch("/api/analysis/qa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ticker,
                  year: data.report.year,
                  quarter: data.report.quarter,
                  chunkIndex: i,
                  isManual: !!manualTranscript,
                  language,
                  transcript: data.report.transcript // Sincronizado com a v16.2
                }),
              });
              
              if (qaRes.ok) {
                const qaData = await qaRes.json();
                const newQA = qaData.qaAnalysis || [];
                
                setReport((prev: any) => {
                  if (!prev) return prev;
                  const combined = [...(prev.geminiAnalysis.qaAnalysis || []), ...newQA];
                  // Local deduplication for overlapping chunks
                  const seen = new Set();
                  const unique = combined.filter((item: any) => {
                    if (!item.question || item.question.length < 5) return false;
                    
                    const analystKey = (item.questionBy || "unknown").toLowerCase().substring(0, 30).trim();
                    const qText = item.question.toLowerCase().trim();
                    const questionKey = qText.length > 500 
                      ? qText.substring(0, 200) + "..." + qText.substring(qText.length - 200)
                      : qText;

                    const answerKey = (item.answer || "").substring(0, 100).toLowerCase().trim();
                    const compositeKey = `${analystKey}|${questionKey}|${answerKey.substring(0, 30)}`;
                    
                    if (seen.has(compositeKey)) return false;
                    seen.add(compositeKey);
                    return true;
                  });
                  
                  return {
                    ...prev,
                    geminiAnalysis: {
                      ...prev.geminiAnalysis,
                      qaAnalysis: unique,
                      extractedQuestionCount: unique.length
                    }
                  };
                });
              }
              setProgress((prev) => Math.min(prev + (10 / totalChunks), 100));
            } catch (qaErr) {
              console.error(`Failed to load Q&A chunk ${i}:`, qaErr);
            }
          });

          await Promise.all(qaTasks);
          setLoadingStep(6);
          
          setReport((prev: any) => {
            if (!prev) return prev;
            return { ...prev, isPartial: false };
          });
        } else {
          setProgress(100);
          setLoadingStep(6);
        }
      } else {
        throw new Error(t("error"));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || t("error"));
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen pb-24">
      {/* HEADER EXATO DO ORIGINAL */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-40 dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <BarChart2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-50 uppercase">
                {t("appTitle") || "Earnings Call Intelligence"}
              </h1>
              <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1 font-medium bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Gemini 1.5 Flash Active
              </p>
            </div>
          </div>
          <div className="print-hidden">
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* HERO SECTION ORIGINAL */}
      <section className="mx-auto max-w-4xl px-6 pt-12 pb-12 text-center print-hidden">
        <div className="flex justify-center mb-8">
           <img 
             src="/logo.png" 
             alt="Logo" 
             className="h-28 w-auto object-contain" 
           />
        </div>

        <h2 className="mb-8 text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl dark:text-gray-50">
          {t("heroTitle")} <br />
          <span className="text-blue-600 dark:text-blue-500">{t("heroSubtitle")}</span>
        </h2>
        
        {!isLoading && (
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setInputMode(inputMode === "ticker" ? "manual" : "ticker")}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition bg-blue-50 px-4 py-2 rounded-full"
            >
              {inputMode === "ticker" ? t("toggleToManual") : t("toggleToSearch")}
            </button>
          </div>
        )}

        {inputMode === "ticker" ? (
          <TickerAutocomplete onSelect={(t, name) => handleAnalyze(t, undefined, name)} isLoading={isLoading} />
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto text-left">
            <input 
              type="text" 
              value={manualTicker} 
              onChange={(e) => setManualTicker(e.target.value)} 
              placeholder={t("manualPlaceholderTicker")} 
              className="w-full p-4 rounded-xl border border-gray-300 bg-white disabled:opacity-50"
              disabled={isLoading}
            />
            <textarea 
              rows={8}
              value={manualText} 
              onChange={(e) => setManualText(e.target.value)} 
              placeholder={t("manualPlaceholderTranscript")} 
              className="w-full p-4 rounded-xl border border-gray-300 bg-white font-mono text-sm disabled:opacity-50"
              disabled={isLoading}
            />
            <button
              onClick={() => handleAnalyze(manualTicker.trim(), manualText.trim())}
              disabled={isLoading || !manualTicker.trim() || !manualText.trim()}
              className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition disabled:opacity-50"
            >
              {t("manualAnalyzeBtn")}
            </button>
          </div>
        )}
        
        {isLoading && (
          <div className="mt-12 flex flex-col items-center justify-center space-y-6 max-w-md mx-auto">
            <div className="w-full space-y-2">
              <div className="flex justify-between items-end mb-1">
                <p className="text-sm font-semibold text-blue-700">
                  {t(`loadingStep${loadingStep}`)}
                </p>
                <p className="text-xs font-bold text-gray-500">{Math.round(progress)}%</p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-8 flex items-center justify-center space-x-2 rounded-xl bg-rose-50 px-6 py-4 text-rose-700 border border-rose-100">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}
      </section>

      {!isLoading && report && (
        <div className="mx-auto max-w-6xl px-6 mt-8">
          <EarningsReport report={report} />
        </div>
      )}

      {/* FOOTER ORIGINAL COM NOMES */}
      <footer className="mt-16 border-t border-gray-200 py-8 mx-auto max-w-6xl px-6 text-center text-sm text-gray-500">
        <p>
          Trabalho realizado por: <span className="font-semibold text-gray-700">Daniel Pires, Ricardo Lucas e Tiago Santos</span>, para a disciplina de <i>&quot;Inteligência Artificial&quot;</i>, Pós-Graduação Análise Financeira.
        </p>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin" /></div>}>
      <HomeContent />
    </Suspense>
  );
}
