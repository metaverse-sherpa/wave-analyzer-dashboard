
// Wave colors mapping
export const waveColors = {
  1: '#3B82F6', // blue
  2: '#EF4444', // red
  3: '#22C55E', // green
  4: '#F97316', // orange
  5: '#8B5CF6', // purple
  A: '#EC4899', // pink
  B: '#FBBF24', // yellow
  C: '#6366F1', // indigo
};

// Custom tooltip formatter
export const tooltipFormatter = (value: any, name: string) => {
  if (name === 'close') {
    return [`$${value.toFixed(2)}`, 'Close'];
  }
  if (name === 'open') {
    return [`$${value.toFixed(2)}`, 'Open'];
  }
  if (name === 'high') {
    return [`$${value.toFixed(2)}`, 'High'];
  }
  if (name === 'low') {
    return [`$${value.toFixed(2)}`, 'Low'];
  }
  return [value, name];
};
