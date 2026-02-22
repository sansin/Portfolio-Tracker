import { aiGenerateText, aiGenerateObject } from '@/lib/ai/provider';
import { z } from 'zod';
import type { StockQuote } from '@/lib/services/stock-data';

export interface InsightResult {
  title: string;
  content: string;
  confidence: number;
  type: string;
}

const AnalysisSchema = z.object({
  summary: z.string(),
  sentiment: z.enum(['bullish', 'bearish', 'neutral']),
  keyPoints: z.array(z.string()),
  risks: z.array(z.string()),
  opportunities: z.array(z.string()),
  confidence: z.number().min(0).max(100),
});

const PortfolioHealthSchema = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
  riskLevel: z.enum(['low', 'moderate', 'high', 'very_high']),
});

/**
 * Generate a company analysis for a single stock
 */
export async function analyzeStock(
  symbol: string,
  quote: StockQuote | null
): Promise<InsightResult> {
  const priceInfo = quote
    ? `Current price: $${quote.price}, Day change: ${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)} (${quote.changePercent.toFixed(2)}%), P/E: ${quote.peRatio}, Market Cap: $${(quote.marketCap / 1e9).toFixed(1)}B, Volume: ${quote.volume.toLocaleString()}`
    : 'No current price data available';

  const prompt = `Analyze the stock ${symbol} for a retail investor.

${priceInfo}

Provide:
1. Brief company overview and what they do
2. Current market sentiment (bullish/bearish/neutral)
3. Key investment considerations (pros and cons)
4. Near-term risks and opportunities
5. Your confidence level (0-100) in the analysis`;

  const { object } = await aiGenerateObject(
    prompt,
    AnalysisSchema,
    'You are a financial analyst providing factual, balanced stock analysis. Do not give specific buy/sell recommendations. Always note that this is not financial advice.'
  );

  return {
    title: `${symbol} Analysis`,
    content: `**${object.sentiment.toUpperCase()}** — ${object.summary}\n\n**Key Points:**\n${object.keyPoints.map((p) => `• ${p}`).join('\n')}\n\n**Risks:**\n${object.risks.map((r) => `• ${r}`).join('\n')}\n\n**Opportunities:**\n${object.opportunities.map((o) => `• ${o}`).join('\n')}`,
    confidence: object.confidence,
    type: 'stock_analysis',
  };
}

/**
 * Generate a portfolio health check
 */
export async function analyzePortfolioHealth(
  holdings: { symbol: string; quantity: number; avgCost: number; currentPrice: number; sector?: string }[],
  totalValue: number,
  totalGainPercent: number
): Promise<InsightResult> {
  const holdingSummary = holdings
    .map((h) => {
      const value = h.quantity * h.currentPrice;
      const pct = ((value / totalValue) * 100).toFixed(1);
      const gain = (((h.currentPrice - h.avgCost) / h.avgCost) * 100).toFixed(1);
      return `${h.symbol}: ${pct}% of portfolio, ${gain}% gain, sector: ${h.sector || 'Unknown'}`;
    })
    .join('\n');

  const prompt = `Evaluate this investment portfolio's health and diversification:

Total Value: $${totalValue.toLocaleString()}
Overall Gain: ${totalGainPercent.toFixed(1)}%
Number of Holdings: ${holdings.length}

Holdings:
${holdingSummary}

Assess:
1. Overall health score (0-100)
2. Diversification quality (sector, position sizing)
3. Concentration risks
4. Strengths and weaknesses
5. Actionable recommendations for improvement
6. Risk level assessment`;

  const { object } = await aiGenerateObject(
    prompt,
    PortfolioHealthSchema,
    'You are a portfolio analyst providing constructive feedback on investment portfolios. Focus on diversification, risk management, and balance. This is not financial advice.'
  );

  return {
    title: 'Portfolio Health Check',
    content: `**Score: ${object.overallScore}/100** (Risk: ${object.riskLevel})\n\n${object.summary}\n\n**Strengths:**\n${object.strengths.map((s) => `✓ ${s}`).join('\n')}\n\n**Weaknesses:**\n${object.weaknesses.map((w) => `✗ ${w}`).join('\n')}\n\n**Recommendations:**\n${object.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
    confidence: object.overallScore,
    type: 'portfolio_health',
  };
}

/**
 * Generate a quick market summary
 */
export async function generateMarketSummary(
  watchlistSymbols: string[],
  holdingSymbols: string[]
): Promise<InsightResult> {
  const allSymbols = [...new Set([...watchlistSymbols, ...holdingSymbols])];

  const prompt = `Provide a brief market analysis and outlook relevant to these stocks: ${allSymbols.join(', ')}.

Cover:
1. Relevant market trends or news
2. Sector movements that affect these stocks  
3. Any upcoming catalysts (earnings, events)
4. General market sentiment

Keep it concise and actionable for a retail investor.`;

  const { text } = await aiGenerateText(
    prompt,
    'You are a market analyst providing daily market summaries. Be concise, factual, and mention that this is not financial advice.'
  );

  return {
    title: 'Market Summary',
    content: text,
    confidence: 70,
    type: 'market_summary',
  };
}
