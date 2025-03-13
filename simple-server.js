"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var path_1 = require("path");
var cors_1 = require("cors");
var yahoo_finance2_1 = require("yahoo-finance2");
var dotenv_1 = require("dotenv");
dotenv_1.default.config();
var app = (0, express_1.default)();
// Environment variables with defaults
var PORT = process.env.PORT || 3001;
var NODE_ENV = process.env.NODE_ENV || 'development';
var DIST_DIR = path_1.default.join(__dirname, 'dist'); // Assuming your frontend builds to 'dist'
// CORS setup - only needed in development
if (NODE_ENV === 'development') {
    app.use((0, cors_1.default)());
}
app.use(express_1.default.json());
// API routes
app.use('/api', function (req, res, next) {
    console.log("API request: ".concat(req.method, " ").concat(req.path));
    next();
});
// Define USE_MOCK_DATA flag to control data source
var USE_MOCK_DATA = process.env.ENABLE_MOCK_DATA === 'true';
var USE_CACHE = process.env.ENABLE_CACHING !== 'false';
// Simple in-memory cache with TTL
var cache = {};
// Function to get cached data or fetch new data
function getCachedData(key_1, fetchFn_1) {
    return __awaiter(this, arguments, void 0, function (key, fetchFn, ttlMinutes) {
        var now, data;
        if (ttlMinutes === void 0) { ttlMinutes = 60; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = Date.now();
                    // Return cached data if it exists and hasn't expired
                    if (USE_CACHE && cache[key] && cache[key].expires > now) {
                        console.log("Cache hit for ".concat(key));
                        return [2 /*return*/, cache[key].data];
                    }
                    // Fetch new data
                    console.log("Cache miss for ".concat(key, ", fetching fresh data"));
                    return [4 /*yield*/, fetchFn()];
                case 1:
                    data = _a.sent();
                    // Store in cache with expiration
                    if (USE_CACHE) {
                        cache[key] = {
                            data: data,
                            expires: now + (ttlMinutes * 60 * 1000)
                        };
                    }
                    return [2 /*return*/, data];
            }
        });
    });
}
// Generate mock historical data (keep for fallback)
var generateMockHistoricalData = function (symbol, days) {
    if (days === void 0) { days = 300; }
    var mockData = [];
    var today = new Date();
    var price = 100 + (symbol.charCodeAt(0) % 50); // Base price on first letter of symbol
    for (var i = days; i >= 0; i--) {
        var date = new Date(today);
        date.setDate(today.getDate() - i);
        // Generate some random price movement with an upward trend
        var change = (Math.random() - 0.48) * 2; // Slight upward bias
        price = Math.max(10, price * (1 + change / 100));
        var dayVolatility = Math.random() * 0.02;
        var high = price * (1 + dayVolatility);
        var low = price * (1 - dayVolatility);
        var open_1 = low + Math.random() * (high - low);
        mockData.push({
            timestamp: Math.floor(date.getTime() / 1000),
            open: Number(open_1.toFixed(2)),
            high: Number(high.toFixed(2)),
            close: Number(price.toFixed(2)),
            low: Number(low.toFixed(2)),
            volume: Math.floor(Math.random() * 10000000) + 500000
        });
    }
    return mockData;
};
// Mock top stock symbols
var topStockSymbols = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK-B', 'UNH', 'LLY',
    'JPM', 'V', 'AVGO', 'XOM', 'PG', 'MA', 'COST', 'HD', 'CVX', 'MRK'
];
// Health check endpoint
app.get('/api/health', function (req, res) {
    console.log('Health check request received');
    res.status(200).json({ status: 'ok' });
});
// Stocks endpoint
app.get('/api/stocks', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbols_1, quotes, fetchQuotes, quotes, yahooError_1, quotes, error_1;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                _b.trys.push([0, 5, , 6]);
                console.log('Stock request received:', req.query);
                symbols_1 = (((_a = req.query.symbols) === null || _a === void 0 ? void 0 : _a.toString()) || '').split(',');
                console.log("Fetching data for ".concat(symbols_1.length, " symbols"));
                if (USE_MOCK_DATA) {
                    quotes = symbols_1.map(function (symbol) { return ({
                        symbol: symbol,
                        shortName: "".concat(symbol, " Inc."),
                        regularMarketPrice: 100 + Math.random() * 100,
                        regularMarketChange: (Math.random() * 10) - 5,
                        regularMarketChangePercent: (Math.random() * 10) - 5,
                        regularMarketVolume: Math.floor(Math.random() * 10000000),
                        averageDailyVolume3Month: Math.floor(Math.random() * 5000000),
                        marketCap: Math.floor(Math.random() * 1000000000000),
                        fiftyTwoWeekLow: 50 + Math.random() * 50,
                        fiftyTwoWeekHigh: 150 + Math.random() * 50,
                        trailingPE: 15 + Math.random() * 20,
                        forwardPE: 12 + Math.random() * 15,
                        trailingAnnualDividendYield: Math.random() * 0.05
                    }); });
                    console.log("Returning ".concat(quotes.length, " mock stock quotes"));
                    return [2 /*return*/, res.json(quotes)];
                }
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                fetchQuotes = function () { return __awaiter(void 0, void 0, void 0, function () {
                    var options, results, _i, symbols_2, symbol, quote, error_2;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                options = {
                                    fields: [
                                        'shortName', 'regularMarketPrice', 'regularMarketChange',
                                        'regularMarketChangePercent', 'regularMarketVolume', 'averageDailyVolume3Month',
                                        'marketCap', 'fiftyTwoWeekLow', 'fiftyTwoWeekHigh', 'trailingPE',
                                        'forwardPE', 'trailingAnnualDividendYield'
                                    ]
                                };
                                results = [];
                                _i = 0, symbols_2 = symbols_1;
                                _a.label = 1;
                            case 1:
                                if (!(_i < symbols_2.length)) return [3 /*break*/, 8];
                                symbol = symbols_2[_i];
                                _a.label = 2;
                            case 2:
                                _a.trys.push([2, 6, , 7]);
                                if (!(results.length > 0)) return [3 /*break*/, 4];
                                return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 100); })];
                            case 3:
                                _a.sent();
                                _a.label = 4;
                            case 4: return [4 /*yield*/, yahoo_finance2_1.default.quote(symbol, options)];
                            case 5:
                                quote = _a.sent();
                                results.push(quote);
                                return [3 /*break*/, 7];
                            case 6:
                                error_2 = _a.sent();
                                console.error("Error fetching quote for ".concat(symbol, ":"), error_2);
                                // Add a placeholder for failed requests
                                results.push({
                                    symbol: symbol,
                                    shortName: "".concat(symbol, " Inc."),
                                    regularMarketPrice: 0,
                                    error: error_2.message
                                });
                                return [3 /*break*/, 7];
                            case 7:
                                _i++;
                                return [3 /*break*/, 1];
                            case 8: return [2 /*return*/, results];
                        }
                    });
                }); };
                return [4 /*yield*/, getCachedData("stocks_".concat(symbols_1.join('_')), fetchQuotes, 15)];
            case 2:
                quotes = _b.sent();
                console.log("Returning ".concat(quotes.length, " real stock quotes from Yahoo Finance"));
                return [2 /*return*/, res.json(quotes)];
            case 3:
                yahooError_1 = _b.sent();
                console.error('Failed to get data from Yahoo Finance:', yahooError_1);
                console.log('Falling back to mock data');
                quotes = symbols_1.map(function (symbol) { return ({
                    symbol: symbol,
                    shortName: "".concat(symbol, " Inc."),
                    regularMarketPrice: 100 + Math.random() * 100,
                    regularMarketChange: (Math.random() * 10) - 5,
                    regularMarketChangePercent: (Math.random() * 10) - 5,
                    regularMarketVolume: Math.floor(Math.random() * 10000000),
                    averageDailyVolume3Month: Math.floor(Math.random() * 5000000),
                    marketCap: Math.floor(Math.random() * 1000000000000),
                    fiftyTwoWeekLow: 50 + Math.random() * 50,
                    fiftyTwoWeekHigh: 150 + Math.random() * 50,
                    trailingPE: 15 + Math.random() * 20,
                    forwardPE: 12 + Math.random() * 15,
                    trailingAnnualDividendYield: Math.random() * 0.05
                }); });
                return [2 /*return*/, res.json(quotes)];
            case 4: return [3 /*break*/, 6];
            case 5:
                error_1 = _b.sent();
                console.error('Error in /api/stocks:', error_1);
                res.status(500).json({ error: 'Server error', message: error_1.message });
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// Historical data endpoint
app.get('/api/historical', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol_1, timeframe, data, period_1, interval_1, fetchHistoricalData, cacheTTL, data, yahooError_2, data, error_3;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 5, , 6]);
                symbol_1 = (_a = req.query.symbol) === null || _a === void 0 ? void 0 : _a.toString();
                timeframe = ((_b = req.query.timeframe) === null || _b === void 0 ? void 0 : _b.toString()) || '1d';
                console.log("Historical data request for ".concat(symbol_1, " (").concat(timeframe, ")"));
                if (!symbol_1) {
                    return [2 /*return*/, res.status(400).json({ error: 'Symbol is required' })];
                }
                if (USE_MOCK_DATA) {
                    data = generateMockHistoricalData(symbol_1, 500);
                    console.log("Generated ".concat(data.length, " mock data points for ").concat(symbol_1));
                    return [2 /*return*/, res.json(data)];
                }
                switch (timeframe) {
                    case '1d':
                        period_1 = '1d';
                        interval_1 = '5m';
                        break;
                    case '5d':
                        period_1 = '5d';
                        interval_1 = '15m';
                        break;
                    case '1mo':
                        period_1 = '1mo';
                        interval_1 = '1d';
                        break;
                    case '6mo':
                        period_1 = '6mo';
                        interval_1 = '1d';
                        break;
                    case '1y':
                        period_1 = '1y';
                        interval_1 = '1d';
                        break;
                    case '5y':
                        period_1 = '5y';
                        interval_1 = '1wk';
                        break;
                    default:
                        period_1 = '1y';
                        interval_1 = '1d';
                }
                _c.label = 1;
            case 1:
                _c.trys.push([1, 3, , 4]);
                fetchHistoricalData = function () { return __awaiter(void 0, void 0, void 0, function () {
                    var queryOptions, result;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                queryOptions = {
                                    period: period_1,
                                    interval: interval_1
                                };
                                return [4 /*yield*/, yahoo_finance2_1.default.historical(symbol_1, queryOptions)];
                            case 1:
                                result = _a.sent();
                                // Transform to expected format
                                return [2 /*return*/, result.map(function (item) { return ({
                                        timestamp: Math.floor(new Date(item.date).getTime() / 1000),
                                        open: item.open,
                                        high: item.high,
                                        close: item.close,
                                        low: item.low,
                                        volume: item.volume
                                    }); })];
                        }
                    });
                }); };
                cacheTTL = timeframe === '1d' ? 15 : (timeframe === '5d' ? 30 : 60);
                return [4 /*yield*/, getCachedData("historical_".concat(symbol_1, "_").concat(timeframe), fetchHistoricalData, cacheTTL)];
            case 2:
                data = _c.sent();
                console.log("Returning ".concat(data.length, " real historical data points for ").concat(symbol_1));
                return [2 /*return*/, res.json(data)];
            case 3:
                yahooError_2 = _c.sent();
                console.error('Failed to get historical data from Yahoo Finance:', yahooError_2);
                console.log('Falling back to mock data');
                data = generateMockHistoricalData(symbol_1, 500);
                console.log("Generated ".concat(data.length, " mock data points for ").concat(symbol_1, " (fallback)"));
                return [2 /*return*/, res.json(data)];
            case 4: return [3 /*break*/, 6];
            case 5:
                error_3 = _c.sent();
                console.error('Error in /api/historical:', error_3);
                res.status(500).json({ error: 'Server error', message: error_3.message });
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// In production, serve the frontend static files
if (NODE_ENV === 'production') {
    console.log("Serving static files from: ".concat(DIST_DIR));
    // Serve static files
    app.use(express_1.default.static(DIST_DIR));
    // For all non-API routes, serve the index.html file
    app.get('*', function (req, res, next) {
        // Skip API routes
        if (req.path.startsWith('/api/'))
            return next();
        res.sendFile(path_1.default.join(DIST_DIR, 'index.html'));
    });
}
// Start server
app.listen(PORT, function () {
    console.log("Server running in ".concat(NODE_ENV, " mode at http://localhost:").concat(PORT));
    console.log("API available at ".concat(NODE_ENV === 'production' ? '' : 'http://localhost:' + PORT, "/api"));
});
