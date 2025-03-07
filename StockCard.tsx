import React, { useEffect, useState } from 'react';
import { fetchHistoricalData } from '../services/yahooFinanceService';

const StockCard: React.FC = () => {
  const [symbol, setSymbol] = useState('');
  const [historicalData, setHistoricalData] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchHistoricalData(symbol);
        setHistoricalData(data.historicalData);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    loadData();
  }, [symbol]); // Only re-run if `symbol` changes

  return (
    <div>
      {/* Render your component content here */}
    </div>
  );
};

export default StockCard; 