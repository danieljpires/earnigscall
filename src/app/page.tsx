"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { TickerAutocomplete } from "@/components/ticker-autocomplete";
import { EarningsReport } from "@/components/earnings-report";
import { FullReportData } from "@/types";
import { Loader2, AlertCircle, BarChart2 } from "lucide-react";
import { Suspense } from "react";

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

  // Robust fetch with retry for high-demand API loads
  const fetchWithRetry = async (url: string, options: any, maxRetries = 3): Promise<Response> => {
    let lastErr: any;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const res = await fetch(url, options);
        
        // If it's a server error (500, 502, 503, 504), retry
        if (res.status >= 500 && i < maxRetries) {
           const delay = 1000 * Math.pow(2, i);
           console.warn(`[API] Server error ${res.status}. Retrying in ${delay}ms (Attempt ${i+1}/${maxRetries})...`);
           await new Promise(r => setTimeout(r, delay));
           continue;
        }
        
        const contentType = res.headers.get("content-type");
        // If response is OK but NOT JSON, it's likely a proxy error page (HTML)
        if (res.ok && (!contentType || !contentType.includes("application/json")) && i < maxRetries) {
          console.warn(`[API] Expected JSON but got HTML/Text. Proxy might be stalled. Retrying...`);
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        
        return res;
      } catch (err) {
        lastErr = err;
        if (i < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
    }
    throw lastErr || new Error("Failed after retries");
  };

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
      const res = await fetchWithRetry("/api/earnings-call", {
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
        const contentType = res.headers.get("content-type");
        let errorMsg = t("error");
        
        if (contentType && contentType.includes("application/json")) {
          try {
            const errData = await res.json();
            if (errData.error === "GEMINI_OVERLOAD") {
              throw new Error(t("geminiOverload") || errData.message);
            }
            errorMsg = errData.error || t("error");
          } catch (e) {
            console.error("Failed to parse error JSON", e);
          }
        } else {
          const text = await res.text();
          console.error("Server returned non-JSON response:", text.substring(0, 200));
          errorMsg = `Erro na API (${res.status}): O servidor devolveu HTML em vez de JSON. Verifique as chaves de API no servidor.`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data.report) {
        setReport(data.report);
        
          // 4. Phase 2: Parallel Q&A Extraction
          if (data.report.isPartial && data.report.geminiAnalysis?.chunkCount > 0) {
            const totalChunks = data.report.geminiAnalysis.chunkCount;
            setLoadingStep(5); // "Extracting Q&A..."
            
            // Create an array of tasks and execute them in parallel
            const qaTasks = Array.from({ length: totalChunks }, (_, i) => i).map(async (i) => {
              try {
                const qaRes = await fetchWithRetry("/api/analysis/qa", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ticker,
                    year: data.report.year,
                    quarter: data.report.quarter,
                    chunkIndex: i,
                    isManual: !!manualTranscript,
                    language,
                    knownAnalysts: data.report.geminiAnalysis.knownAnalysts
                  }),
                });
                
                if (qaRes.ok) {
                  const contentType = qaRes.headers.get("content-type");
                  if (contentType && contentType.includes("application/json")) {
                    const qaData = await qaRes.json();
                    const newQA = qaData.qaAnalysis || [];
                    
                    setReport((prev: any) => {
                      if (!prev) return prev;
                      const combined = [...(prev.geminiAnalysis.qaAnalysis || []), ...newQA];
                      // Local deduplication for overlapping chunks (matching backend logic)
                      const seen = new Set();
                      const unique = combined.filter((item: any) => {
                        if (!item.question || item.question.length < 10) return false;
                        
                        // SYNC: Global Robust Signature (Analyst + Partial Question + Partial Answer)
                        const analystKey = (item.questionBy || "unknown").toLowerCase().substring(0, 30).trim();
                        const qText = item.question.toLowerCase().trim();
                        // Mix of start/end to distinguish similar follow-ups globally
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
                }
                // Update progress incrementally
                setProgress((prev) => Math.min(prev + (10 / totalChunks), 100));
              } catch (qaErr) {
                console.error(`Failed to load Q&A chunk ${i}:`, qaErr);
              }
            });

            await Promise.all(qaTasks);
          
          // Finalize and Save to Cache
          setLoadingStep(6);
          
          setReport((prev: any) => {
            if (!prev) return prev;
            const finalReport = { ...prev, isPartial: false };
            
            // Non-blocking save to cache
            fetch("/api/analysis/save", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ticker: finalReport.ticker,
                year: finalReport.year,
                quarter: finalReport.quarter,
                language: finalReport.language,
                report: finalReport
              })
            }).catch(e => console.error("Failed to save final report:", e));
            
            return finalReport;
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
      {/* HEADER */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-40 dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md dark:bg-blue-700">
              <BarChart2 className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
                {t("appTitle")}
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

      {/* SEARCH / HERO SECTION */}
      <section className="mx-auto max-w-4xl px-6 pt-12 pb-12 text-center print-hidden">
        
        {/* LOGO SECTION */}
        <div className="flex justify-center mb-8">
           <img 
             src="/logo.png" 
             alt="Porto Business School - University of Porto" 
             className="h-28 w-auto object-contain drop-shadow-sm dark:brightness-200" 
           />
        </div>

        <h2 className="mb-8 text-4xl font-extrabold tracking-tight text-gray-900 md:text-5xl dark:text-gray-50">
          {t("heroTitle")} <br />
          <span className="text-blue-600 dark:text-blue-500">{t("heroSubtitle")}</span>
        </h2>
        
        {/* Toggle Mode */}
        {!isLoading && (
          <div className="flex justify-center mb-6">
            <button
              onClick={() => {
                setInputMode(inputMode === "ticker" ? "manual" : "ticker");
                setError(null);
              }}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition flex items-center bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-full"
            >
              {inputMode === "ticker" ? t("toggleToManual") : t("toggleToSearch")}
            </button>
          </div>
        )}

        {/* Input Area */}
        {inputMode === "ticker" ? (
          <TickerAutocomplete onSelect={(t, name) => handleAnalyze(t, undefined, name)} isLoading={isLoading} />
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto text-left animate-in fade-in zoom-in-95 duration-300">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("manualLabelTicker")}</label>
              <input 
                type="text" 
                value={manualTicker} 
                onChange={(e) => setManualTicker(e.target.value)} 
                placeholder={t("manualPlaceholderTicker")} 
                className="w-full p-4 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t("manualLabelTranscript")}</label>
              <textarea 
                rows={8}
                value={manualText} 
                onChange={(e) => setManualText(e.target.value)} 
                placeholder={t("manualPlaceholderTranscript")} 
                className="w-full p-4 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono text-sm disabled:opacity-50 resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                disabled={isLoading}
                spellCheck={false}
                data-gramm="false"
                data-lt-active="false"
              />
            </div>
            <button
              onClick={() => {
                if(!manualTicker.trim() || !manualText.trim()) {
                  setError("Please provide both a Ticker name and the Transcript text.");
                  return;
                }
              handleAnalyze(manualTicker.trim(), manualText.trim());
            }}
            disabled={isLoading || !manualTicker.trim() || !manualText.trim()}
            className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-lg"
          >
            {t("manualAnalyzeBtn")}
          </button>
          </div>
        )}
        
        {isLoading && (
          <div className="mt-12 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500 max-w-md mx-auto">
            <div className="w-full space-y-2">
              <div className="flex justify-between items-end mb-1">
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                  {t(`loadingStep${loadingStep}`)}
                </p>
                <p className="text-xs font-bold text-gray-500">{Math.round(progress)}%</p>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-3 overflow-hidden shadow-inner">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-500 ease-out rounded-full shadow-lg"
                  style={{ width: `${progress}%` }}
                >
                  <div className="w-full h-full bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] animate-[shimmer_2s_linear_infinite]"></div>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-400 font-medium">
              {t("loadingSubtitle")}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-8 flex items-center justify-center space-x-2 rounded-xl bg-rose-50 px-6 py-4 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 max-w-lg mx-auto border border-rose-100 dark:border-rose-900/50">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="font-medium text-left">{error}</span>
          </div>
        )}
      </section>

      {/* REPORT PRESENTATION */}
      {!isLoading && report && (
        <div className="mx-auto max-w-6xl px-6 mt-8 print-report-container print:mt-0">
          <div className="mb-12 border-b border-gray-200 pb-8 flex items-end justify-between dark:border-gray-800 print-hidden">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                {report.ticker} Intelligence
              </h2>
              <p className="text-gray-500 mt-2 font-medium dark:text-gray-400">
                Q{report.quarter} {report.year} Analysis ({report.language.toUpperCase()}) • {report.transcript?.length.toLocaleString()} caracteres processados
              </p>
            </div>
          </div>
          
          <EarningsReport report={report} />
        </div>
      )}
      {/* FOOTER */}
      <footer className="mt-16 border-t border-gray-200 dark:border-gray-800 py-8 mx-auto max-w-6xl px-6 text-center text-sm text-gray-500 dark:text-gray-400 print-hidden">
        <p>
          Trabalho realizado por: <span className="font-semibold text-gray-700 dark:text-gray-300">Daniel Pires, Ricardo Lucas e Tiago Santos</span>, para a disciplina de <i>&quot;Inteligência Artificial&quot;</i>, Pós-Graduação Análise Financeira.
        </p>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
