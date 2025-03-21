// If you're using TypeScript and need to fix "Text" type issues,
// add this type declaration to your component:

// Augment the Recharts module
import * as Recharts from 'recharts';
import { SVGProps } from 'react';

// It's best to add this in a separate .d.ts file, but you can also add it at the top of StockDetailChart.tsx
declare module 'recharts' {
  export const Text: React.FC<{
    x: number;
    y: number;
    textAnchor?: 'start' | 'middle' | 'end';
    verticalAnchor?: 'start' | 'middle' | 'end';
    fill?: string;
    fontSize?: number;
    fontWeight?: string | number;
    dy?: number;
    dx?: number;
    children: React.ReactNode;
  }>;

  export interface CustomizedLabelProps extends LineProps {
    viewBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }
}

export interface LineProps {
  x?: number;
  y?: number;
  value?: number;
  index?: number;
  width?: number;
  height?: number;
  [key: string]: any;
}