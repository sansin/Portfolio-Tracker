import { z } from 'zod';
import { aiGenerateObject, getVisionProvider } from './provider';
import { generateObject } from 'ai';
import Papa from 'papaparse';

const TransactionSchema = z.object({
  transactions: z.array(
    z.object({
      symbol: z.string().describe('Stock/ETF/Crypto ticker symbol'),
      type: z.enum(['buy', 'sell', 'dividend', 'transfer_in', 'transfer_out']),
      quantity: z.number().describe('Number of shares. Must be positive.'),
      price: z.number().describe('Price per share. Use 0 if not visible or unknown.'),
      date: z.string().describe('Date in YYYY-MM-DD format. Use empty string "" if not visible.'),
      fees: z.number().describe('Transaction fees. Use 0 if not visible.'),
      total: z.number().describe('Total transaction amount. Use 0 if not visible or unknown.'),
    })
  ),
});

type ParsedTransactions = z.infer<typeof TransactionSchema>;

// ─── Column mapping rules for known brokers ────────────────────────────────

interface ColumnMap {
  symbol: string[];
  type: string[];
  quantity: string[];
  price: string[];
  date: string[];
  fees: string[];
  total: string[];
}

const BROKER_COLUMNS: Record<string, ColumnMap> = {
  robinhood: {
    symbol: ['Instrument', 'Symbol', 'Ticker', 'symbol'],
    type: ['Trans Code', 'Activity Type', 'Type', 'Side', 'trans_code', 'activity_type'],
    quantity: ['Quantity', 'Qty', 'Shares', 'quantity'],
    price: ['Price', 'Average Price', 'price', 'Avg Price'],
    date: ['Activity Date', 'Date', 'Process Date', 'Settlement Date', 'date'],
    fees: ['Fees', 'Commission', 'fees', 'Fee'],
    total: ['Amount', 'Total', 'total', 'Net Amount'],
  },
  fidelity: {
    symbol: ['Symbol', 'symbol', 'Ticker'],
    type: ['Action', 'Type', 'Transaction Type', 'action'],
    quantity: ['Quantity', 'Qty', 'Shares', 'quantity', 'Number of Shares'],
    price: ['Price', 'Price ($)', 'price', 'Avg Price'],
    date: ['Run Date', 'Date', 'Trade Date', 'Settlement Date', 'date'],
    fees: ['Commission', 'Fees', 'Commission ($)', 'fees'],
    total: ['Amount', 'Amount ($)', 'total', 'Net Amount'],
  },
  schwab: {
    symbol: ['Symbol', 'symbol', 'Ticker'],
    type: ['Action', 'Type', 'Transaction Type', 'action'],
    quantity: ['Quantity', 'Qty', 'Shares', 'quantity', 'Number of Shares'],
    price: ['Price', 'Price ($)', 'price'],
    date: ['Date', 'Trade Date', 'date'],
    fees: ['Fees & Comm', 'Commission', 'Fees', 'fees'],
    total: ['Amount', 'Net Amount', 'total'],
  },
};

// Generic fallback column mapping (covers most common CSV formats)
const GENERIC_COLUMNS: ColumnMap = {
  symbol: ['Symbol', 'Ticker', 'Stock', 'symbol', 'ticker', 'stock', 'Asset', 'Name'],
  type: ['Type', 'Action', 'Side', 'Trans Code', 'Transaction', 'type', 'action', 'side'],
  quantity: ['Quantity', 'Qty', 'Shares', 'Units', 'quantity', 'qty', 'shares'],
  price: ['Price', 'Avg Price', 'Average Price', 'Cost', 'price', 'avg_price'],
  date: ['Date', 'Trade Date', 'Activity Date', 'Transaction Date', 'date', 'trade_date'],
  fees: ['Fees', 'Commission', 'Fee', 'fees', 'commission'],
  total: ['Amount', 'Total', 'Net Amount', 'Value', 'amount', 'total'],
};

function findColumn(headers: string[], candidates: string[]): string | null {
  // Exact match first
  for (const c of candidates) {
    if (headers.includes(c)) return c;
  }
  // Case-insensitive match
  for (const c of candidates) {
    const found = headers.find((h) => h.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }
  // Partial match
  for (const c of candidates) {
    const found = headers.find((h) => h.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return null;
}

function parseTransactionType(raw: string): 'buy' | 'sell' | 'dividend' | 'transfer_in' | 'transfer_out' {
  const lower = raw.toLowerCase().trim();
  if (/^(buy|bought|purchase|long)/.test(lower)) return 'buy';
  if (/^(sell|sold|short)/.test(lower)) return 'sell';
  if (/dividend|div|reinvest/i.test(lower)) return 'dividend';
  if (/transfer.?in|deposit|receive/i.test(lower)) return 'transfer_in';
  if (/transfer.?out|withdraw|send/i.test(lower)) return 'transfer_out';
  // Default: if amount is negative it's a buy (money out), positive is a sell
  return 'buy';
}

function parseNumber(val: any): number {
  if (val == null || val === '') return 0;
  const str = String(val).replace(/[$,()]/g, '').trim();
  if (str === '' || str === '-') return 0;
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.abs(num);
}

function parseDate(val: any): string {
  if (!val || val === '') return '';
  const str = String(val).trim();

  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);

  // Try MM/DD/YYYY or M/D/YYYY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slashMatch) {
    const m = slashMatch[1].padStart(2, '0');
    const d = slashMatch[2].padStart(2, '0');
    let y = slashMatch[3];
    if (y.length === 2) y = (parseInt(y) > 50 ? '19' : '20') + y;
    return `${y}-${m}-${d}`;
  }

  // Try Date constructor as last resort
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

  return '';
}

// ─── Rules-based CSV parser ────────────────────────────────────────────────

export async function parseCSV(csvText: string, broker: string): Promise<ParsedTransactions> {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error('Failed to parse CSV: ' + parsed.errors[0]?.message);
  }

  const headers = parsed.meta.fields || [];
  const colMap = BROKER_COLUMNS[broker] || GENERIC_COLUMNS;

  const symbolCol = findColumn(headers, colMap.symbol);
  const typeCol = findColumn(headers, colMap.type);
  const qtyCol = findColumn(headers, colMap.quantity);
  const priceCol = findColumn(headers, colMap.price);
  const dateCol = findColumn(headers, colMap.date);
  const feesCol = findColumn(headers, colMap.fees);
  const totalCol = findColumn(headers, colMap.total);

  if (!symbolCol) {
    throw new Error(`Could not find a symbol/ticker column. Found columns: ${headers.join(', ')}`);
  }
  if (!qtyCol) {
    throw new Error(`Could not find a quantity column. Found columns: ${headers.join(', ')}`);
  }

  const transactions = (parsed.data as Record<string, any>[])
    .map((row) => {
      const symbol = String(row[symbolCol] || '').trim().toUpperCase();
      if (!symbol) return null;

      const quantity = parseNumber(qtyCol ? row[qtyCol] : 0);
      if (quantity <= 0) return null;

      const type = typeCol ? parseTransactionType(String(row[typeCol] || '')) : 'buy';
      const price = parseNumber(priceCol ? row[priceCol] : 0);
      const date = parseDate(dateCol ? row[dateCol] : '');
      const fees = parseNumber(feesCol ? row[feesCol] : 0);
      let total = parseNumber(totalCol ? row[totalCol] : 0);
      if (!total && price) total = quantity * price + fees;

      return { symbol, type, quantity, price, date, fees, total };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  if (transactions.length === 0) {
    throw new Error('No valid transactions found in CSV. Check that the file has symbol and quantity columns.');
  }

  return { transactions };
}

// ─── AI-based screenshot parser (unchanged) ────────────────────────────────

export async function parseScreenshot(imageBase64: string, broker: string): Promise<ParsedTransactions> {
  const visionModel = getVisionProvider();

  const result = await generateObject({
    model: visionModel,
    schema: TransactionSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract all stock/ETF/crypto holdings or transactions from this ${broker} screenshot.

For each item extract whatever is available: symbol (ticker), type (buy/sell/dividend — default to "buy" if not shown), quantity (number of shares), price per share, date, fees, and total amount.

IMPORTANT: If only ticker and quantity are visible, still include them — set price, date, fees, and total as 0. Do NOT skip rows just because some fields are missing. Extract every ticker you can see.`,
          },
          {
            type: 'image',
            image: imageBase64,
          },
        ],
      },
    ],
  });

  return result.object;
}

// ─── Rules-based text parser ───────────────────────────────────────────────

export async function parsePastedText(text: string, _broker: string): Promise<ParsedTransactions> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const transactions: ParsedTransactions['transactions'] = [];

  // Pattern 1: "AAPL 10" or "AAPL 10 shares" or "AAPL: 10"
  const tickerQtyPattern = /^([A-Z]{1,5})[:\s]+(\d+\.?\d*)\s*(shares?)?/i;

  // Pattern 2: "Buy 10 AAPL @ $150.00 on 2025-01-15"
  const fullPattern = /^(buy|sell|bought|sold)\s+(\d+\.?\d*)\s+([A-Z]{1,5})\s*@?\s*\$?([\d.]+)?\s*(?:on\s+(.+))?$/i;

  // Pattern 3: Tab/comma separated "AAPL\t10\t150.00\t2025-01-15" or "AAPL,10,150,2025-01-15"
  const separatorPattern = /^([A-Z]{1,5})[,\t]+(\d+\.?\d*)[,\t]*([\d.]*)?[,\t]*([\d\-\/]*)?/i;

  for (const line of lines) {
    let match: RegExpMatchArray | null;

    // Try full pattern first
    match = line.match(fullPattern);
    if (match) {
      const type = parseTransactionType(match[1]);
      const quantity = parseFloat(match[2]);
      const symbol = match[3].toUpperCase();
      const price = match[4] ? parseFloat(match[4]) : 0;
      const date = match[5] ? parseDate(match[5]) : '';
      transactions.push({ symbol, type, quantity, price, date, fees: 0, total: price ? quantity * price : 0 });
      continue;
    }

    // Try separator pattern
    match = line.match(separatorPattern);
    if (match) {
      const symbol = match[1].toUpperCase();
      const quantity = parseFloat(match[2]);
      const price = match[3] ? parseFloat(match[3]) : 0;
      const date = match[4] ? parseDate(match[4]) : '';
      if (quantity > 0) {
        transactions.push({ symbol, type: 'buy', quantity, price, date, fees: 0, total: price ? quantity * price : 0 });
      }
      continue;
    }

    // Try simple ticker + quantity
    match = line.match(tickerQtyPattern);
    if (match) {
      const symbol = match[1].toUpperCase();
      const quantity = parseFloat(match[2]);
      if (quantity > 0) {
        transactions.push({ symbol, type: 'buy', quantity, price: 0, date: '', fees: 0, total: 0 });
      }
      continue;
    }
  }

  if (transactions.length === 0) {
    throw new Error('No transactions found. Try formats like "AAPL 10" or "Buy 10 AAPL @ 150" or comma/tab-separated values.');
  }

  return { transactions };
}
