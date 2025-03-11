// Create or add to your utils.ts file
export const noopLogger = {
  log: () => {},
  warn: () => {},
  error: () => {},
  info: () => {}
};

// Optional: Use this for development/production switch
export const logger = process.env.NODE_ENV === 'production' 
  ? noopLogger
  : console;