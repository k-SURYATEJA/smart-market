// Smart Market - Central Frontend API & Dynamic UI Manager

const API_BASE = window.location.origin;

const SmartMarket = {
    // Auth Token Management
    getToken: () => localStorage.getItem('sm_token'),
    setToken: (token) => localStorage.setItem('sm_token', token),
    removeToken: () => {
        localStorage.removeItem('sm_token');
        localStorage.removeItem('sm_user');
    },
    getUser: () => {
        const u = localStorage.getItem('sm_user');
        return u ? JSON.parse(u) : null;
    },
    setUser: (user) => localStorage.setItem('sm_user', JSON.stringify(user)),

    // API Wrapper
    fetchAPI: async (endpoint, options = {}) => {
        const token = SmartMarket.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...(options.headers || {})
        };

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'API Request failed');
            return data;
        } catch (err) {
            console.error(`API Error [${endpoint}]:`, err);
            throw err;
        }
    },

    // Global Dynamic Navbar Loader
    initNavbar: async () => {
        const nav = document.querySelector('nav');
        if (!nav) return;

        const user = SmartMarket.getUser();
        
        // Update nav links & auth button
        const authBtnContainer = nav.querySelector('.btnlog') || nav.querySelector('.btnsub') || nav.querySelector('.nav-auth-container') || nav.querySelector('button');
        
        let userMenuHTML = '';
        if (user) {
            userMenuHTML = `
                <div class="nav-auth-container" style="margin-left: auto; display: flex; align-items: center; gap: 15px;">
                    <span style="color: #FFD700; font-weight: 600; font-size: 14px;">
                        💰 Cash: ₹${Number(user.balance || 1000000).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </span>
                    <span style="color: #ffffff; font-weight: 500; font-size: 14px;">👤 ${user.name}</span>
                    <button id="sm-logout-btn" style="background: transparent; border: 1px solid #FFD700; color: #FFD700; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;">Logout</button>
                </div>
            `;
        } else {
            userMenuHTML = `<div class="nav-auth-container" style="margin-left: auto;"><button class="btnlog" onclick="location.href='loginupsm.html'">Login / Signup</button></div>`;
        }

        if (authBtnContainer) {
            authBtnContainer.outerHTML = userMenuHTML;
        }

        const logoutBtn = document.getElementById('sm-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                SmartMarket.removeToken();
                alert('Logged out successfully.');
                window.location.href = 'index.html';
            });
        }
    },

    // Real-Time Live Ticker Updating
    initLiveTicker: async () => {
        const marquee = document.querySelector('.ticker marquee');
        if (!marquee) return;

        try {
            const { indices } = await SmartMarket.fetchAPI('/api/market/indices');
            const { stocks } = await SmartMarket.fetchAPI('/api/market/stocks');

            const allItems = [...indices, ...stocks];
            const tickerString = allItems.map(item => {
                const sign = item.change >= 0 ? '▲' : '▼';
                const color = item.change >= 0 ? '#00e676' : '#ff5252';
                return `<span style="margin: 0 15px;"><strong style="color:#ffffff;">${item.name}</strong> <span style="color:${color};">${sign} ₹${item.price.toLocaleString('en-IN')} (${item.change >= 0 ? '+' : ''}${item.changePercent}%)</span></span>`;
            }).join(' || ');

            marquee.innerHTML = tickerString;
        } catch (err) {
            console.log('Using default ticker fallback');
        }
    },

    // Stock Order Placement
    placeOrder: async (symbol, action, shares) => {
        try {
            const data = await SmartMarket.fetchAPI('/api/portfolio/order', {
                method: 'POST',
                body: JSON.stringify({ symbol, action, shares })
            });

            // Update user balance stored locally
            const user = SmartMarket.getUser();
            if (user) {
                user.balance = data.newBalance;
                SmartMarket.setUser(user);
            }

            alert(`✅ ${data.message}`);
            window.location.reload();
        } catch (err) {
            alert(`❌ Order Failed: ${err.message}`);
        }
    }
};

// Auto-run common UI handlers on page load
document.addEventListener('DOMContentLoaded', () => {
    SmartMarket.initNavbar();
    SmartMarket.initLiveTicker();
    // Refresh live ticker every 15 seconds
    setInterval(SmartMarket.initLiveTicker, 15000);
});
