import React from 'react';
import StockCard from '@/components/StockCard';
import { useParams } from 'react-router-dom';
import { fetchStockData } from '@/services/yahooFinanceService';

const StockDetail: React.FC = () => {
  const { symbol } = useParams();
  const [stock, setStock] = React.useState(null);

  React.useEffect(() => {
    const loadStock = async () => {
      const data = await fetchStockData(symbol);
      setStock(data);
    };

    loadStock();
  }, [symbol]);

  if (!stock) return <div>Loading...</div>;

  return (
    <div>
      <h1>Stock Detail</h1>
      <StockCard stock={stock} onClick={() => {}} />
    </div>
  );
};

export default StockDetail; 