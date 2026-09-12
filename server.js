const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const db = require('./db');
const marketService = require('./marketService');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'smart_market_secret_key_2026_antigravity';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files from current root directory
app.use(express.static(path.join(__dirname)));

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. Token missing.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
}

// -----------------------------------------------------------------------------
// AUTH ROUTES
// -----------------------------------------------------------------------------

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        const existingUser = db.findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'Account with this email already exists.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = {
            id: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name,
            email: email.toLowerCase(),
            passwordHash,
            balance: 1000000.00, // Rs. 10,00,000 virtual cash balance
            createdAt: new Date().toISOString()
        };

        db.createUser(newUser);

        const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            message: 'Account created successfully!',
            token,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                balance: newUser.balance
            }
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Internal server error during registration.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = db.findUserByEmail(email);
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                balance: user.balance
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error during login.' });
    }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    const user = db.findUserById(req.user.id);
    if (!user) {
        return res.status(444).json({ error: 'User not found.' });
    }
    res.json({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            balance: user.balance
        }
    });
});

// -----------------------------------------------------------------------------
// REAL-TIME MARKET DATA ROUTES
// -----------------------------------------------------------------------------

app.get('/api/market/indices', async (req, res) => {
    try {
        const indices = await marketService.getIndicesQuotes();
        res.json({ indices });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch indices data' });
    }
});

app.get('/api/market/stocks', async (req, res) => {
    try {
        const stocks = await marketService.getMultipleStockQuotes();
        res.json({ stocks });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch market stock list' });
    }
});

app.get('/api/market/quote/:symbol', async (req, res) => {
    try {
        const symbol = req.params.symbol;
        const quote = await marketService.getLiveStockQuote(symbol);
        res.json({ quote });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch quote for ' + req.params.symbol });
    }
});

app.get('/api/market/search', async (req, res) => {
    const query = (req.query.q || '').toUpperCase();
    const stocks = marketService.INITIAL_STOCKS.filter(s => 
        s.symbol.toUpperCase().includes(query) || s.name.toUpperCase().includes(query)
    );
    res.json({ results: stocks });
});

// -----------------------------------------------------------------------------
// PORTFOLIO & TRADING ROUTES (PROTECTED)
// -----------------------------------------------------------------------------

app.get('/api/portfolio', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = db.findUserById(userId);
        const holdings = db.getUserPortfolio(userId);

        // Fetch live quotes for current pricing & P&L calculation
        const updatedHoldings = await Promise.all(holdings.map(async (item) => {
            const liveQuote = await marketService.getLiveStockQuote(item.symbol);
            const currentPrice = liveQuote.price;
            const currentValue = item.shares * currentPrice;
            const totalProfitLoss = currentValue - item.totalInvested;
            const pnlPercentage = (totalProfitLoss / item.totalInvested) * 100;

            return {
                ...item,
                currentPrice,
                currentValue: Number(currentValue.toFixed(2)),
                totalProfitLoss: Number(totalProfitLoss.toFixed(2)),
                pnlPercentage: Number(pnlPercentage.toFixed(2)),
                changePercent: liveQuote.changePercent
            };
        }));

        const totalPortfolioValue = updatedHoldings.reduce((sum, h) => sum + h.currentValue, 0);
        const totalInvested = updatedHoldings.reduce((sum, h) => sum + h.totalInvested, 0);
        const totalPnl = totalPortfolioValue - totalInvested;

        res.json({
            cashBalance: user ? user.balance : 0,
            totalPortfolioValue: Number(totalPortfolioValue.toFixed(2)),
            totalInvested: Number(totalInvested.toFixed(2)),
            totalPnl: Number(totalPnl.toFixed(2)),
            netWorth: Number((user.balance + totalPortfolioValue).toFixed(2)),
            holdings: updatedHoldings
        });
    } catch (err) {
        console.error('Portfolio error:', err);
        res.status(500).json({ error: 'Failed to load portfolio' });
    }
});

app.post('/api/portfolio/order', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { symbol, action, shares } = req.body;

        const numShares = parseInt(shares, 10);
        if (!symbol || !action || isNaN(numShares) || numShares <= 0) {
            return res.status(400).json({ error: 'Invalid order parameters. Symbol, action (BUY/SELL), and valid share count required.' });
        }

        const user = db.findUserById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const quote = await marketService.getLiveStockQuote(symbol);
        const executionPrice = quote.price;
        const totalCost = executionPrice * numShares;

        if (action.toUpperCase() === 'BUY') {
            if (user.balance < totalCost) {
                return res.status(400).json({ error: `Insufficient cash balance. Required: ₹${totalCost.toFixed(2)}, Available: ₹${user.balance.toFixed(2)}` });
            }

            db.updateUserBalance(userId, user.balance - totalCost);
            const portfolio = db.updatePortfolio(userId, quote.symbol, quote.name, numShares, executionPrice);

            const order = {
                id: 'ord_' + Date.now(),
                userId,
                symbol: quote.symbol,
                name: quote.name,
                type: 'BUY',
                shares: numShares,
                price: executionPrice,
                total: Number(totalCost.toFixed(2)),
                timestamp: new Date().toISOString()
            };
            db.addOrder(order);

            return res.json({
                message: `Successfully bought ${numShares} shares of ${quote.name} at ₹${executionPrice}`,
                order,
                newBalance: user.balance - totalCost,
                portfolio
            });

        } else if (action.toUpperCase() === 'SELL') {
            const userHoldings = db.getUserPortfolio(userId);
            const holding = userHoldings.find(h => h.symbol === quote.symbol);

            if (!holding || holding.shares < numShares) {
                return res.status(400).json({ error: `Cannot sell ${numShares} shares. You only own ${holding ? holding.shares : 0} shares.` });
            }

            db.updateUserBalance(userId, user.balance + totalCost);
            const portfolio = db.updatePortfolio(userId, quote.symbol, quote.name, -numShares, executionPrice);

            const order = {
                id: 'ord_' + Date.now(),
                userId,
                symbol: quote.symbol,
                name: quote.name,
                type: 'SELL',
                shares: numShares,
                price: executionPrice,
                total: Number(totalCost.toFixed(2)),
                timestamp: new Date().toISOString()
            };
            db.addOrder(order);

            return res.json({
                message: `Successfully sold ${numShares} shares of ${quote.name} at ₹${executionPrice}`,
                order,
                newBalance: user.balance + totalCost,
                portfolio
            });

        } else {
            return res.status(400).json({ error: 'Invalid action type. Must be BUY or SELL.' });
        }

    } catch (err) {
        console.error('Order execution error:', err);
        res.status(500).json({ error: err.message || 'Order execution failed' });
    }
});

app.get('/api/portfolio/orders', authenticateToken, (req, res) => {
    const orders = db.getUserOrders(req.user.id);
    res.json({ orders });
});

// -----------------------------------------------------------------------------
// WATCHLIST ROUTES (PROTECTED)
// -----------------------------------------------------------------------------

app.get('/api/watchlist', authenticateToken, async (req, res) => {
    try {
        const symbols = db.getUserWatchlist(req.user.id);
        const quotes = await marketService.getMultipleStockQuotes(symbols);
        res.json({ watchlist: quotes });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load watchlist' });
    }
});

app.post('/api/watchlist/toggle', authenticateToken, (req, res) => {
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'Symbol is required' });
    const updatedSymbols = db.toggleWatchlist(req.user.id, symbol);
    res.json({ symbols: updatedSymbols });
});

// -----------------------------------------------------------------------------
// TRADE JOURNAL ROUTES (PROTECTED)
// -----------------------------------------------------------------------------

app.get('/api/journal', authenticateToken, (req, res) => {
    try {
        const journals = db.getUserJournals(req.user.id);
        res.json({ journals });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch journal entries' });
    }
});

app.post('/api/journal', authenticateToken, (req, res) => {
    try {
        const { title, symbol, action, reason, image, outcome } = req.body;
        if (!title || !reason) {
            return res.status(400).json({ error: 'Title and setup reason are required.' });
        }
        const journal = db.addJournal(req.user.id, { title, symbol, action, reason, image, outcome });
        res.status(201).json({ message: 'Trade journal entry saved successfully!', journal });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save trade journal entry' });
    }
});

app.delete('/api/journal/:id', authenticateToken, (req, res) => {
    try {
        const journalId = req.params.id;
        db.deleteJournal(req.user.id, journalId);
        res.json({ message: 'Journal entry deleted successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete journal entry' });
    }
});

// Catch-all route to serve index.html for client-side navigation
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Smart Market Server running at http://localhost:${PORT}`);
    console.log(`=======================================================`);
});
