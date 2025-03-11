// Wave colors for visualization - alternating colors for waves
export const waveColors = [
  '#4CAF50', // Green for Wave 1
  '#FF9800', // Orange for Wave 2 
  '#2196F3', // Blue for Wave 3
  '#F44336', // Red for Wave 4
  '#9C27B0', // Purple for Wave 5
  '#FFEB3B', // Yellow for Wave A
  '#795548', // Brown for Wave B
  '#00BCD4'  // Cyan for Wave C
];

// Format tooltip values
export const tooltipFormatter = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
};
