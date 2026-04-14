"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

type Language = "pt" | "en" | "es";

interface TranslationDictionary {
  [key: string]: string;
}

const translations: Record<Language, TranslationDictionary> = {
  pt: {
    appTitle: "Earnings Call Intelligence",
    appSubtitle: "Análise Profissional de Transcrições de Resultados com IA",
    searchPlaceholder: "Pesquisar empresa ou ticker (ex: AAPL, Microsoft)...",
    searchButton: "Analisar",
    noResults: "Nenhum resultado encontrado.",
    loading: "A analisar a Call (pode demorar até 1 minuto)...",
    error: "Ocorreu um erro ao obter os dados.",
    geminiOverload: "Os servidores do Gemini estão com muita procura neste momento. Por favor, tente novamente dentro de alguns segundos ou use a análise manual.",
    executiveSummary: "Resumo Executivo",
    positives: "Pontos Positivos",
    negatives: "Pontos Negativos",
    driversToWatch: "Drivers a Acompanhar",
    managementOutlook: "Outlook da Administração",
    behavioralRead: "Leitura Comportamental",
    previousCallComparison: "Comparação com a Call Anterior",
    questionsAndAnswers: "As Perguntas e Respostas da Call",
    questionsAndAnswersSubtitle: "Perguntas de analistas processadas estruturalmente pela IA e classificadas localmente.",
    questionBy: "Pergunta de:",
    answeredBy: "Resposta de:",
    importance: "Importância:",
    sentiment: "Sentimento:",
    bullishCase: "Síntese Bullish",
    bearishCase: "Síntese Bearish",
    biggestRisk: "Maior Risco",
    biggestOpportunity: "Maior Oportunidade",
    finalTakeaway: "Takeaway Final",
    scoreSentiment: "Sentimento Global",
    scoreConfidence: "Confiança",
    scoreDefensiveness: "Defensividade",
    scoreRisk: "Percepção de Risco",
    scoreOutlook: "Perspetiva de Outlook",
    themeTags: "Temas Principais",
    exportBtn: "Exportar Relatório",
    exportPdf: "Exportar PDF (A4)",
    exportSuccess: "Copiado para a área de transferência!",
    heroTitle: "Analise Qualquer Earnings Call",
    heroSubtitle: "Em Segundos",
    toggleToManual: "Colar Transcrição Manualmente",
    toggleToSearch: "Pesquisar por Empresa / Ticker",
    manualLabelTicker: "Empresa / Nome do Ticker",
    manualLabelTranscript: "Colar Transcrição Completa",
    manualPlaceholderTicker: "ex: AAPL Q1 2024",
    manualPlaceholderTranscript: "Analista: Como está a margem?...",
    manualAnalyzeBtn: "Analisar Transcrição",
    loadingSubtitle: "A obter transcrições, NLP local e a sintetizar com Gemini 1.5 Flash.",
    loadingStep1: "A pesquisar o evento mais recente...",
    loadingStep2: "A descarregar transcrições em paralelo...",
    loadingStep3: "A analisar sentimento e comportamento localmente...",
    loadingStep4: "A gerar síntese de inteligência com Gemini 1.5 Flash...",
    loadingStep5: "A extrair Perguntas e Respostas...",
    loadingStep6: "Relatório concluído com sucesso!",
    extractingQA: "Extração de Q&A: Parte {current} de {total}",
    tabAnalysis: "Análise de Inteligência",
    tabTranscript: "Transcrição Original",
    deltaAnalysisTitle: "Análise de Linguagem (Redline)",
    deltaPrevious: "Transcrição Anterior",
    deltaCurrent: "Transcrição Atual",
    deltaInsight: "Insight Semântico"
  },
  en: {
    appTitle: "Earnings Call Intelligence",
    appSubtitle: "Professional Earnings Transcript Analysis with AI",
    searchPlaceholder: "Search company or ticker (e.g., AAPL, Microsoft)...",
    searchButton: "Analyze",
    noResults: "No results found.",
    loading: "Analyzing the Call (may take up to 1 minute)...",
    error: "An error occurred fetching the data.",
    geminiOverload: "Gemini servers are experiencing high demand right now. Please try again in a few seconds or use manual analysis.",
    executiveSummary: "Executive Summary",
    positives: "Positives",
    negatives: "Negatives",
    driversToWatch: "Drivers to Watch",
    managementOutlook: "Management Outlook",
    behavioralRead: "Behavioral Read",
    previousCallComparison: "Previous Call Comparison",
    questionsAndAnswers: "Earnings Call Q&A",
    questionsAndAnswersSubtitle: "Analyst questions processed structurally by AI and scored locally.",
    questionBy: "Question by:",
    answeredBy: "Answered by:",
    importance: "Importance:",
    sentiment: "Sentiment:",
    bullishCase: "Bullish Case",
    bearishCase: "Bearish Case",
    biggestRisk: "Biggest Risk",
    biggestOpportunity: "Biggest Opportunity",
    finalTakeaway: "Final Takeaway",
    scoreSentiment: "Overall Sentiment",
    scoreConfidence: "Confidence",
    scoreDefensiveness: "Defensiveness",
    scoreRisk: "Risk Perception",
    scoreOutlook: "Outlook Perspective",
    themeTags: "Key Themes",
    exportBtn: "Export Report",
    exportPdf: "Export PDF (A4)",
    exportSuccess: "Copied to clipboard!",
    heroTitle: "Analyze Any Earnings Call",
    heroSubtitle: "In Seconds",
    toggleToManual: "Paste Transcript Manually Instead",
    toggleToSearch: "Search by Company Ticker Instead",
    manualLabelTicker: "Company / Ticker Name",
    manualLabelTranscript: "Paste Full Transcript",
    manualPlaceholderTicker: "e.g. AAPL Q1 2024",
    manualPlaceholderTranscript: "Analyst: How is the guidance?...",
    manualAnalyzeBtn: "Analyze Transcript",
    loadingSubtitle: "Fetching transcripts, running local NLP, and synthesizing insights with Gemini 1.5 Flash.",
    loadingStep1: "Searching for the latest earnings event...",
    loadingStep2: "Downloading transcripts in parallel...",
    loadingStep3: "Analyzing sentiment and behavior locally...",
    loadingStep4: "Generating intelligence synthesis with Gemini 1.5 Flash...",
    loadingStep5: "Extracting Questions and Answers...",
    loadingStep6: "Report completed successfully!",
    extractingQA: "Q&A Extraction: Part {current} of {total}",
    tabAnalysis: "Intelligence Analysis",
    tabTranscript: "Original Transcript",
    deltaAnalysisTitle: "Language Analysis (Redline)",
    deltaPrevious: "Previous Transcript",
    deltaCurrent: "Current Transcript",
    deltaInsight: "Semantic Insight"
  },
  es: {
    appTitle: "Earnings Call Intelligence",
    appSubtitle: "Análisis Profesional de Transcripciones de Resultados con IA",
    searchPlaceholder: "Buscar empresa o ticker (ej: AAPL, Microsoft)...",
    searchButton: "Analizar",
    noResults: "No se encontraron resultados.",
    loading: "Analizando la Call (puede tardar hasta 1 minuto)...",
    error: "Ocurrió un error al obtener los datos.",
    geminiOverload: "Los servidores de Gemini tienen mucha demanda en este momento. Por favor, inténtelo de nuevo en unos segundos o use el análisis manual.",
    executiveSummary: "Resumen Ejecutivo",
    positives: "Puntos Positivos",
    negatives: "Puntos Negativos",
    driversToWatch: "Drivers a Observar",
    managementOutlook: "Perspectiva de la Dirección",
    behavioralRead: "Lectura de Comportamiento",
    previousCallComparison: "Comparación con Call Anterior",
    questionsAndAnswers: "Preguntas y Respuestas de la Call",
    questionsAndAnswersSubtitle: "Preguntas de analistas procesadas estructuralmente por la IA e clasificadas localmente.",
    questionBy: "Pregunta de:",
    answeredBy: "Respuesta de:",
    importance: "Importancia:",
    sentiment: "Sentimiento:",
    bullishCase: "Síntesis Alcista",
    bearishCase: "Síntesis Bajista",
    biggestRisk: "Mayor Riesgo",
    biggestOpportunity: "Mayor Oportunidad",
    finalTakeaway: "Conclusión Final",
    scoreSentiment: "Sentimiento Global",
    scoreConfidence: "Confianza",
    scoreDefensiveness: "Defensividad",
    scoreRisk: "Percepción de Riesgo",
    scoreOutlook: "Perspetiva",
    themeTags: "Temas Principales",
    exportBtn: "Exportar Informe",
    exportPdf: "Exportar PDF (A4)",
    exportSuccess: "¡Copiado al portapapeles!",
    heroTitle: "Analice Cualquier Earnings Call",
    heroSubtitle: "En Segundos",
    toggleToManual: "Pegar Transcripción Manualmente",
    toggleToSearch: "Buscar por Empresa / Ticker",
    manualLabelTicker: "Empresa / Nombre del Ticker",
    manualLabelTranscript: "Pegar Transcripción Completa",
    manualPlaceholderTicker: "ej: AAPL Q1 2024",
    manualPlaceholderTranscript: "Analista: ¿Cómo va el margen?...",
    manualAnalyzeBtn: "Analizar Transcripción",
    loadingSubtitle: "Obteniendo transcripciones, NLP local y sintetizando con Gemini 1.5 Flash.",
    loadingStep1: "Buscando el evento de resultados más reciente...",
    loadingStep2: "Descargando transcripciones en paralelo...",
    loadingStep3: "Analizando sentimiento y comportamiento localmente...",
    loadingStep4: "Generando síntesis de inteligencia con Gemini 1.5 Flash...",
    loadingStep5: "Extrayendo Preguntas y Respuestas...",
    loadingStep6: "¡Informe completado con éxito!",
    extractingQA: "Extracción de Q&A: Parte {current} de {total}",
    tabAnalysis: "Análisis de Inteligencia",
    tabTranscript: "Original Transcripto"
  }
};

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("pt");

  const t = (key: string) => {
    return translations[language]?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
