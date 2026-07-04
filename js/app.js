// --- State Management ---
const rawStoredAccounts = JSON.parse(localStorage.getItem('luxe_accounts')) || [];
const storedAccounts = Array.isArray(rawStoredAccounts)
    ? rawStoredAccounts.map(acc => ({
        ...acc,
        initialBalance: parseFloat(acc.initialBalance || 0) || 0,
        target: parseFloat(acc.target || 0) || 0
    }))
    : [];
const rawStoredEvents = JSON.parse(localStorage.getItem('luxe_events')) || [];
const storedEvents = Array.isArray(rawStoredEvents)
    ? rawStoredEvents.map(evt => ({
        ...evt,
        initialBalance: parseFloat(evt.initialBalance || 0) || 0,
        target: parseFloat(evt.target || 0) || 0,
        mode: evt.mode || 'setLimit'
    }))
    : [];
const defaultAccount = {
    id: 'default',
    name: 'Personal Wallet',
    initialBalance: parseFloat(localStorage.getItem('luxe_initial_balance')) || 0,
    target: parseFloat(localStorage.getItem('luxe_target')) || 15000
};
let state = {
    transactions: JSON.parse(localStorage.getItem('luxe_transactions')) || [],
    events: storedEvents,
    accounts: storedAccounts.length ? storedAccounts : [defaultAccount],
    activeAccountId: String(localStorage.getItem('luxe_active_account_id') || 'default'),
    activeEventId: localStorage.getItem('luxe_active_event_id') ? Number(localStorage.getItem('luxe_active_event_id')) : null,
};

// Migration: Ensure all transactions have an accountId
const migrateTransactions = () => {
    let changed = false;
    state.transactions.forEach(t => {
        if (!t.accountId) {
            t.accountId = 'default';
            changed = true;
        }
    });
    if (changed) localStorage.setItem('luxe_transactions', JSON.stringify(state.transactions));
};
migrateTransactions();

// --- Selectors ---
const selectors = {
    transactionList: document.getElementById('transaction-list'),
    addModal: document.getElementById('add-modal'),
    addBtn: document.getElementById('add-transaction-btn'),
    closeBtn: document.getElementById('close-modal'),
    recordForm: document.getElementById('record-form'),
    // Stats selectors
    totalBalance: document.getElementById('stat-total-balance'),
    monthlyTarget: document.getElementById('stat-monthly-target'),
    monthlyExpenses: document.getElementById('stat-monthly-expenses'),
    remainingBudget: document.getElementById('stat-remaining-budget'),
    targetProgress: document.getElementById('target-progress-bar'),
    targetText: document.getElementById('target-progress-text'),
    categoryLabels: document.getElementById('category-labels'),
    categoryTotal: document.getElementById('category-total-text'),
    contentArea: document.getElementById('content'),
    // Settings Selectors
    settingsModal: document.getElementById('settings-modal'),
    settingsForm: document.getElementById('settings-form'),
    openSettingsBtn: document.getElementById('open-settings-btn'),
    closeSettingsBtn: document.getElementById('close-settings'),
    headerSettingsBtn: document.querySelector('header button[data-lucide="settings"]')?.parentElement,
    // Event Selectors
    eventList: document.getElementById('event-list'),
    activeEventBanner: document.getElementById('active-event-banner'),
    // Account Selectors
    accountsList: document.getElementById('accounts-list'),
    accountForm: document.getElementById('account-form'),
    addAccountModal: document.getElementById('add-account-modal'),
};

// --- Charts ---
let trendChart, catChart;

function initCharts() {
    const trendCtx = document.getElementById('spendingTrendChart')?.getContext('2d');
    const catCtx = document.getElementById('categoryChart')?.getContext('2d');

    if (!trendCtx || !catCtx) return;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const trendLabels = [];
    const trendData = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        trendLabels.push(months[d.getMonth()]);
        trendData.push(0); // Initialized
    }

    trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: trendLabels,
            datasets: [{
                label: 'Expenses',
                data: trendData,
                borderColor: '#8b5cf6',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                pointBackgroundColor: '#8b5cf6',
                pointBorderColor: 'rgba(255,255,255,0.1)',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { display: false },
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280', font: { family: 'Outfit' } }
                }
            }
        }
    });

    catChart = new Chart(catCtx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: ['#8b5cf6', '#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#6366f1'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            cutout: '80%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

function updateCharts(activeTransactions) {
    if (!trendChart || !catChart) return;

    // Category Breakdown
    const categories = {};
    activeTransactions.filter(t => t.type === 'expense').forEach(t => {
        categories[t.category] = (categories[t.category] || 0) + parseFloat(t.amount || 0);
    });

    const categoryNames = Object.keys(categories);
    const categoryValues = Object.values(categories);

    catChart.data.labels = categoryNames;
    catChart.data.datasets[0].data = categoryValues;
    catChart.update();

    const colors = ['#8b5cf6', '#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#6366f1'];
    if (selectors.categoryLabels) {
        selectors.categoryLabels.innerHTML = categoryNames.map((name, i) => `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <div class="w-3 h-3 rounded-full" style="background-color: ${colors[i % colors.length]}"></div>
                    <span class="text-sm text-gray-400">${name}</span>
                </div>
                <span class="text-sm font-semibold">₹${categories[name].toLocaleString()}</span>
            </div>
        `).join('');
    }

    // Trend Chart (Always shows last 6 months for the active account)
    const now = new Date();
    const trendValues = [];
    const accountTransactions = state.transactions.filter(t => t.accountId === state.activeAccountId);

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthlySum = accountTransactions
            .filter(t => {
                const td = new Date(t.date);
                return t.type === 'expense' && td.getMonth() === d.getMonth() && td.getFullYear() === d.getFullYear();
            })
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        trendValues.push(monthlySum);
    }
    trendChart.data.datasets[0].data = trendValues;
    trendChart.update();
}

function getAccountTransactions(accountId) {
    return state.transactions.filter(t => t.accountId === accountId);
}

function getAccountBalance(accountId) {
    const account = state.accounts.find(a => a.id === accountId);
    if (!account) return 0;
    const transactions = getAccountTransactions(accountId);
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const expenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    return parseFloat(account.initialBalance || 0) + income - expenses;
}

function updateStats() {
    const activeAccount = state.accounts.find(a => a.id === state.activeAccountId) || state.accounts[0];
    const activeEvent = state.events.find(e => e.id === state.activeEventId);
    
    let currentTarget = activeEvent ? parseFloat(activeEvent.target || 0) : parseFloat(activeAccount.target || 0);
    let currentBalance = activeEvent ? parseFloat(activeEvent.initialBalance || 0) : parseFloat(activeAccount.initialBalance || 0);
    const accountTransactions = getAccountTransactions(state.activeAccountId);
    const accountBalance = getAccountBalance(activeAccount.id);
    const isNoLimitEvent = activeEvent && activeEvent.mode === 'noLimit';

    // Filter transactions for current account
    let currentTransactions = accountTransactions;

    // Further filter if an event is active
    if (activeEvent) {
        currentTransactions = currentTransactions.filter(t => t.eventId === activeEvent.id);
        const eventTitle = document.getElementById('dashboard-active-event-title');
        if (eventTitle) eventTitle.innerText = activeEvent.name;
        selectors.activeEventBanner?.classList.remove('hidden');
    } else {
        selectors.activeEventBanner?.classList.add('hidden');
    }

    const income = currentTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const expenses = currentTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const eventBalance = parseFloat(activeEvent?.initialBalance || 0) + income - expenses;

    if (isNoLimitEvent) {
        currentTarget = 0;
        currentBalance = accountBalance;
    }

    const remaining = currentTarget - expenses;
    const progress = currentTarget > 0 ? Math.min((expenses / currentTarget) * 100, 100) : 0;
    const totalBalance = activeEvent && !isNoLimitEvent ? eventBalance : accountBalance;

    if (selectors.totalBalance) selectors.totalBalance.innerText = `₹${totalBalance.toLocaleString()}`;
    if (selectors.monthlyTarget) selectors.monthlyTarget.innerText = `₹${currentTarget.toLocaleString()}`;
    if (selectors.monthlyExpenses) selectors.monthlyExpenses.innerText = `₹${expenses.toLocaleString()}`;
    if (selectors.remainingBudget) selectors.remainingBudget.innerText = `₹${remaining.toLocaleString()}`;

    if (selectors.targetProgress) selectors.targetProgress.style.width = `${progress}%`;
    if (selectors.targetText) selectors.targetText.innerText = `${Math.round(progress)}% of budget used`;
    if (selectors.categoryTotal) selectors.categoryTotal.innerText = `₹${expenses.toLocaleString()}`;

    const targetCard = document.getElementById('target-card');
    const remainingCard = document.getElementById('remaining-card');
    if (isNoLimitEvent) {
        targetCard?.classList.add('hidden');
        remainingCard?.classList.add('hidden');
    } else {
        targetCard?.classList.remove('hidden');
        remainingCard?.classList.remove('hidden');
    }

    updateCharts(currentTransactions);

    const accountsView = document.getElementById('accounts-view');
    if (accountsView && !accountsView.classList.contains('hidden')) {
        renderAccounts();
    }
}

// --- UI Updates ---
function renderTransactions() {
    let transactions = state.transactions.filter(t => t.accountId === state.activeAccountId);
    
    if (state.activeEventId) {
        transactions = transactions.filter(t => t.eventId === state.activeEventId);
    }

    transactions = transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (selectors.transactionList) {
        selectors.transactionList.innerHTML = transactions.length === 0
            ? `<tr><td colspan="4" class="px-8 py-12 text-center text-gray-500">No records found</td></tr>`
            : transactions.slice(0, 8).map(t => createTransactionRow(t)).join('');
    }

    const fullList = document.getElementById('full-transaction-list');
    if (fullList) {
        fullList.innerHTML = transactions.length === 0
            ? `<tr><td colspan="4" class="px-8 py-12 text-center text-gray-500">No records found</td></tr>`
            : transactions.map(t => createTransactionRow(t)).join('');
    }

    renderEvents();
    const accountsView = document.getElementById('accounts-view');
    if (accountsView && !accountsView.classList.contains('hidden')) {
        renderAccounts();
    }
    lucide.createIcons();
}

function renderEvents() {
    if (!selectors.eventList) return;
    if (state.events.length === 0) {
        selectors.eventList.innerHTML = `<div class="lg:col-span-3 text-center py-20 glass-card"><i data-lucide="package-open" class="w-12 h-12 mx-auto text-gray-600 mb-4"></i><p class="text-gray-400">No events yet.</p></div>`;
        return;
    }

    selectors.eventList.innerHTML = state.events.map(event => {
        const isActive = state.activeEventId === event.id;
        const spent = state.transactions.filter(t => t.eventId === event.id && t.accountId === state.activeAccountId && t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const progress = event.target > 0 ? (spent / event.target) * 100 : 0;
        const targetLabel = event.mode === 'noLimit' ? 'No Limit' : `₹${parseFloat(event.target).toLocaleString()}`;

        return `<div class="glass-card p-6 border-l-4 ${isActive ? 'border-primary-500' : 'border-transparent'} relative group">
            <button onclick="deleteEvent(${event.id})" class="absolute top-4 right-4 p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            <div class="flex items-center justify-between mb-4">
                <div class="w-12 h-12 bg-primary-600/20 rounded-2xl flex items-center justify-center text-primary-500"><i data-lucide="calendar"></i></div>
                ${isActive ? '<span class="text-[10px] font-bold bg-primary-500/20 text-primary-500 px-3 py-1 rounded-full uppercase tracking-widest">Active</span>' : ''}
            </div>
            <h3 class="text-xl font-bold">${event.name}</h3>
            <p class="text-sm text-gray-500 mt-1 mb-6">Budget: ₹${parseFloat(event.initialBalance).toLocaleString()}</p>
            <div class="space-y-4">
                <div class="flex justify-between text-xs"><span class="text-gray-400">Spent: ₹${spent.toLocaleString()}</span><span class="font-bold">Target: ${targetLabel}</span></div>
                ${event.mode === 'noLimit' ? '' : `<div class="w-full bg-dark-800 rounded-full h-1.5"><div class="bg-primary-600 h-full rounded-full transition-all" style="width: ${Math.min(progress, 100)}%"></div></div>`}
            </div>
            <button onclick="setActiveEvent(${event.id})" class="w-full mt-6 py-2.5 ${isActive ? 'bg-primary-600/20 text-primary-500' : 'bg-primary-600 hover:bg-primary-500 text-white'} rounded-xl text-xs font-bold transition-all">${isActive ? 'Active' : 'Set Active'}</button>
        </div>`;
    }).join('');
}

function renderAccounts() {
    if (!selectors.accountsList) return;

    const accountsHTML = state.accounts.map(acc => {
        const isActive = state.activeAccountId === acc.id;
        const accountTransactions = state.transactions.filter(t => t.accountId === acc.id);
        const balance = getAccountBalance(acc.id);

        return `
            <div class="glass-card p-8 border-l-4 ${isActive ? 'border-primary-600' : 'border-transparent'} relative group">
                <div class="absolute top-4 right-4 flex gap-2">
                    ${isActive ? `<button onclick="document.getElementById('open-settings-btn')?.click()" class="p-2 text-gray-400 hover:text-primary-500 transition-all"><i data-lucide="settings" class="w-4 h-4"></i></button>` : ''}
                    ${acc.id !== 'default' ? `<button onclick="deleteAccount('${acc.id}')" class="p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : ''}
                </div>
                <div class="flex items-center justify-between mb-6">
                    <h3 class="text-2xl font-bold">${acc.name}</h3>
                    ${isActive ? '<span class="bg-primary-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase">Current</span>' : ''}
                </div>
                <div class="grid grid-cols-2 gap-4 mb-8">
                    <div>
                        <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Balance</p>
                        <p class="text-2xl font-bold">₹${balance.toLocaleString()}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Spent</p>
                        <p class="text-2xl font-bold">₹${accountTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount || 0), 0).toLocaleString()}</p>
                    </div>
                </div>
                <button onclick="setActiveAccount('${acc.id}')" 
                    class="w-full py-4 ${isActive ? 'bg-primary-600/20 text-primary-500 cursor-default' : 'bg-white/5 hover:bg-white/10 text-gray-400'} rounded-2xl font-bold transition-all">
                    ${isActive ? 'Active Account' : 'Switch to Account'}
                </button>
            </div>
        `;
    }).join('');

    const addButtonHTML = `
        <button onclick="document.getElementById('add-account-modal').classList.add('show')"
            class="glass-card p-8 border-2 border-dashed border-white/10 hover:border-primary-500/50 hover:bg-primary-500/5 transition-all group flex flex-col items-center justify-center text-center">
            <div class="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center text-gray-500 group-hover:text-primary-500 transition-all mb-4">
                <i data-lucide="plus" class="w-8 h-8"></i>
            </div>
            <h3 class="text-xl font-bold">Add New Account</h3>
            <p class="text-sm text-gray-500 mt-2">Manage multiple budgets separately</p>
        </button>
    `;

    selectors.accountsList.innerHTML = accountsHTML + addButtonHTML;
    lucide.createIcons();
}

function createTransactionRow(t) {
    return `<tr class="group hover:bg-white/5 transition-all">
        <td class="px-8 py-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-dark-800 flex items-center justify-center text-gray-400">
                    <i data-lucide="${getIconForCategory(t.category)}" class="w-5 h-5"></i>
                </div>
                <div>
                    <p class="font-semibold text-sm">${t.description}</p>
                    <p class="text-xs text-gray-500 capitalize">${t.type}</p>
                </div>
            </div>
        </td>
        <td class="px-8 py-4">
            <span class="text-xs font-medium px-2 py-1 rounded-lg bg-white/5 text-gray-400">${t.category}</span>
        </td>
        <td class="px-8 py-4 text-sm text-gray-500">${formatDate(t.date)}</td>
        <td class="px-8 py-4 text-right">
            <div class="flex items-center justify-end gap-3">
                <span class="font-bold ${t.type === 'income' ? 'text-green-500' : 'text-white'}">
                    ${t.type === 'income' ? '+' : '-'}₹${parseFloat(t.amount || 0).toLocaleString()}
                </span>
                <button onclick="deleteTransaction(${t.id})" class="p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        </td>
    </tr>`;
}

// --- Global Actions ---
window.setActiveAccount = function(id) {
    state.activeAccountId = id;
    state.activeEventId = null; 
    localStorage.setItem('luxe_active_account_id', id);
    localStorage.removeItem('luxe_active_event_id');
    updateStats();
    renderTransactions();
    renderAccounts();
};

window.deleteAccount = function(id) {
    if (id === 'default') return;
    if (confirm('Delete this account and all its transactions?')) {
        state.accounts = state.accounts.filter(a => a.id !== id);
        state.transactions = state.transactions.filter(t => t.accountId !== id);
        if (state.activeAccountId === id) {
            state.activeAccountId = 'default';
            localStorage.setItem('luxe_active_account_id', 'default');
        }
        localStorage.setItem('luxe_accounts', JSON.stringify(state.accounts));
        localStorage.setItem('luxe_transactions', JSON.stringify(state.transactions));
        renderTransactions();
        renderAccounts();
        updateStats();
    }
};

window.setActiveEvent = function (id) {
    state.activeEventId = state.activeEventId === id ? null : id;
    if (state.activeEventId) localStorage.setItem('luxe_active_event_id', state.activeEventId);
    else localStorage.removeItem('luxe_active_event_id');
    updateStats();
    renderTransactions();
};

window.deleteEvent = function (id) {
    if (confirm('Delete this event?')) {
        state.events = state.events.filter(e => e.id !== id);
        if (state.activeEventId === id) {
            state.activeEventId = null;
            localStorage.removeItem('luxe_active_event_id');
        }
        localStorage.setItem('luxe_events', JSON.stringify(state.events));
        updateStats();
        renderTransactions();
        renderAccounts();
    }
};

window.deleteTransaction = function (id) {
    if (confirm('Delete this transaction?')) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        localStorage.setItem('luxe_transactions', JSON.stringify(state.transactions));
        renderTransactions();
        renderAccounts();
        updateStats();
    }
};

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function getIconForCategory(cat) {
    const map = { 'Food & Dining': 'coffee', 'Transport': 'car', 'Bills & Utilities': 'zap', 'Shopping': 'shopping-cart', 'Entertainment': 'tv', 'Income Source': 'briefcase' };
    return map[cat] || 'tag';
}

function setupEventListeners() {
    selectors.addBtn?.addEventListener('click', () => {
        selectors.addModal.classList.add('show');
        // Default date to today
        const dateInput = selectors.recordForm.querySelector('[name="date"]');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    });
    selectors.closeBtn?.addEventListener('click', () => selectors.addModal.classList.remove('show'));
    
    selectors.recordForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(selectors.recordForm);
        const newRecord = {
            id: Date.now(),
            type: formData.get('type'),
            amount: parseFloat(formData.get('amount')),
            category: formData.get('category'),
            date: formData.get('date') || new Date().toISOString().split('T')[0],
            description: formData.get('description') || 'No description',
            accountId: state.activeAccountId,
            eventId: state.activeEventId ? state.activeEventId : null
        };
        state.transactions.unshift(newRecord);
        localStorage.setItem('luxe_transactions', JSON.stringify(state.transactions));
        renderTransactions();
        renderAccounts();
        updateStats();
        selectors.addModal.classList.remove('show');
        selectors.recordForm.reset();
    });

    const updateEventModeUI = () => {
        const mode = document.querySelector('[name="eventMode"]:checked')?.value;
        const totalGroup = document.getElementById('total-amount-group');
        const targetGroup = document.getElementById('target-amount-group');
        const totalInput = document.querySelector('[name="totalAmount"]');
        const targetInput = document.querySelector('[name="targetAmount"]');

        if (mode === 'noLimit') {
            totalGroup?.classList.add('hidden');
            targetGroup?.classList.add('hidden');
            totalInput?.removeAttribute('required');
            targetInput?.removeAttribute('required');
        } else {
            totalGroup?.classList.remove('hidden');
            targetGroup?.classList.remove('hidden');
            totalInput?.setAttribute('required', 'required');
            targetInput?.setAttribute('required', 'required');
        }
    };

    document.querySelectorAll('[name="eventMode"]').forEach(input => {
        input.addEventListener('change', updateEventModeUI);
    });
    updateEventModeUI();

    document.getElementById('event-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const eventMode = formData.get('eventMode') || 'setLimit';
        const newEvent = {
            id: Date.now(),
            name: formData.get('eventName'),
            mode: eventMode,
            initialBalance: eventMode === 'setLimit' ? parseFloat(formData.get('totalAmount')) || 0 : 0,
            target: eventMode === 'setLimit' ? parseFloat(formData.get('targetAmount')) || 0 : 0
        };
        state.events.push(newEvent);
        localStorage.setItem('luxe_events', JSON.stringify(state.events));
        renderEvents();
        document.getElementById('add-event-modal').classList.remove('show');
        e.target.reset();
        updateEventModeUI();
    });

    selectors.accountForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const newAccount = {
            id: 'acc_' + Date.now(),
            name: formData.get('accountName'),
            initialBalance: parseFloat(formData.get('initialBalance')) || 0,
            target: parseFloat(formData.get('monthlyTarget')) || 0
        };
        state.accounts.push(newAccount);
        localStorage.setItem('luxe_accounts', JSON.stringify(state.accounts));
        renderAccounts();
        document.getElementById('add-account-modal').classList.remove('show');
        e.target.reset();
    });

    const openSettings = () => {
        const activeAccount = state.accounts.find(a => a.id === state.activeAccountId);
        if (!activeAccount) return;
        selectors.settingsForm.querySelector('[name="initialBalance"]').value = activeAccount.initialBalance;
        selectors.settingsForm.querySelector('[name="monthlyTarget"]').value = activeAccount.target;
        selectors.settingsModal.classList.add('show');
    };

    selectors.openSettingsBtn?.addEventListener('click', openSettings);
    selectors.headerSettingsBtn?.addEventListener('click', openSettings);
    selectors.closeSettingsBtn?.addEventListener('click', () => selectors.settingsModal.classList.remove('show'));

    selectors.settingsForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const activeAccount = state.accounts.find(a => a.id === state.activeAccountId);
        if (activeAccount) {
            activeAccount.initialBalance = parseFloat(formData.get('initialBalance')) || 0;
            activeAccount.target = parseFloat(formData.get('monthlyTarget')) || 0;
            localStorage.setItem('luxe_accounts', JSON.stringify(state.accounts));
            updateStats();
            renderAccounts();
            selectors.settingsModal.classList.remove('show');
        }
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.getAttribute('data-view');
            if (view) switchView(view);
        });
    });

    // History Search
    const searchInput = document.querySelector('#history-view input[placeholder="Search..."]');
    searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const transactions = state.transactions.filter(t => t.accountId === state.activeAccountId);
        const filtered = transactions.filter(t => 
            t.description.toLowerCase().includes(query) || 
            t.category.toLowerCase().includes(query) ||
            t.amount.toString().includes(query)
        );
        const fullList = document.getElementById('full-transaction-list');
        if (fullList) {
            fullList.innerHTML = filtered.length === 0
                ? `<tr><td colspan="4" class="px-8 py-12 text-center text-gray-500">No matching records</td></tr>`
                : filtered.map(t => createTransactionRow(t)).join('');
            lucide.createIcons();
        }
    });
}

function getExportTransactions() {
    const filteredTransactions = state.transactions
        .filter(t => t.accountId === state.activeAccountId)
        .filter(t => state.activeEventId ? t.eventId === state.activeEventId : true)
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    return filteredTransactions.map(t => ({
        Date: new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        Type: t.type.charAt(0).toUpperCase() + t.type.slice(1),
        Category: t.category,
        Description: t.description || '',
        Amount: `${t.type === 'income' ? '+' : '-'}₹${parseFloat(t.amount || 0).toLocaleString()}`,
        Account: state.accounts.find(a => a.id === t.accountId)?.name || 'Unknown',
        Event: t.eventId ? state.events.find(e => e.id === t.eventId)?.name || 'Unknown' : 'None'
    }));
}

function downloadCSV(rows, fileName) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csvRows = [headers.join(',')];

    rows.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] ?? '';
            const escaped = String(value).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
    });

    const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

window.exportData = function (type) {
    const rows = getExportTransactions();
    if (!rows.length) {
        alert('No transactions available for export.');
        return;
    }

    const activeAccount = state.accounts.find(a => a.id === state.activeAccountId) || { name: 'LuxeBudget' };
    const fileBase = activeAccount.name.replace(/\s+/g, '_');

    if (type === 'csv') {
        downloadCSV(rows, `${fileBase}_transactions.csv`);
        return;
    }

    const jsPDFGlobal = window.jspdf?.jsPDF || window.jsPDF;
    if (!jsPDFGlobal) {
        alert('PDF export is unavailable.');
        return;
    }

    const doc = new jsPDFGlobal({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text(`Transactions for ${activeAccount.name}`, 14, 18);

    const headers = Object.keys(rows[0]);
    const body = rows.map(row => headers.map(header => row[header]));

    if (typeof doc.autoTable === 'function') {
        doc.autoTable({
            startY: 26,
            head: [headers],
            body,
            styles: { fontSize: 9, cellPadding: 4 },
            headStyles: { fillColor: [139, 92, 246] },
            theme: 'grid',
            margin: { left: 14, right: 14 }
        });
    } else {
        let y = 28;
        const lineHeight = 8;
        doc.setFontSize(10);
        doc.text(headers.join(' | '), 14, y);
        y += lineHeight;
        body.forEach(row => {
            if (y > 180) {
                doc.addPage();
                y = 20;
            }
            doc.text(row.join(' | '), 14, y);
            y += lineHeight;
        });
    }

    doc.save(`${fileBase}_transactions.pdf`);
};

window.switchView = function (view) {
    document.querySelectorAll('.view-container').forEach(v => v.classList.add('hidden'));
    document.getElementById(`${view}-view`)?.classList.remove('hidden');
    
    const title = document.getElementById('view-title');
    const subtitle = document.getElementById('view-subtitle');
    
    const viewMeta = {
        dashboard: { title: 'Dashboard', sub: "Welcome back, here's your overview." },
        events: { title: 'Event Budgets', sub: 'Track spending for specific project/trips' },
        history: { title: 'Transaction History', sub: 'A complete record of your finances' },
        accounts: { title: 'My Accounts', sub: 'Manage multiple wallets and banks' },
        export: { title: 'Export Data', sub: 'Back up or migrate your records' }
    };

    if (title && viewMeta[view]) title.innerText = viewMeta[view].title;
    if (subtitle && viewMeta[view]) subtitle.innerText = viewMeta[view].sub;

    if (view === 'history' || view === 'dashboard') renderTransactions();
    if (view === 'accounts') renderAccounts();
    
    // Update nav links UI
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('data-view') === view) link.classList.add('active');
        else link.classList.remove('active');
    });

    lucide.createIcons();
}

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    renderTransactions();
    updateStats();
    setupEventListeners();
    lucide.createIcons();
});
