export interface TimeoutRef {
  current: ReturnType<typeof setTimeout> | null;
}

export interface AnalysisCache {
  [key: string]: {
    timestamp: number;
    data: any;
  };
}