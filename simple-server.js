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
var cors_1 = require("cors");
var child_process_1 = require("child_process");
var util_1 = require("util");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
var app = (0, express_1.default)();
// Enable CORS for all routes
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Define USE_MOCK_DATA flag to control data source
var USE_MOCK_DATA = false;
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
    var symbols, quotes, _a, stdout, stderr, quotes, pythonError_1, quotes, error_1;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 5, , 6]);
                console.log('Stock request received:', req.query);
                symbols = (((_b = req.query.symbols) === null || _b === void 0 ? void 0 : _b.toString()) || '').split(',');
                console.log("Fetching data for ".concat(symbols.length, " symbols"));
                if (USE_MOCK_DATA) {
                    quotes = symbols.map(function (symbol) { return ({
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
                _c.label = 1;
            case 1:
                _c.trys.push([1, 3, , 4]);
                return [4 /*yield*/, execAsync("python yahoo_finance.py stocks ".concat(symbols.join(',')))];
            case 2:
                _a = _c.sent(), stdout = _a.stdout, stderr = _a.stderr;
                if (stderr) {
                    console.error('Error from Python script:', stderr);
                    throw new Error(stderr);
                }
                quotes = JSON.parse(stdout);
                console.log("Returning ".concat(quotes.length, " real stock quotes from Yahoo Finance"));
                return [2 /*return*/, res.json(quotes)];
            case 3:
                pythonError_1 = _c.sent();
                console.error('Failed to get data from Yahoo Finance:', pythonError_1);
                console.log('Falling back to mock data');
                quotes = symbols.map(function (symbol) { return ({
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
                error_1 = _c.sent();
                console.error('Error in /api/stocks:', error_1);
                res.status(500).json({ error: 'Server error', message: error_1.message });
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// Historical data endpoint
app.get('/api/historical', function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, timeframe, data, period, interval, _a, stdout, stderr, data, pythonError_2, data, error_2;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 5, , 6]);
                symbol = (_b = req.query.symbol) === null || _b === void 0 ? void 0 : _b.toString();
                timeframe = ((_c = req.query.timeframe) === null || _c === void 0 ? void 0 : _c.toString()) || '1d';
                console.log("Historical data request for ".concat(symbol, " (").concat(timeframe, ")"));
                if (!symbol) {
                    return [2 /*return*/, res.status(400).json({ error: 'Symbol is required' })];
                }
                if (USE_MOCK_DATA) {
                    data = generateMockHistoricalData(symbol, 500);
                    console.log("Generated ".concat(data.length, " mock data points for ").concat(symbol));
                    return [2 /*return*/, res.json(data)];
                }
                period = "1y";
                interval = "1d";
                if (timeframe === "1d") {
                    period = "2d";
                    interval = "1h";
                }
                else if (timeframe === "5d") {
                    period = "5d";
                    interval = "1h";
                }
                else if (timeframe === "1mo") {
                    period = "1mo";
                    interval = "1d";
                }
                else if (timeframe === "6mo") {
                    period = "6mo";
                    interval = "1d";
                }
                else if (timeframe === "1y") {
                    period = "1y";
                    interval = "1d";
                }
                else if (timeframe === "5y") {
                    period = "5y";
                    interval = "1wk";
                }
                _d.label = 1;
            case 1:
                _d.trys.push([1, 3, , 4]);
                return [4 /*yield*/, execAsync("python yahoo_finance.py historical ".concat(symbol, " ").concat(period, " ").concat(interval))];
            case 2:
                _a = _d.sent(), stdout = _a.stdout, stderr = _a.stderr;
                if (stderr) {
                    console.error('Error from Python script:', stderr);
                    throw new Error(stderr);
                }
                data = JSON.parse(stdout);
                console.log("Received ".concat(data.length, " real data points from Yahoo Finance for ").concat(symbol));
                return [2 /*return*/, res.json(data)];
            case 3:
                pythonError_2 = _d.sent();
                console.error('Failed to get historical data from Yahoo Finance:', pythonError_2);
                console.log('Falling back to mock data');
                data = generateMockHistoricalData(symbol, 500);
                console.log("Generated ".concat(data.length, " mock data points for ").concat(symbol, " (fallback)"));
                return [2 /*return*/, res.json(data)];
            case 4: return [3 /*break*/, 6];
            case 5:
                error_2 = _d.sent();
                console.error('Error in /api/historical:', error_2);
                res.status(500).json({ error: 'Server error', message: error_2.message });
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// Start server
var PORT = process.env.PORT || 3001;
app.listen(PORT, function () {
    console.log("Simple API server running at http://localhost:".concat(PORT));
    console.log('Available endpoints:');
    console.log('  - GET /api/health');
    console.log('  - GET /api/stocks?symbols=AAPL,MSFT,GOOGL');
    console.log('  - GET /api/historical?symbol=AAPL&timeframe=1d');
    console.log("Using ".concat(USE_MOCK_DATA ? 'MOCK' : 'REAL', " data from Yahoo Finance"));
});
