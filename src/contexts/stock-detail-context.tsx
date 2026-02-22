'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import StockDetailModal from '@/components/stocks/StockDetailModal';

interface StockDetailContextType {
  openStockDetail: (symbol: string) => void;
  closeStockDetail: () => void;
}

const StockDetailContext = createContext<StockDetailContextType>({
  openStockDetail: () => {},
  closeStockDetail: () => {},
});

export function useStockDetail() {
  return useContext(StockDetailContext);
}

export function StockDetailProvider({ children }: { children: ReactNode }) {
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);

  const openStockDetail = useCallback((symbol: string) => {
    setActiveSymbol(symbol.toUpperCase());
  }, []);

  const closeStockDetail = useCallback(() => {
    setActiveSymbol(null);
  }, []);

  return (
    <StockDetailContext.Provider value={{ openStockDetail, closeStockDetail }}>
      {children}
      <StockDetailModal symbol={activeSymbol} onClose={closeStockDetail} />
    </StockDetailContext.Provider>
  );
}
