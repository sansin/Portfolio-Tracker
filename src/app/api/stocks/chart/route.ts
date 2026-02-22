import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getChartData, type ChartDataPoint } from '@/lib/services/stock-data';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const symbol = request.nextUrl.searchParams.get('symbol');
  const symbols = request.nextUrl.searchParams.get('symbols'); // JSON: [{"symbol":"AAPL","quantity":10},...]
  const range = request.nextUrl.searchParams.get('range') || '1M';

  try {
    // Single symbol mode
    if (symbol) {
      const data = await getChartData(symbol.toUpperCase(), range as any);
      return NextResponse.json({ data });
    }

    // Multi-symbol portfolio mode: weighted by quantity
    if (symbols) {
      const holdings: { symbol: string; quantity: number }[] = JSON.parse(symbols);
      if (!holdings.length) {
        return NextResponse.json({ data: [] });
      }
      if (holdings.length > 30) {
        return NextResponse.json({ error: 'Maximum 30 holdings for chart' }, { status: 400 });
      }

      // Fetch chart data for all symbols in parallel
      const allData = await Promise.all(
        holdings.map(async (h) => ({
          symbol: h.symbol,
          quantity: h.quantity,
          points: await getChartData(h.symbol.toUpperCase(), range as any),
        }))
      );

      // Filter out symbols with no data
      const validData = allData.filter((d) => d.points.length > 0);
      if (validData.length === 0) {
        return NextResponse.json({ data: [] });
      }

      // Build a combined timeline: sum(price * quantity) at each timestamp
      // Use the symbol with the most data points as the base timeline
      const baseTimeline = validData.reduce((longest, d) =>
        d.points.length > longest.points.length ? d : longest
      );

      const combined: ChartDataPoint[] = baseTimeline.points.map((basePoint) => {
        let totalValue = 0;
        for (const holding of validData) {
          // Find the closest point for this timestamp
          const closest = findClosestPoint(holding.points, basePoint.timestamp);
          if (closest) {
            totalValue += closest.price * holding.quantity;
          }
        }
        return {
          timestamp: basePoint.timestamp,
          date: basePoint.date,
          price: Math.round(totalValue * 100) / 100,
        };
      });

      return NextResponse.json({ data: combined });
    }

    return NextResponse.json({ error: 'Missing symbol or symbols parameter' }, { status: 400 });
  } catch (error: any) {
    console.error('[stocks/chart] error:', error);
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 500 });
  }
}

function findClosestPoint(
  points: ChartDataPoint[],
  targetTimestamp: number
): ChartDataPoint | null {
  if (points.length === 0) return null;

  let left = 0;
  let right = points.length - 1;

  // Binary search for closest timestamp
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (points[mid].timestamp < targetTimestamp) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // Check neighbors for closest match
  if (left === 0) return points[0];
  const prev = points[left - 1];
  const curr = points[left];
  return Math.abs(prev.timestamp - targetTimestamp) <= Math.abs(curr.timestamp - targetTimestamp)
    ? prev
    : curr;
}
