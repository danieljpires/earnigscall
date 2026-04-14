"use client";

import React, { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { TickerAutocomplete } from "@/components/ticker-autocomplete";
import { EarningsReport } from "@/components/earnings-report";
import { FullReportData } from "@/types";
import { AlertCircle, BarChart2 } from "lucide-react";

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
    setProgress(5);

    try {
      // Smooth progress simulation
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return prev;
          }
          const increment = prev < 40 ? 4 : prev < 70 ? 1 : 0.2;
          return prev + increment;
        });
      }, 400);

      const res = await fetch("/api/earnings-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, language, manualTranscript, companyName }),
      });

      clearInterval(interval);
      setProgress(95);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Erro na Analise" }));
        throw new Error(errData.error || "A API falhou ou excedeu o tempo.");
      }

      const data = await res.json();
      if (!data.report) throw new Error("Resposta inválida.");

      setReport(data.report);
      setProgress(100);

      // Background QA Extraction (Silent)
      if (data.report.isPartial && data.report.geminiAnalysis?.chunkCount > 0) {
        const total = data.report.geminiAnalysis.chunkCount;
        for (let i = 0; i < Math.min(total, 4); i++) {
          fetch("/api/analysis/qa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ticker, year: data.report.year, quarter: data.report.quarter,
              chunkIndex: i, language, isManual: !!manualTranscript
            }),
          }).then(qr => qr.json()).then(qData => {
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
          }).catch(() => {});
        }
      }
    } catch (err: any) {
      setError(err.message || "Erro inesperado.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen pb-24 bg-gray-50 dark:bg-gray-950 font-sans">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-40 dark:border-gray-800 dark:bg-gray-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-2">
            <BarChart2 className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-50">Earnings Intel</span>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pt-12 pb-12 text-center">
        <div className="flex justify-center mb-8">
           <img src="/logo.png" alt="Logo" className="h-20 w-auto" />
        </div>
        <h2 className="text-4xl font-black text-gray-900 dark:text-gray-50 mb-8 tracking-tight">Análise Qualquer Earnings Call</h2>
        
        {!isLoading && (
          <div className="flex justify-center mb-8">
            <button onClick={() => setInputMode(inputMode === "ticker" ? "manual" : "ticker")} className="text-sm font-bold text-blue-600 border-b-2 border-blue-600 pb-1 hover:text-blue-700">
              {inputMode === "ticker" ? "MUDAR PARA COLAR TEXTO" : "MUDAR PARA PESQUISA POR TICKER"}
            </button>
          </div>
        )}

        {inputMode === "ticker" ? (
          <TickerAutocomplete onSelect={(t, name) => handleAnalyze(t, undefined, name)} isLoading={isLoading} />
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto text-left">
            <input value={manualTicker} onChange={e => setManualTicker(e.target.value)} placeholder="TICKER (EX: MSFT)" className="w-full p-5 rounded-2xl border-2 border-gray-100 dark:border-gray-800 dark:bg-gray-900 font-bold" />
            <textarea rows={8} value={manualText} onChange={e => setManualText(e.target.value)} placeholder="COLE AQUI A TRANSCRIÇÃO..." className="w-full p-5 rounded-2xl border-2 border-gray-100 dark:border-gray-800 dark:bg-gray-900 font-medium text-sm" />
            <button onClick={() => handleAnalyze(manualTicker, manualText)} className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black text-lg shadow-xl hover:bg-blue-700 transition-all">ANALISAR AGORA</button>
          </div>
        )}

        {isLoading && (
          <div className="mt-16 max-w-md mx-auto">
            <div className="flex justify-between mb-2">
               <span className="text-xs font-black text-blue-600 uppercase tracking-widest">A Processar...</span>
               <span className="text-xs font-black text-blue-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-gray-800 h-3 rounded-full overflow-hidden">
               <div className="bg-blue-600 h-full transition-all duration-300 shadow-[0_0_10px_rgba(37,99,235,0.5)]" style={{ width: `${progress}%` }}></div>
            </div>
            <p className="mt-4 text-sm text-gray-400 font-medium italic">A ler dados da conferência e a extrair inteligência financeira...</p>
          </div>
        )}

        {error && (
          <div className="mt-8 p-6 bg-rose-50 text-rose-700 rounded-2xl border-2 border-rose-100 flex items-center text-left max-w-xl mx-auto">
            <AlertCircle className="mr-3 h-6 w-6 shrink-0" />
            <p className="font-bold text-sm">{error}</p>
          </div>
        )}
      </section>

      {report && (
        <div className="mx-auto max-w-6xl px-6">
          <EarningsReport report={report} />
        </div>
      )}

      <footer className="mt-24 pb-8 text-center">
        <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">
          Earnings Call Analyzer — v9.8.5 (Barra Horizontal)
        </p>
      </footer>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center font-bold">A CARREGAR...</div>}>
      <HomeContent />
    </Suspense>
  );
}
