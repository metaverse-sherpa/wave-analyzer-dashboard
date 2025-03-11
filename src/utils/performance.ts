// In src/utils/performance.ts
export const throttleOperations = () => {
  let lastOperationTime = 0;
  const MIN_TIME_BETWEEN_OPS = 100; // ms
  
  return {
    async throttle<T>(operation: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const timeSinceLastOp = now - lastOperationTime;
      
      if (timeSinceLastOp < MIN_TIME_BETWEEN_OPS) {
        await new Promise(resolve => 
          setTimeout(resolve, MIN_TIME_BETWEEN_OPS - timeSinceLastOp)
        );
      }
      
      lastOperationTime = Date.now();
      return operation();
    }
  };
};

export const throttledAnalyzer = throttleOperations();