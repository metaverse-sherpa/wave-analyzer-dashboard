import { defineConfig } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

export default defineConfig({
  input: 'worker.js', // Direct path to worker.js in the root of api-backend
  output: {
    dir: 'dist',
    format: 'es',
  },
  plugins: [
    nodeResolve({
      browser: true,
    }),
    commonjs(),
    typescript(),
    json()
  ],
});