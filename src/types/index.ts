export interface TickerSuggestion {
  symbol: string;
  name: string;
  exchange: string;
}


export interface EarningCallData {
  ticker: string;
  year: number;
  quarter: number;
  date?: string;
  transcript: string;
  parsedQABlocks?: QABlock[];
}

export interface QABlock {
  id: string;
  questionBy: string;
  answeredBy: string;
  question: string;
  answer: string;
  importanceDescription?: string;
  sentimentScore: number; // -1 to 1 local
  sentimentLabel: string;
  behavioralLabel?: string;
}

export interface LocalAnalysisResult {
  overallSentiment: number; // 0 to 100 normalized
  qaBlocks: QABlock[];
  textScore: number;
}

export interface ContrastMetric {
  metric: string;
  currentValue: string;
  previousValue: string;
  difference: string;
  isPositive: boolean;
}

export interface DeltaChange {
  phrase: string;
  type: 'added' | 'removed' | 'changed';
  insight: string;
}

export interface DeltaAnalysis {
  previousSnippet: string;
  currentSnippet: string;
  keyChanges: DeltaChange[];
}

export interface GeminiAnalysisResponse {
  executiveSummary: string;
  qaAnalysis: QABlock[]; // Enhanced with importance
  managementOutlook: string;
  positives: string[];
  negatives: string[];
  driversToWatch: { driver: string; description: string }[];
  sentimentNarrative: string;
  behavioralRead: string;
  previousCallComparison?: string;
  comparisonMetrics?: ContrastMetric[];
  deltaAnalysis?: DeltaAnalysis;
  bullishCase: string;
  bearishCase: string;
  biggestRisk: string;
  biggestOpportunity: string;
  finalTakeaway: string;
  scores: {
    sentiment: number;
    confidence: number;
    defensiveness: number;
    risk: number;
    outlook: number;
  };
  keyThemes: string[];
  chunkCount?: number;
  targetQuestionCount?: number;
  extractedQuestionCount?: number;
}

export interface FullReportData {
  ticker: string;
  year: number;
  quarter: number;
  language: string;
  geminiAnalysis: GeminiAnalysisResponse;
  localAnalysis: LocalAnalysisResult;
  hasPreviousCall: boolean;
  transcript: string;
  isPartial: boolean;
}
