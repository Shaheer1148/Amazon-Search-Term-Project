import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  Download, 
  CheckCircle2, 
  Loader2,
  BarChart3,
  PieChart,
  Target,
  Lightbulb,
  Zap,
  Gauge,
  Flag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from '@google/genai';

interface AnalysisResult {
  macro_metrics: {
    total_ad_spend: number;
    total_sales: number;
    account_acos_percentage: number;
  };
  high_converting_keywords: {
    search_term: string;
    total_orders: number;
    total_spend: number;
    total_sales: number;
    acos_percentage: number | null;
  }[];
  bleeding_keywords_zero_sales: {
    search_term: string;
    total_clicks: number;
    total_spend: number;
  }[];
  watchlist_high_acos: {
    search_term: string;
    total_clicks: number;
    total_spend: number;
    total_sales: number;
    acos_percentage: number;
  }[];
  strategic_analysis?: {
    market_overview: string;
    expansion_strategy: {
      opportunity: string;
      reasoning: string;
    }[];
    bid_recommendations: {
      cluster: string;
      action: string;
      impact: string;
    }[];
    long_term_outlook: string;
  };
  market_trends?: string[];
}

interface ApiResponse {
  analysis: AnalysisResult;
  cleanedData: any[];
  csvData: string;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ analysis: AnalysisResult; csvData: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Process data on backend (Consolidation, Macro, Segmentation)
      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      let responseText = '';
      try {
        responseText = await response.text();
      } catch (e) {
        throw new Error('Failed to read server response');
      }

      if (!response.ok) {
        let err;
        try {
          err = JSON.parse(responseText);
        } catch (e) {
          throw new Error(`Server error (${response.status}): ${responseText.substring(0, 100)}`);
        }
        throw new Error(err.error || 'Failed to process report');
      }

      let data: ApiResponse;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Unexpected server response: ${responseText.substring(0, 100)}`);
      }
      let finalAnalysis = data.analysis;

      // 2. Supplement with AI Strategic Analysis if API Key is available
      const apiKey = process.env.Search_Term_Project || process.env.GEMINI_API_KEY;
      if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim() !== '') {
        try {
          const genAI = new GoogleGenAI({ apiKey });
          const model = await genAI.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `As an expert Amazon PPC Strategist, provide a comprehensive strategic analysis based on these search term metrics.
                    
                    Macro Performance: ${JSON.stringify(data.analysis.macro_metrics)}
                    Top Keywords (Winners): ${JSON.stringify(data.analysis.high_converting_keywords)}
                    Bleeding Keywords: ${JSON.stringify(data.analysis.bleeding_keywords_zero_sales)}
                    High ACoS Watchlist: ${JSON.stringify(data.analysis.watchlist_high_acos)}
                    
                    Your goal is to provide deep, actionable insights focusing on:
                    1. Market Positioning: How does the overall performance reflect brand strength?
                    2. Expansion: Which winner keywords have untapped potential?
                    3. Efficiency: Specific bid adjustments for the bleeding and high ACoS terms.
                    4. Long-term Outlook: What macro-trends should the seller prepare for?`
                  }
                ]
              }
            ],
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  market_overview: { type: Type.STRING },
                  expansion_strategy: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        opportunity: { type: Type.STRING },
                        reasoning: { type: Type.STRING }
                      },
                      required: ['opportunity', 'reasoning']
                    }
                  },
                  bid_recommendations: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        cluster: { type: Type.STRING },
                        action: { type: Type.STRING },
                        impact: { type: Type.STRING }
                      },
                      required: ['cluster', 'action', 'impact']
                    }
                  },
                  long_term_outlook: { type: Type.STRING },
                  market_trends: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ['market_overview', 'expansion_strategy', 'bid_recommendations', 'long_term_outlook', 'market_trends']
              }
            }
          });

          const textResponse = model.text || '{}';
          const cleanedText = textResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
          const aiAnalysis = JSON.parse(cleanedText);
          
          finalAnalysis = { 
            ...finalAnalysis, 
            strategic_analysis: {
              market_overview: aiAnalysis.market_overview,
              expansion_strategy: aiAnalysis.expansion_strategy,
              bid_recommendations: aiAnalysis.bid_recommendations,
              long_term_outlook: aiAnalysis.long_term_outlook
            },
            market_trends: aiAnalysis.market_trends 
          };
        } catch (aiErr) {
          console.warn('AI Strategic Analysis failed:', aiErr);
        }
      }

      setResult({ analysis: finalAnalysis, csvData: data.csvData });

    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = () => {
    if (!result?.csvData) return;
    const blob = new Blob([result.csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'processed_amazon_data.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-orange-500 p-2 rounded-lg">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Amazon Search Term Analyzer</h1>
          </div>
          <div className="flex items-center gap-4">
            {result && (
              <button
                onClick={downloadCsv}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Download Processed CSV
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!result ? (
          <div className="max-w-2xl mx-auto mt-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center"
            >
              <div className="mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-orange-600" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Upload Search Term Report</h2>
                <p className="text-slate-500">
                  Select your Amazon Advertising Search Term Report (.xlsx) to begin analysis.
                </p>
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer mb-6 ${
                  file ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-orange-400 hover:bg-slate-50'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx"
                  className="hidden"
                />
                {file ? (
                  <div className="flex flex-col items-center">
                    <FileText className="w-12 h-12 text-orange-600 mb-2" />
                    <span className="font-medium text-slate-900">{file.name}</span>
                    <span className="text-sm text-slate-500">{(file.size / 1024).toFixed(2)} KB</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <Upload className="w-12 h-12 text-slate-300 mb-2" />
                    <span className="text-slate-500">Click to browse or drag and drop</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-center gap-3 text-red-700 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                  !file || loading
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-200'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Analyzing Data...
                  </>
                ) : (
                  'Start Strategic Analysis'
                )}
              </button>
            </motion.div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Summary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <SummaryCard
                title="Total Ad Spend"
                value={`$${result.analysis.macro_metrics.total_ad_spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={<TrendingDown className="w-6 h-6 text-red-500" />}
                color="bg-red-50"
              />
              <SummaryCard
                title="Total Sales"
                value={`$${result.analysis.macro_metrics.total_sales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={<TrendingUp className="w-6 h-6 text-green-500" />}
                color="bg-green-50"
              />
              <SummaryCard
                title="Account ACoS"
                value={`${result.analysis.macro_metrics.account_acos_percentage.toFixed(2)}%`}
                icon={<PieChart className="w-6 h-6 text-orange-500" />}
                color="bg-orange-50"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* High-Converting Keywords */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-600" />
                    <h3 className="font-bold text-lg">The Winners</h3>
                  </div>
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded uppercase">High-Converting</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                      <tr>
                        <th className="px-6 py-4">Search Term</th>
                        <th className="px-6 py-4">Orders</th>
                        <th className="px-6 py-4">Sales</th>
                        <th className="px-6 py-4">ACoS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.analysis.high_converting_keywords.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-900">{item.search_term}</td>
                          <td className="px-6 py-4 font-bold">{item.total_orders}</td>
                          <td className="px-6 py-4 text-green-600 font-bold">${item.total_sales.toFixed(2)}</td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-bold px-2 py-1 bg-slate-100 rounded">
                              {item.acos_percentage !== null ? `${item.acos_percentage.toFixed(1)}%` : 'N/A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>

              {/* Bleeding Keywords */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
              >
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <h3 className="font-bold text-lg">Bleeding Keywords</h3>
                  </div>
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded uppercase">Negative Targets</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                      <tr>
                        <th className="px-6 py-4">Search Term</th>
                        <th className="px-6 py-4">Clicks</th>
                        <th className="px-6 py-4">Wasted Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.analysis.bleeding_keywords_zero_sales.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-900">{item.search_term}</td>
                          <td className="px-6 py-4 font-bold">{item.total_clicks}</td>
                          <td className="px-6 py-4 text-red-600 font-bold">${item.total_spend.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </div>

            {/* Watchlist */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-orange-600" />
                  <h3 className="font-bold text-lg">Watchlist / Keep an Eye On</h3>
                </div>
                <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded uppercase">Bid Optimization</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                    <tr>
                      <th className="px-6 py-4">Search Term</th>
                      <th className="px-6 py-4">Clicks</th>
                      <th className="px-6 py-4">Spend</th>
                      <th className="px-6 py-4">Sales</th>
                      <th className="px-6 py-4">ACoS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {result.analysis.watchlist_high_acos.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{item.search_term}</td>
                        <td className="px-6 py-4">{item.total_clicks}</td>
                        <td className="px-6 py-4">${item.total_spend.toFixed(2)}</td>
                        <td className="px-6 py-4">${item.total_sales.toFixed(2)}</td>
                        <td className="px-6 py-4 text-orange-600 font-bold">{item.acos_percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* AI Strategic Analysis */}
            {result.analysis.strategic_analysis && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {/* Market Overview */}
                <div className="bg-indigo-900 text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Zap className="w-32 h-32" />
                  </div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-indigo-500/30 rounded-lg">
                        <Gauge className="w-6 h-6 text-indigo-200" />
                      </div>
                      <h3 className="text-2xl font-bold">AI Strategic Performance Audit</h3>
                    </div>
                    <p className="text-indigo-100 text-lg leading-relaxed max-w-3xl italic">
                      " {result.analysis.strategic_analysis.market_overview} "
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Expansion Opportunities */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-green-50 rounded-lg">
                        <Lightbulb className="w-6 h-6 text-green-600" />
                      </div>
                      <h4 className="text-xl font-bold">Expansion Opportunities</h4>
                    </div>
                    <div className="space-y-4">
                      {result.analysis.strategic_analysis.expansion_strategy.map((item, idx) => (
                        <div key={idx} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="font-bold text-slate-900 mb-1">{item.opportunity}</p>
                          <p className="text-sm text-slate-600">{item.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bid Recommendations */}
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-blue-50 rounded-lg">
                        <TrendingUp className="w-6 h-6 text-blue-600" />
                      </div>
                      <h4 className="text-xl font-bold">Efficiency & Bidding</h4>
                    </div>
                    <div className="space-y-4">
                      {result.analysis.strategic_analysis.bid_recommendations.map((item, idx) => (
                        <div key={idx} className="flex gap-4 p-4 border-b border-slate-100 last:border-0">
                          <div className="flex-shrink-0 mt-1">
                            <CheckCircle2 className="w-5 h-5 text-blue-500" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{item.cluster}</p>
                            <p className="text-sm text-slate-700 font-medium my-1">{item.action}</p>
                            <p className="text-xs text-slate-500">{item.impact}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Long Term Outlook */}
                <div className="bg-slate-900 text-white rounded-2xl p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <Flag className="w-5 h-5 text-indigo-400" />
                    <h4 className="text-lg font-bold">Long-Term Strategic Outlook</h4>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    {result.analysis.strategic_analysis.long_term_outlook}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Strategic Remarks (if available) - Kept simple if market trends exist */}
            {result.analysis.market_trends && result.analysis.market_trends.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8"
              >
                <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-orange-500" />
                  Additional Market Insights
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.analysis.market_trends.map((trend, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <CheckCircle2 className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                      <p className="text-slate-700 leading-relaxed">{trend}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            <div className="flex justify-center pt-8">
              <button
                onClick={() => {
                  setResult(null);
                  setFile(null);
                }}
                className="text-slate-500 hover:text-slate-900 font-medium transition-colors"
              >
                Analyze another report
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4"
    >
      <div className={`p-4 rounded-xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </motion.div>
  );
}
