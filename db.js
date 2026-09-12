const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data_store.json');

const defaultData = {
    users: [],
    portfolios: [],
    orders: [],
    watchlists: []
};

function loadData() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
            return defaultData;
        }
        const fileContent = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(fileContent);
    } catch (err) {
        console.error('Error reading database file:', err);
        return defaultData;
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error writing database file:', err);
    }
}

const db = {
    // User Operations
    getUsers: () => loadData().users,
    findUserByEmail: (email) => {
        const data = loadData();
        return data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    },
    findUserById: (id) => {
        const data = loadData();
        return data.users.find(u => u.id === id);
    },
    createUser: (user) => {
        const data = loadData();
        data.users.push(user);
        saveData(data);
        return user;
    },
    updateUserBalance: (userId, newBalance) => {
        const data = loadData();
        const user = data.users.find(u => u.id === userId);
        if (user) {
            user.balance = newBalance;
            saveData(data);
        }
        return user;
    },

    // Portfolio Operations
    getUserPortfolio: (userId) => {
        const data = loadData();
        return data.portfolios.filter(p => p.userId === userId);
    },
    updatePortfolio: (userId, symbol, name, sharesChange, currentPrice) => {
        const data = loadData();
        let item = data.portfolios.find(p => p.userId === userId && p.symbol === symbol);

        if (!item) {
            if (sharesChange <= 0) throw new Error("Cannot sell stock you don't own.");
            item = {
                id: 'port_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                userId,
                symbol,
                name,
                shares: sharesChange,
                avgPrice: currentPrice,
                totalInvested: sharesChange * currentPrice
            };
            data.portfolios.push(item);
        } else {
            const newShares = item.shares + sharesChange;
            if (newShares < 0) throw new Error("Insufficient shares to sell.");

            if (newShares === 0) {
                data.portfolios = data.portfolios.filter(p => !(p.userId === userId && p.symbol === symbol));
            } else {
                if (sharesChange > 0) {
                    const additionalCost = sharesChange * currentPrice;
                    item.totalInvested += additionalCost;
                    item.shares = newShares;
                    item.avgPrice = item.totalInvested / item.shares;
                } else {
                    item.shares = newShares;
                    item.totalInvested = item.shares * item.avgPrice;
                }
            }
        }
        saveData(data);
        return db.getUserPortfolio(userId);
    },

    // Order History Operations
    addOrder: (order) => {
        const data = loadData();
        data.orders.push(order);
        saveData(data);
        return order;
    },
    getUserOrders: (userId) => {
        const data = loadData();
        return data.orders.filter(o => o.userId === userId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },

    // Watchlist Operations
    getUserWatchlist: (userId) => {
        const data = loadData();
        const wl = data.watchlists.find(w => w.userId === userId);
        return wl ? wl.symbols : ['RELIANCE.NS', 'HDFCBANK.NS', 'TCS.NS', 'INFY.NS', 'TATAMOTORS.NS'];
    },
    toggleWatchlist: (userId, symbol) => {
        const data = loadData();
        let wl = data.watchlists.find(w => w.userId === userId);
        if (!wl) {
            wl = { userId, symbols: ['RELIANCE.NS', 'HDFCBANK.NS', 'TCS.NS', 'INFY.NS', 'TATAMOTORS.NS'] };
            data.watchlists.push(wl);
        }
        const index = wl.symbols.indexOf(symbol);
        if (index >= 0) {
            wl.symbols.splice(index, 1);
        } else {
            wl.symbols.push(symbol);
        }
        saveData(data);
        return wl.symbols;
    },

    // Journal Operations
    getUserJournals: (userId) => {
        const data = loadData();
        if (!data.journals) data.journals = [];
        return data.journals.filter(j => j.userId === userId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    },
    addJournal: (userId, entry) => {
        const data = loadData();
        if (!data.journals) data.journals = [];
        const journal = {
            id: 'jnl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            userId,
            title: entry.title || 'Trade Strategy Note',
            symbol: entry.symbol || 'NIFTY',
            action: entry.action || 'BUY',
            reason: entry.reason || '',
            image: entry.image || '',
            outcome: entry.outcome || 'Neutral',
            timestamp: new Date().toISOString()
        };
        data.journals.push(journal);
        saveData(data);
        return journal;
    },
    deleteJournal: (userId, journalId) => {
        const data = loadData();
        if (!data.journals) data.journals = [];
        data.journals = data.journals.filter(j => !(j.userId === userId && j.id === journalId));
        saveData(data);
        return true;
    }
};

module.exports = db;
