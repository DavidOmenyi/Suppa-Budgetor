// ==========================================
// 1. SUPABASE AUTH & CONFIGURATION
// ==========================================

const supabaseUrl = 'https://ffzkpuiujxdqwjvmhrmx.supabase.co'; 
const supabaseKey = 'sb_publishable_yNJ1bJEdGV4Vpw_itRG1mA_XOBP8efu'; 

const supabaseLib = window.supabase || supabase;
const supabaseClient = supabaseLib.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let pollingInterval = null;

// ==========================================
// 2. GLOBAL STATE & MEMORY
// ==========================================
let transactions = [];
let categoryBudgets = {}; 
let customMem = { Expense: [], Income: [], Savings: [], Names: [], Icons: {} };
let historyStack = []; 
let redoStack = []; 
let currentDate = new Date();

const categories = {
    Expense: ['Transport', 'Food', 'Transaction Cost', 'Entertainment', 'Education', 'Childcare', 'Homecare', 'Groceries', 'Self-care', 'Work disbursements', 'Charity', 'Contingency sums'],
    Income: ['Salary', 'Business', 'Dividends', 'Interest', 'Other'],
    Savings: ['Sinking Funds', 'Investment', 'Emergency funds', 'Savings']
};

const defaultIcons = {
    'Transport': '🚌', 'Food': '🍔', 'Transaction Cost': '💸', 'Entertainment': '🍿',
    'Education': '📚', 'Childcare': '👶', 'Homecare': '🏠', 'Groceries': '🛒',
    'Self-care': '💆', 'Work disbursements': '💼', 'Charity': '🕊️', 'Contingency sums': '🆘',
    'Salary': '💵', 'Business': '🏪', 'Dividends': '📈', 'Interest': '🏦', 'Other': '📦',
    'Sinking Funds': '⚓', 'Investment': '💎', 'Emergency funds': '🚑', 'Savings': '🐖'
};

const chartColors = [
    '#059669', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', 
    '#14b8a6', '#ef4444', '#84cc16', '#6366f1', '#10b981', 
    '#f97316', '#06b6d4', '#d946ef', '#a855f7', '#22c55e', 
    '#eab308', '#0ea5e9', '#f43f5e', '#4f46e5', '#8dc63f',
    '#1d4ed8', '#be123c', '#4338ca', '#047857', '#b45309'
];

let pieChartInstance = null; 
let barChartInstance = null; 
let inflationChartInstance = null;

// ==========================================
// 3. GLOBAL FUNCTIONS (Accessible by HTML)
// ==========================================

window.updateProfileUI = function(displayName, avatarUrl) {
    ['userNameDisplay', 'appUserNameDisplay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = displayName;
    });
    
    const avatarPairs = [
        { img: 'userAvatarImg', fallback: 'userAvatarFallback' },
        { img: 'appUserAvatarImg', fallback: 'appUserAvatarFallback' }
    ];
    
    avatarPairs.forEach(pair => {
        const imgEl = document.getElementById(pair.img);
        const fallbackEl = document.getElementById(pair.fallback);
        if (imgEl && fallbackEl) {
            if (avatarUrl && avatarUrl.length > 5) {
                imgEl.src = avatarUrl;
                imgEl.style.display = 'block';
                fallbackEl.style.display = 'none';
            } else {
                imgEl.style.display = 'none';
                fallbackEl.style.display = 'flex';
            }
        }
    });
};

window.initializeApp = async function() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = user;
    const metadata = currentUser.user_metadata || {};
    const displayName = metadata.display_name || metadata.full_name || currentUser.email.split('@')[0];
    const avatarUrl = metadata.avatar_url || metadata.picture || '';
    
    window.updateProfileUI(displayName, avatarUrl);
    window.checkPremiumStatus();
};

window.checkPremiumStatus = async function() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('is_premium')
        .eq('id', currentUser.id)
        .single();
        
    if (data && data.is_premium === true) window.unlockApp();
    else window.lockApp();
};

window.unlockApp = function() {
    const lockedScreen = document.getElementById('lockedScreen');
    const appContainer = document.getElementById('appContainer');
    if (lockedScreen) lockedScreen.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    if (pollingInterval) clearInterval(pollingInterval);
};

window.lockApp = function() {
    const lockedScreen = document.getElementById('lockedScreen');
    const appContainer = document.getElementById('appContainer');
    if (lockedScreen) lockedScreen.style.display = 'block';
    if (appContainer) appContainer.style.display = 'none';
};

window.startPollingDatabase = function() {
    pollingInterval = setInterval(async () => {
        const { data } = await supabaseClient.from('profiles').select('is_premium').eq('id', currentUser.id).single();
        if (data && data.is_premium === true) window.unlockApp();
    }, 3000); 

    setTimeout(() => {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            const paymentStatus = document.getElementById('paymentStatus');
            const payButton = document.getElementById('payButton');
            if (paymentStatus) { paymentStatus.textContent = "Payment timed out. Please try again."; paymentStatus.style.color = "red"; }
            if (payButton) { payButton.disabled = false; payButton.textContent = "Pay to Unlock"; }
        }
    }, 120000); 
};

window.openProfileModal = function() {
    const metadata = currentUser.user_metadata || {};
    document.getElementById('profile-name-input').value = metadata.display_name || metadata.full_name || currentUser.email.split('@')[0];
    document.getElementById('profile-avatar-input').value = metadata.avatar_url || metadata.picture || '';
    
    const d1 = document.getElementById('profileDropdown');
    const d2 = document.getElementById('appProfileDropdown');
    if(d1) d1.style.display = 'none';
    if(d2) d2.style.display = 'none';
    
    document.getElementById('profile-modal').classList.remove('hidden');
};

window.closeProfileModal = function() { document.getElementById('profile-modal').classList.add('hidden'); };

window.saveProfile = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('save-profile-btn');
    btn.textContent = "Saving..."; btn.disabled = true;

    const newName = document.getElementById('profile-name-input').value.trim();
    const newAvatar = document.getElementById('profile-avatar-input').value.trim();

    try {
        const { data, error } = await supabaseClient.auth.updateUser({ data: { display_name: newName, avatar_url: newAvatar } });
        if (error) throw error;
        
        currentUser = data.user; 
        window.updateProfileUI(newName || currentUser.email.split('@')[0], newAvatar);
        window.closeProfileModal();
    } catch (err) {
        alert("Failed to update profile: " + err.message);
    } finally {
        btn.textContent = "Save Profile"; btn.disabled = false;
    }
};

window.forceLogout = async function(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.target) { e.target.innerText = "Logging out..."; e.target.style.opacity = "0.6"; }
    try { await supabaseClient.auth.signOut(); } catch (err) { console.error("SignOut error:", err); }
    window.location.href = 'login.html';
};

window.getIcon = function(cat) { return defaultIcons[cat] || (customMem.Icons && customMem.Icons[cat]) || '🏷️'; };

window.autoSelectIcon = function(prefix) {
    const cat = document.getElementById(`${prefix}-category`).value.trim();
    const iconDropdown = document.getElementById(`${prefix}-category-icon`);
    if(cat && iconDropdown) {
        const icon = window.getIcon(cat);
        let optionExists = Array.from(iconDropdown.options).some(opt => opt.value === icon);
        if(!optionExists) iconDropdown.innerHTML += `<option value="${icon}">${icon}</option>`;
        iconDropdown.value = icon;
    }
};

window.repairAndLoadData = function() {
    try {
        const loadedTx = JSON.parse(localStorage.getItem('suppa_tx')) || [];
        transactions = loadedTx.filter(t => t && typeof t === 'object' && t.id).map(t => {
            let type = String(t.type || 'Expense').trim();
            let cat = String(t.category || 'Uncategorized').trim();
            if (type === 'Savings') type = 'Savings-Deposit';

            return {
                id: t.id, name: String(t.name || '(General)').trim(), type: type,
                category: cat, date: String(t.date || new Date().toISOString().split('T')[0]).trim(),
                actual: Math.abs(parseFloat(t.actual) || 0), qty: parseFloat(t.qty) || 1, fx: parseFloat(t.fx) || 1,
                kes: Math.abs(parseFloat(t.kes) || 0), notes: String(t.notes || '').trim()
            };
        });

        let legacyBals = JSON.parse(localStorage.getItem('suppa_bal'));
        if (legacyBals && Object.keys(legacyBals).length > 0) {
            let migrated = false;
            Object.keys(legacyBals).forEach(cat => {
                if (parseFloat(legacyBals[cat]) > 0) {
                    transactions.push({ id: Date.now() + Math.random(), name: 'Initial Balance Migration', type: 'Starting-Balance', category: cat, date: '2020-01-01', actual: parseFloat(legacyBals[cat]), qty: 1, fx: 1, kes: parseFloat(legacyBals[cat]), notes: 'Auto-migrated' });
                    migrated = true;
                }
            });
            if(migrated) { localStorage.setItem('suppa_tx', JSON.stringify(transactions)); localStorage.removeItem('suppa_bal'); }
        }

        const loadedBudgets = JSON.parse(localStorage.getItem('suppa_budgets_v2')) || {};
        if (typeof loadedBudgets === 'object' && !Array.isArray(loadedBudgets)) {
            Object.keys(loadedBudgets).forEach(m => {
                if (typeof loadedBudgets[m] === 'object' && !Array.isArray(loadedBudgets[m])) { categoryBudgets[m] = loadedBudgets[m]; }
            });
        }
        
        const loadedMem = JSON.parse(localStorage.getItem('suppa_custom_mem')) || {};
        customMem = { Expense: Array.isArray(loadedMem.Expense) ? loadedMem.Expense : [], Income: Array.isArray(loadedMem.Income) ? loadedMem.Income : [], Savings: Array.isArray(loadedMem.Savings) ? loadedMem.Savings : [], Names: Array.isArray(loadedMem.Names) ? loadedMem.Names : [], Icons: loadedMem.Icons || {} };
    } catch (e) {
        console.error("Data repair failed.", e);
        transactions = []; categoryBudgets = {}; 
    }
};

window.initTheme = function() { if(localStorage.getItem('suppa_theme') === 'dark') document.body.setAttribute('data-theme', 'dark'); };

window.toggleTheme = function() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('suppa_theme', isDark ? 'light' : 'dark');
    window.updateCharts(); window.updateInflationChart();
};

window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
    if(tabId === 'analytics') window.updateAnalytics();
    if(tabId === 'budget') window.renderBudgetSetup();
};

window.addToMemory = function(type, cat, name, icon) {
    let changed = false;
    let normalizedType = type;
    if (type.includes('Savings') || type === 'Starting-Balance') normalizedType = 'Savings';

    if (cat && cat !== 'Uncategorized') {
        if (!customMem[normalizedType]) customMem[normalizedType] = [];
        if (!customMem[normalizedType].includes(cat)) { customMem[normalizedType].push(cat); changed = true; }
        if (!customMem.Icons) customMem.Icons = {};
        if (icon && customMem.Icons[cat] !== icon) { customMem.Icons[cat] = icon; changed = true; }
    }
    if (name && name !== '(General)') {
        if (!customMem.Names.includes(name)) { customMem.Names.push(name); changed = true; }
    }
    if (changed) localStorage.setItem('suppa_custom_mem', JSON.stringify(customMem));
};

window.toggleCategories = function(clearInput = true, typeId, inputId, listId) {
    const type = document.getElementById(typeId).value;
    const dl = document.getElementById(listId);
    const input = document.getElementById(inputId);
    
    if (clearInput && input) { input.value = ''; window.autoSelectIcon(inputId.split('-')[0]); }
    if (dl) dl.innerHTML = '';
    
    let baseOpts = categories[type] || [];
    let customOpts = transactions.filter(t => t.type.includes(type) || (type==='Savings' && t.type==='Starting-Balance')).map(t => t.category);
    if (customMem[type]) customOpts.push(...customMem[type]);
    
    let allOpts = [...new Set([...baseOpts, ...customOpts])];
    allOpts.forEach(c => dl.innerHTML += `<option value="${c}">${c}</option>`);
};

window.handleTypeChange = function(prefix) {
    window.toggleCategories(true, prefix+'-type', prefix+'-category', prefix === 'tx' ? 'cat-memory' : 'edit-cat-memory');
    const type = document.getElementById(prefix+'-type').value;
    const actionGroup = document.getElementById(prefix+'-savings-action-group');
    const catLabel = document.getElementById(prefix+'-category-label');
    
    if(type === 'Savings') {
        actionGroup.classList.remove('hidden');
        if (catLabel) catLabel.innerText = "Account Type";
    } else {
        actionGroup.classList.add('hidden');
        if (catLabel) catLabel.innerText = "Category";
    }
    window.calcKES(prefix);
};

window.calcKES = function(prefix) {
    const actual = Math.abs(parseFloat(document.getElementById(`${prefix}-actual`).value) || 0);
    const fx = parseFloat(document.getElementById(`${prefix}-fx`).value) || 1;
    const qty = parseFloat(document.getElementById(`${prefix}-qty`).value) || 1;
    document.getElementById(`${prefix}-kes`).value = (actual * fx * qty).toFixed(2);
};

window.saveTransaction = function(e) {
    e.preventDefault(); window.saveState();

    const prefix = document.getElementById('tx-id').value ? 'edit-tx' : 'tx';
    const txIdInput = document.getElementById('tx-id').value;
    const isUpdate = !!txIdInput;

    const rawName = document.getElementById('tx-name').value.trim();
    const rawCat = document.getElementById('tx-category').value.trim();
    const chosenIcon = document.getElementById('tx-category-icon').value;
    
    let finalType = document.getElementById('tx-type').value;
    if (finalType === 'Savings') finalType = document.getElementById('tx-savings-action').value;

    const newTx = {
        id: isUpdate ? parseInt(txIdInput) : Date.now(),
        name: rawName || '(General)', type: finalType, category: rawCat || 'Uncategorized',
        date: document.getElementById('tx-date').value,
        actual: Math.abs(parseFloat(document.getElementById('tx-actual').value) || 0),
        qty: parseFloat(document.getElementById('tx-qty').value) || 1, fx: parseFloat(document.getElementById('tx-fx').value) || 1,
        kes: parseFloat(document.getElementById('tx-kes').value) || 0, notes: document.getElementById('tx-notes').value
    };

    window.addToMemory(newTx.type, newTx.category, newTx.name, chosenIcon);

    if (isUpdate) {
        const idx = transactions.findIndex(t => t.id === newTx.id);
        if (idx > -1) transactions[idx] = newTx;
        document.getElementById('tx-id').value = ""; 
    } else {
        transactions.push(newTx);
    }

    window.saveData(); window.updateDatalists(); window.updateUI();
    
    const btn = document.getElementById('tx-submit-btn');
    btn.innerText = isUpdate ? "✓ Updated!" : "✓ Saved!"; btn.style.background = "var(--success)";

    setTimeout(() => { 
        btn.innerText = "Add to Ledger"; btn.style.background = ""; e.target.reset(); 
        document.getElementById('tx-date').valueAsDate = new Date(); 
        document.getElementById('tx-fx').value = 1; document.getElementById('tx-qty').value = 1;
        window.handleTypeChange('tx');
    }, 1500);
};

window.openEditModal = function(id) {
    const tx = transactions.find(t => t.id === id);
    if(!tx) return;
    
    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-name').value = tx.name === '(General)' ? '' : tx.name;
    
    if (tx.type.includes('Savings') || tx.type === 'Starting-Balance') {
        document.getElementById('edit-tx-type').value = 'Savings'; window.handleTypeChange('edit-tx');
        document.getElementById('edit-tx-savings-action').value = tx.type;
    } else {
        document.getElementById('edit-tx-type').value = tx.type; window.handleTypeChange('edit-tx');
    }

    document.getElementById('edit-tx-category').value = tx.category; window.autoSelectIcon('edit-tx');
    document.getElementById('edit-tx-date').value = tx.date;
    document.getElementById('edit-tx-actual').value = Math.abs(tx.actual);
    document.getElementById('edit-tx-qty').value = tx.qty;
    document.getElementById('edit-tx-fx').value = tx.fx;
    document.getElementById('edit-tx-kes').value = tx.kes;
    document.getElementById('edit-tx-notes').value = tx.notes || '';
    
    document.getElementById('edit-modal').classList.remove('hidden');
};

window.closeEditModal = function() { document.getElementById('edit-modal').classList.add('hidden'); };

window.updateTransaction = function(e) {
    e.preventDefault(); window.saveState();
    
    const id = parseInt(document.getElementById('edit-tx-id').value);
    const index = transactions.findIndex(t => t.id === id);
    if(index === -1) return;
    
    let finalType = document.getElementById('edit-tx-type').value;
    if (finalType === 'Savings') finalType = document.getElementById('edit-tx-savings-action').value;
    const chosenIcon = document.getElementById('edit-tx-category-icon').value;

    const newTx = {
        id: id, name: document.getElementById('edit-tx-name').value.trim() || '(General)',
        type: finalType, category: document.getElementById('edit-tx-category').value.trim() || 'Uncategorized',
        date: document.getElementById('edit-tx-date').value,
        actual: Math.abs(parseFloat(document.getElementById('edit-tx-actual').value) || 0),
        qty: parseFloat(document.getElementById('edit-tx-qty').value) || 1, fx: parseFloat(document.getElementById('edit-tx-fx').value) || 1,
        kes: parseFloat(document.getElementById('edit-tx-kes').value), notes: document.getElementById('edit-tx-notes').value
    };

    window.addToMemory(newTx.type, newTx.category, newTx.name, chosenIcon);
    transactions[index] = newTx;
    window.saveData(); window.updateDatalists(); window.updateUI(); window.updateCharts(); window.updateInflationChart();
    window.closeEditModal();
};

window.deleteEditTx = function() {
    if(!confirm("Are you sure you want to completely delete this entry?")) return;
    window.saveState();
    const id = parseInt(document.getElementById('edit-tx-id').value);
    transactions = transactions.filter(t => t.id !== id);
    window.saveData(); window.updateDatalists(); window.updateUI(); window.updateCharts(); window.updateInflationChart();
    window.closeEditModal();
};

// NEW LEDGER FUNCTIONS
window.openLedger = function(cat, name, isIncome = false) {
    const monthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2, '0')}`;
    let txs = transactions.filter(t => t.date && t.date.substring(0,7) === monthStr);
    
    if (isIncome) {
        txs = txs.filter(t => t.type === 'Income' && t.category === cat);
        document.getElementById('ledger-title').innerText = `Income Ledger: ${cat} (${monthStr})`;
    } else {
        txs = txs.filter(t => (t.type === 'Expense' || t.type === 'Savings-Deposit') && t.category === cat && t.name === name);
        document.getElementById('ledger-title').innerText = `Ledger: ${name === '(General)' ? cat : name} (${monthStr})`;
    }
    
    txs.sort((a,b) => new Date(b.date) - new Date(a.date));
    const tbody = document.getElementById('ledger-body'); 
    tbody.innerHTML = '';
    
    if (txs.length === 0) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No records found.</td></tr>`;
    
    txs.forEach(tx => {
        tbody.innerHTML += `
            <tr>
                <td>${tx.date}</td>
                <td>${tx.name}</td>
                <td style="font-weight:bold;">${tx.kes.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="font-size:0.9em; color:var(--text-muted);">${tx.notes || '-'}</td>
                <td>
                    <button onclick="window.editTx(${tx.id})" style="background:var(--accent); color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; margin-bottom:4px; font-size:12px;">Edit</button>
                    <button onclick="window.deleteTxFromLedger(${tx.id})" style="background:var(--danger); color:white; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px;">Del</button>
                </td>
            </tr>
        `;
    });
    document.getElementById('ledger-modal').classList.remove('hidden');
};

window.closeLedger = function() { document.getElementById('ledger-modal').classList.add('hidden'); };

window.editTx = function(id) {
    window.closeLedger();
    window.openEditModal(id);
};

window.deleteTxFromLedger = function(id) {
    if(!confirm("Are you sure you want to delete this transaction?")) return;
    window.saveState();
    transactions = transactions.filter(t => t.id !== id);
    window.saveData(); 
    window.updateDatalists(); 
    window.updateUI(); 
    window.updateCharts(); 
    window.updateInflationChart();
    window.closeLedger();
};

window.updateDatalists = function() {
    const txMem = document.getElementById('tx-memory'); txMem.innerHTML = '';
    let allNames = [...new Set([...transactions.map(t => t.name), ...customMem.Names])];
    allNames.forEach(n => { if(n!=='(General)') txMem.innerHTML += `<option value="${n}">${n}</option>`; });

    const bCatMem = document.getElementById('budget-cat-memory');
    const bNameMem = document.getElementById('budget-name-memory');
    if(bCatMem && bNameMem) {
        bCatMem.innerHTML = ''; bNameMem.innerHTML = '';
        let allCats = new Set();
        Object.keys(categories).forEach(type => { if (type !== 'Income') categories[type].forEach(c => allCats.add(c)); });
        if (customMem.Expense) customMem.Expense.forEach(c => allCats.add(c));
        if (customMem.Savings) customMem.Savings.forEach(c => allCats.add(c));
        transactions.filter(t => t.type !== 'Income').forEach(t => allCats.add(t.category));
        allNames.forEach(n => { if(n !== '(General)') bNameMem.innerHTML += `<option value="${n}">${n}</option>`; });
        [...allCats].sort().forEach(c => { bCatMem.innerHTML += `<option value="${c}">${c}</option>`; });
    }
};

window.getMonthStr = function(dateObj) { return `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2, '0')}`; };

window.getBudget = function(cat, name, targetMonthStr) {
    const key = `${cat}::${name}`;
    const sortedMonths = Object.keys(categoryBudgets).sort().reverse();
    for (let m of sortedMonths) {
        if (m <= targetMonthStr && categoryBudgets[m]) {
            if (categoryBudgets[m][key] !== undefined) return categoryBudgets[m][key];
        }
    }
    return 0; 
};

window.saveSingleBudget = function(e) {
    e.preventDefault();
    const monthStr = document.getElementById('budget-month-picker').value;
    let cat = document.getElementById('budget-category').value.trim();
    let name = document.getElementById('budget-name').value.trim();
    const amount = parseFloat(document.getElementById('budget-amount').value) || 0;

    if (cat && !name) {
        let match = transactions.slice().reverse().find(t => t.name.toLowerCase() === cat.toLowerCase() && t.type !== 'Income');
        if (match && match.category) { name = cat; cat = match.category; } else { name = '(General)'; }
    } else if (!name) { name = '(General)'; }
    if (!cat) cat = 'Uncategorized';

    let inferredType = 'Expense';
    if (categories.Savings.includes(cat) || customMem.Savings.includes(cat) || transactions.some(t => t.category === cat && t.type.includes('Savings'))) inferredType = 'Savings';
    window.addToMemory(inferredType, cat, name, null);

    if(!categoryBudgets[monthStr]) categoryBudgets[monthStr] = {};
    categoryBudgets[monthStr][`${cat}::${name}`] = amount;
    localStorage.setItem('suppa_budgets_v2', JSON.stringify(categoryBudgets));
    
    document.getElementById('budget-category').value = ''; document.getElementById('budget-name').value = ''; document.getElementById('budget-amount').value = '';
    window.renderBudgetSetup(); window.updateUI(); window.updateCharts();
    
    const btn = document.getElementById('budget-submit-btn');
    btn.innerText = "✓ Budget Saved!"; btn.style.background = "var(--success)";
    setTimeout(() => { btn.innerText = "Add / Update Budget"; btn.style.background = ""; }, 1500);
};

window.editBudgetForm = function(cat, name, amount) {
    document.getElementById('budget-category').value = cat;
    document.getElementById('budget-name').value = name === '(General)' ? '' : name;
    document.getElementById('budget-amount').value = amount;
    document.getElementById('budget-amount').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteBudget = function(cat, name, monthStr) {
    if(!confirm("Delete this budget allocation?")) return;
    const key = `${cat}::${name}`;
    if(categoryBudgets[monthStr] && categoryBudgets[monthStr][key] !== undefined) {
        categoryBudgets[monthStr][key] = 0; 
        localStorage.setItem('suppa_budgets_v2', JSON.stringify(categoryBudgets));
        window.renderBudgetSetup(); window.updateUI(); window.updateCharts();
    }
};

window.renderBudgetSetup = function() {
    try {
        const monthStr = document.getElementById('budget-month-picker').value;
        if(!monthStr) return;
        const tbody = document.getElementById('budget-setup-body'); tbody.innerHTML = '';

        let activeItems = new Set();
        Object.keys(categoryBudgets).forEach(m => {
            if(m <= monthStr && categoryBudgets[m]) {
                Object.keys(categoryBudgets[m]).forEach(k => {
                    let parts = k.split('::');
                    if(window.getBudget(parts[0], parts[1], monthStr) > 0) activeItems.add(k);
                });
            }
        });

        Array.from(activeItems).sort().forEach(key => {
            const parts = key.split('::');
            const cat = parts[0]; const name = parts[1];
            const amt = window.getBudget(cat, name, monthStr);
            const isExplicit = categoryBudgets[monthStr] && categoryBudgets[monthStr][key] !== undefined;

            tbody.innerHTML += `
                <tr>
                    <td>${window.getIcon(cat)} ${cat} <br><small style="color:var(--text-muted)">${name === '(General)' ? 'Category Target' : name}</small> ${!isExplicit ? '<br><small style="color:var(--accent)">(Rolled Forward)</small>' : ''}</td>
                    <td style="font-weight:bold;">${amt.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td>
                        <button type="button" style="background:var(--accent); color:#fff; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="window.editBudgetForm('${cat.replace(/'/g,"\\'")}', '${name.replace(/'/g,"\\'")}', ${amt})">Edit</button>
                        ${isExplicit ? `<button type="button" style="background:var(--danger); color:#fff; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; margin-left:5px;" onclick="window.deleteBudget('${cat.replace(/'/g,"\\'")}', '${name.replace(/'/g,"\\'")}', '${monthStr}')">Del</button>` : ''}
                    </td>
                </tr>
            `;
        });
    } catch(e) { console.error("Error rendering budget setup", e); }
};

window.calculateRollover = function(upToMonthStr) {
    let rollover = 0;
    let pastMonths = new Set([...transactions.filter(t=>t.date).map(t => t.date.substring(0,7))]);
    pastMonths = Array.from(pastMonths).filter(m => m < upToMonthStr).sort();
    pastMonths.forEach(m => {
        let mIn = 0; let mOut = 0;
        transactions.filter(t => t.date && t.date.startsWith(m)).forEach(t => {
            if (t.type === 'Income' || t.type === 'Savings-Withdrawal') mIn += t.kes;
            if (t.type === 'Expense' || t.type === 'Savings-Deposit') mOut += t.kes;
        });
        rollover += (mIn - mOut);
    });
    return rollover;
};

window.changeMonth = function(delta) { currentDate.setMonth(currentDate.getMonth() + delta); window.updateUI(); };

window.updateUI = function() {
    try {
        const monthStr = window.getMonthStr(currentDate);
        const monthYear = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        document.getElementById('current-month-display').innerText = monthYear;
        document.getElementById('current-month-display-summaries').innerText = monthYear;

        const currentMonthTxs = transactions.filter(t => t.date && t.date.startsWith(monthStr));
        const rollover = window.calculateRollover(monthStr);

        let totalIncome = 0; let totalSavingsWithdrawn = 0; 
        let totalSpent = 0; let totalSaved = 0;

        let incomeTxs = currentMonthTxs.filter(t => t.type === 'Income');
        const groupedIncome = incomeTxs.reduce((acc, tx) => { acc[tx.category] = (acc[tx.category]||0) + tx.kes; return acc; }, {});
        totalIncome = Object.values(groupedIncome).reduce((a,b)=>a+b, 0);

        const incomeBody = document.getElementById('income-body'); if(incomeBody) incomeBody.innerHTML = '';
        if (rollover !== 0 && incomeBody) {
            incomeBody.innerHTML += `<tr><td>Rollover from Previous Months</td><td class="${rollover >= 0 ? 'positive' : 'negative'}">${rollover > 0 ? '+' : ''}${rollover.toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>`;
        }
        Object.keys(groupedIncome).forEach(cat => {
            if(incomeBody) incomeBody.innerHTML += `<tr><td><a class="ledger-link" onclick="window.openLedger('${cat.replace(/'/g, "\\'")}', '', true)">${window.getIcon(cat)} ${cat}</a></td><td class="positive">+${groupedIncome[cat].toLocaleString(undefined, {minimumFractionDigits: 2})}</td></tr>`;
        });
        const bliEl = document.getElementById('bottom-line-income');
        if(bliEl) bliEl.innerText = `KES ${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

        const perfBody = document.getElementById('performance-body'); if(perfBody) perfBody.innerHTML = '';
        const txBody = document.getElementById('transactions-body'); if(txBody) txBody.innerHTML = '';
        
        const catFilterEl = document.getElementById('summary-cat-filter'); const catFilter = catFilterEl ? catFilterEl.value : 'ALL';
        const spentFilterEl = document.getElementById('summary-spent-filter'); const spentFilter = spentFilterEl ? spentFilterEl.value : 'ALL';

        let itemsMap = {}; 
        Object.keys(categoryBudgets).forEach(bm => {
            if(bm <= monthStr && categoryBudgets[bm]) Object.keys(categoryBudgets[bm]).forEach(k => {
                let parts = k.split('::'); let cat = parts[0] || 'Uncategorized'; let name = parts[1] || '(General)';
                let bAmt = window.getBudget(cat, name, monthStr);
                let infType = categories.Savings.includes(cat) || customMem.Savings.includes(cat) || transactions.some(t => t.category === cat && t.type.includes('Savings')) ? 'Savings' : 'Expense';
                if(bAmt > 0) itemsMap[`${cat}::${name}`] = { cat: cat, name: name, type: infType, actual: 0 };
            });
        });
        
        currentMonthTxs.filter(t => t.type === 'Expense' || t.type === 'Savings-Deposit').forEach(t => {
            let k = `${t.category}::${t.name}`;
            if(!itemsMap[k]) itemsMap[k] = { cat: t.category, name: t.name, type: t.type === 'Savings-Deposit' ? 'Savings' : 'Expense', actual: 0 };
            itemsMap[k].actual += t.kes;
        });

        if (catFilterEl) {
            catFilterEl.innerHTML = '<option value="ALL">All Categories</option>';
            let distinctCats = [...new Set(Object.values(itemsMap).map(i => i.cat))].sort();
            distinctCats.forEach(c => catFilterEl.innerHTML += `<option value="${c}">${window.getIcon(c)} ${c}</option>`);
            catFilterEl.value = distinctCats.includes(catFilter) ? catFilter : 'ALL';
        }

        let tableBudget = 0; let tableSpent = 0;
        
        Object.values(itemsMap).sort((a,b) => {
            const cA = a.cat || ''; const cB = b.cat || '';
            const nA = a.name || ''; const nB = b.name || '';
            return cA.localeCompare(cB) || nA.localeCompare(nB);
        }).forEach(item => {
            let bAmt = window.getBudget(item.cat, item.name, monthStr);
            let aAmt = item.actual;

            if (catFilter !== 'ALL' && catFilter !== item.cat) return;
            if (spentFilter === 'ZERO' && aAmt !== 0) return;
            if (spentFilter === 'NON_ZERO' && aAmt === 0) return;
            if (spentFilter === 'UNDER_BUDGET' && (bAmt === 0 || aAmt >= bAmt)) return;

            tableBudget += bAmt; tableSpent += aAmt;

            let variance = bAmt - aAmt; let isPositive = variance >= 0;
            const varPct = bAmt ? ((variance / bAmt) * 100).toFixed(1) : 0;

            const trHtml = `
                <tr>
                    <td>${window.getIcon(item.cat)} ${item.cat}</td>
                    <td><a class="ledger-link" onclick="window.openLedger('${item.cat.replace(/'/g, "\\'")}', '${item.name.replace(/'/g, "\\'")}', false)">${item.name === '(General)' ? 'Category Target' : item.name}</a></td>
                    <td><span style="background:var(--border); padding:2px 8px; border-radius:10px; font-size:0.8em; color:var(--primary);">${item.type}</span></td>
                    <td>${bAmt.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td>${aAmt.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td class="${isPositive ? 'positive' : 'negative'}">${variance > 0 ? '+':''}${variance.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    <td class="${isPositive ? 'positive' : 'negative'}">${varPct}%</td>
                </tr>
            `;
            if(perfBody) perfBody.innerHTML += trHtml;
        });

        let logTxs = currentMonthTxs.filter(t => t.type !== 'Starting-Balance');
        if(catFilter !== 'ALL') logTxs = logTxs.filter(t => t.category === catFilter);
        
        logTxs.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
            let isInc = tx.type === 'Income' || tx.type === 'Savings-Withdrawal';
            let isSav = tx.type.includes('Savings');
            let typeColor = isInc ? 'var(--success)' : (isSav ? '#3b82f6' : 'var(--primary)');
            let typeBg = isInc ? 'rgba(16,185,129,0.2)' : (isSav ? 'rgba(59,130,246,0.2)' : 'var(--border)');
            let displayType = tx.type.replace('Savings-', '');

            if (txBody) {
                txBody.innerHTML += `
                    <tr>
                        <td style="font-size: 0.9em; color:var(--text-muted);">${tx.date}</td>
                        <td>${window.getIcon(tx.category)} ${tx.category}</td>
                        <td><span class="ledger-link" onclick="window.openEditModal(${tx.id})">${tx.name}</span></td>
                        <td><span style="background:${typeBg}; padding:2px 8px; border-radius:10px; font-size:0.8em; color:${typeColor};">${displayType}</span></td>
                        <td class="${isInc ? 'positive' : ''}" style="font-weight: bold;">${isInc ? '+':''}${tx.kes.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    </tr>
                `;
            }
        });

        let netVar = tableBudget - tableSpent;
        const perfBudg = document.getElementById('perf-bottom-line-budget');
        if(perfBudg) perfBudg.innerText = tableBudget.toLocaleString(undefined, {minimumFractionDigits: 2});
        
        const perfAct = document.getElementById('perf-bottom-line-actual');
        if(perfAct) perfAct.innerText = tableSpent.toLocaleString(undefined, {minimumFractionDigits: 2});
        
        const varStr = `${netVar >= 0 ? '+':''}${netVar.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        const varClass = netVar >= 0 ? 'positive' : 'negative';
        const perfVar = document.getElementById('perf-bottom-line-variance');
        if(perfVar) { perfVar.innerText = varStr; perfVar.className = varClass; }

        let rawTotalBudget = 0;
        Object.values(itemsMap).forEach(item => { rawTotalBudget += window.getBudget(item.cat, item.name, monthStr); });

        currentMonthTxs.forEach(t => {
            if (t.type === 'Savings-Withdrawal') totalSavingsWithdrawn += t.kes;
            if (t.type === 'Expense') totalSpent += t.kes;
            if (t.type === 'Savings-Deposit') totalSaved += t.kes;
        });

        let totalAvailable = totalIncome + rollover + totalSavingsWithdrawn;
        let actualOutgoing = totalSpent + totalSaved;
        let surplusDeficit = rawTotalBudget - actualOutgoing; 
        let amountUnassigned = totalAvailable - actualOutgoing; 
        
        document.getElementById('top-income').innerText = `KES ${(totalIncome + rollover).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('top-rollover-text').innerText = `Includes ${rollover >= 0 ? '+':''}${rollover.toLocaleString(undefined, {minimumFractionDigits: 2})} rollover`;
        document.getElementById('top-budget').innerText = `KES ${rawTotalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('top-spent').innerText = `KES ${actualOutgoing.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        
        document.getElementById('top-surplus').innerText = `KES ${surplusDeficit >= 0 ? '+':''}${surplusDeficit.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        document.getElementById('top-surplus').className = `value ${surplusDeficit >= 0 ? 'positive' : 'negative'}`;

        const topUnassignedEl = document.getElementById('top-unassigned');
        if (topUnassignedEl) {
            topUnassignedEl.innerText = `KES ${amountUnassigned >= 0 ? '+':''}${amountUnassigned.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
            topUnassignedEl.className = `value ${amountUnassigned >= 0 ? 'positive' : 'negative'}`;
        }
        
        window.updatePortfolioView(currentMonthTxs, monthStr);
    } catch (e) {
        console.error("UI Update Error:", e);
    }
};

window.updatePortfolioView = function(currentMonthTxs, monthStr) {
    const tbody = document.getElementById('portfolio-body'); tbody.innerHTML = '';
    
    let activePortCats = new Set([...customMem.Savings]);
    transactions.filter(t => t.type.includes('Savings') || t.type === 'Starting-Balance').forEach(t => activePortCats.add(t.category));
    
    let grandStart = 0; let grandInflow = 0; let grandCurrent = 0;

    Array.from(activePortCats).sort().forEach(cat => {
        let startBal = 0; let mtdInflow = 0; let prevInflows = 0;
        
        transactions.filter(t => t.category === cat).forEach(t => {
            if (t.type === 'Starting-Balance') {
                startBal += t.kes;
            } else if (t.date.substring(0,7) < monthStr) {
                if (t.type === 'Savings-Deposit') prevInflows += t.kes;
                if (t.type === 'Savings-Withdrawal') prevInflows -= t.kes;
            } else if (t.date.startsWith(monthStr)) {
                if (t.type === 'Savings-Deposit') mtdInflow += t.kes;
                if (t.type === 'Savings-Withdrawal') mtdInflow -= t.kes;
            }
        });
        
        const currentTotal = startBal + prevInflows + mtdInflow;
        grandStart += startBal; grandInflow += mtdInflow; grandCurrent += currentTotal;
        tbody.innerHTML += `
            <tr>
                <td><span style="color:var(--accent)">${window.getIcon(cat)}</span> ${cat}</td>
                <td>${startBal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td class="${mtdInflow >= 0 ? 'positive' : 'negative'}">${mtdInflow > 0 ? '+' : ''}${mtdInflow.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="font-weight:800; color:var(--primary);">KES ${currentTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                <td style="text-align: center;"><button type="button" style="background:var(--danger); color:#fff; border:none; padding:4px 8px; border-radius:6px; cursor:pointer;" onclick="window.deletePortfolioAccount('${cat.replace(/'/g, "\\'")}')">Del</button></td>
            </tr>`;
    });

    document.getElementById('port-total-start').innerText = grandStart.toLocaleString(undefined, {minimumFractionDigits: 2});
    
    const totInflowsEl = document.getElementById('port-total-inflows');
    totInflowsEl.innerText = `${grandInflow > 0 ? '+' : ''}${grandInflow.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    totInflowsEl.className = grandInflow >= 0 ? 'positive' : 'negative';

    document.getElementById('port-total-current').innerText = 'KES ' + grandCurrent.toLocaleString(undefined, {minimumFractionDigits: 2});

    const ledgerBody = document.getElementById('portfolio-ledger-body');
    if(ledgerBody) {
        ledgerBody.innerHTML = '';
        let savTxs = transactions.filter(t => t.type === 'Starting-Balance' || (t.date && t.date.startsWith(monthStr) && t.type.includes('Savings')));
        
        if (savTxs.length === 0) {
            ledgerBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No portfolio movements found.</td></tr>`;
        } else {
            savTxs.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
                let isStart = tx.type === 'Starting-Balance'; let isDep = tx.type === 'Savings-Deposit';
                let badgeColor = isStart ? 'var(--primary)' : (isDep ? 'var(--success)' : 'var(--danger)');
                let badgeBg = isStart ? 'var(--border)' : (isDep ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)');
                let text = isStart ? 'Start Bal' : (isDep ? 'Deposit' : 'Withdrawal');
                let actionBadge = `<span style="background:${badgeBg}; padding:2px 8px; border-radius:10px; font-size:0.8em; color:${badgeColor};">${text}</span>`;
                
                ledgerBody.innerHTML += `
                    <tr>
                        <td style="font-size: 0.9em; color:var(--text-muted);">${tx.date}</td>
                        <td>${window.getIcon(tx.category)} ${tx.category}</td>
                        <td><span class="ledger-link" onclick="window.openEditModal(${tx.id})">${tx.name}</span></td>
                        <td>${actionBadge}</td>
                        <td class="${!isStart && isDep ? 'positive' : ''}" style="font-weight: bold;">${!isStart && isDep ? '+':''}${tx.kes.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    </tr>
                `;
            });
        }
    }
};

window.deletePortfolioAccount = function(cat) {
    if(!confirm(`Are you sure you want to completely delete the account "${cat}"?\n\nThis will erase ALL deposits, withdrawals, and opening balances tied to it.`)) return;
    if(!confirm(`Final warning: Deleting "${cat}" cannot be undone. Proceed?`)) return;

    window.saveState();
    transactions = transactions.filter(t => !(t.category === cat && (t.type === 'Starting-Balance' || t.type.includes('Savings'))));
    
    if(customMem.Savings && customMem.Savings.includes(cat)) {
        customMem.Savings = customMem.Savings.filter(c => c !== cat);
        localStorage.setItem('suppa_custom_mem', JSON.stringify(customMem));
    }
    window.saveData(); window.updateDatalists(); window.updateUI(); window.updateCharts(); window.updateInflationChart();
};

window.populateChartFilters = function(txs) {
    const catFilter = document.getElementById('analytics-cat-filter');
    const nameFilter = document.getElementById('analytics-name-filter');
    const infNameFilter = document.getElementById('inflation-expense-filter');
    const currCat = catFilter.value; const currName = nameFilter.value; const currInfName = infNameFilter.value;
    
    catFilter.innerHTML = '<option value="ALL">All Categories</option>';
    nameFilter.innerHTML = '<option value="ALL">All Expenses</option>';
    infNameFilter.innerHTML = '<option value="ALL">All Expenses Combined</option>';
    
    let cats = [...new Set(txs.map(e => e.category))].sort();
    cats.forEach(c => catFilter.innerHTML += `<option value="${c}">${window.getIcon(c)} ${c}</option>`);
    catFilter.value = cats.includes(currCat) ? currCat : 'ALL';
    
    let filteredForNames = txs;
    if(catFilter.value !== 'ALL') filteredForNames = txs.filter(e => e.category === catFilter.value);
    
    let names = [...new Set(filteredForNames.map(e => e.name))].sort();
    names.forEach(n => nameFilter.innerHTML += `<option value="${n}">${n}</option>`);
    nameFilter.value = names.includes(currName) ? currName : 'ALL';

    let allNames = [...new Set(txs.map(e => e.name))].sort();
    allNames.forEach(n => infNameFilter.innerHTML += `<option value="${n}">${n}</option>`);
    infNameFilter.value = allNames.includes(currInfName) ? currInfName : 'ALL';
};

window.updateAnalytics = function() {
    const period = document.getElementById('analytics-period').value;
    const now = new Date();
    const filteredTxs = transactions.filter(t => {
        if(!t.date) return false;
        const d = new Date(t.date);
        if(period === 'MTD') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        if(period === 'YTD') return d.getFullYear() === now.getFullYear();
        if(period === 'QTD') return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth()/3) === Math.floor(now.getMonth()/3);
        return true;
    });
    
    window.populateChartFilters(transactions.filter(t => t.type === 'Expense' || t.type === 'Savings-Deposit')); 
    window.updateCharts(filteredTxs); window.updateInflationChart();
};

window.updateCharts = function(txList = null) {
    try {
        if(!document.getElementById('analytics').classList.contains('active')) return;
        if(!txList) {
            const period = document.getElementById('analytics-period').value;
            const now = new Date();
            txList = transactions.filter(t => {
                if(!t.date) return false;
                const d = new Date(t.date);
                if(period === 'MTD') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                if(period === 'YTD') return d.getFullYear() === now.getFullYear();
                if(period === 'QTD') return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth()/3) === Math.floor(now.getMonth()/3);
                return true;
            });
        }

        const catFilter = document.getElementById('analytics-cat-filter').value;
        const nameFilter = document.getElementById('analytics-name-filter').value;

        let expenses = txList.filter(t => t.type === 'Expense' || t.type === 'Savings-Deposit');
        
        const income = txList.filter(t => t.type === 'Income').reduce((s,t)=>s+t.kes, 0);
        const savingsTotal = txList.filter(t => t.type === 'Savings-Deposit').reduce((s,t)=>s+t.kes, 0);
        const targetPct = income ? ((savingsTotal / income) * 100).toFixed(1) : 0;
        document.getElementById('stat-target').innerText = `${targetPct}%`;
        document.getElementById('stat-target').className = targetPct >= 30 ? 'value positive' : 'value negative';

        const thirtyDaysAgo = new Date().setDate(new Date().getDate() - 30);
        const sixtyDaysAgo = new Date().setDate(new Date().getDate() - 60);
        const currentExp = transactions.filter(t => t.date && new Date(t.date) >= thirtyDaysAgo && t.type === 'Expense').reduce((s,t)=>s+t.kes,0);
        const prevExp = transactions.filter(t => t.date && new Date(t.date) >= sixtyDaysAgo && new Date(t.date) < thirtyDaysAgo && t.type === 'Expense').reduce((s,t)=>s+t.kes,0);
        const inflation = prevExp ? (((currentExp - prevExp) / prevExp) * 100).toFixed(1) : 0;
        document.getElementById('stat-inflation').innerText = `${inflation > 0 ? '+':''}${inflation}%`;
        document.getElementById('stat-inflation').className = inflation <= 0 ? 'value positive' : 'value negative';

        let chartExpenses = expenses;
        if(catFilter !== 'ALL') chartExpenses = chartExpenses.filter(e => e.category === catFilter);
        if(nameFilter !== 'ALL') chartExpenses = chartExpenses.filter(e => e.name === nameFilter);

        window.drawCharts(chartExpenses, catFilter, nameFilter);
    } catch(e) { console.error("Chart Error", e); }
};

window.drawCharts = function(expenses, catFilter, nameFilter) {
    const ctxPie = document.getElementById('pieChart').getContext('2d');
    const ctxBar = document.getElementById('barChart').getContext('2d');
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim();
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    Chart.defaults.color = textColor; Chart.defaults.borderColor = isDark ? '#14281f' : '#d1fae5';

    const pieData = expenses.filter(t => t.kes > 0).reduce((acc, tx) => {
        let key = catFilter === 'ALL' ? tx.category : tx.name;
        if(catFilter === 'ALL') key = `${window.getIcon(key)} ${key}`;
        acc[key] = (acc[key] || 0) + tx.kes; return acc;
    }, {});

    const totalAmount = Object.values(pieData).reduce((a,b) => a+b, 0);
    const pieLabels = Object.keys(pieData).map(k => {
        let pct = totalAmount > 0 ? ((pieData[k] / totalAmount) * 100).toFixed(1) : 0;
        return `${k} (${pct}%)`;
    });

    if(pieChartInstance) pieChartInstance.destroy();
    pieChartInstance = new Chart(ctxPie, {
        type: 'doughnut',
        data: { labels: pieLabels, datasets: [{ data: Object.values(pieData), backgroundColor: chartColors, borderWidth: 1, borderColor: isDark ? '#0a120e' : '#fff' }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: textColor, font: {size: 11}, boxWidth: 12 } }, tooltip: { callbacks: { label: function(context) { let val = context.raw || 0; return `KES ${val.toLocaleString()}`; } } } } }
    });

    const monthlyData = {};
    expenses.forEach(t => {
        const m = t.date.substring(0,7);
        if(!monthlyData[m]) monthlyData[m] = { budget: 0, actual: 0 };
        monthlyData[m].actual += t.kes;
    });

    Object.keys(monthlyData).forEach(m => {
        let mBudget = 0; let items = new Set();
        Object.keys(categoryBudgets).forEach(bm => {
            if(bm <= m && categoryBudgets[bm]) Object.keys(categoryBudgets[bm]).forEach(k => items.add(k));
        });
        transactions.filter(t => t.date && t.date.startsWith(m) && (t.type === 'Expense' || t.type === 'Savings-Deposit')).forEach(t => items.add(`${t.category}::${t.name}`));
        
        items.forEach(k => {
            let parts = k.split('::'); let c = parts[0]; let n = parts[1];
            if (catFilter === 'ALL' || catFilter === c) {
                if (nameFilter === 'ALL' || nameFilter === n) { mBudget += window.getBudget(c, n, m); }
            }
        });
        monthlyData[m].budget = mBudget;
    });

    const sortedMonths = Object.keys(monthlyData).sort();

    if(barChartInstance) barChartInstance.destroy();
    barChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: sortedMonths,
            datasets: [
                { label: 'Budgeted', data: sortedMonths.map(m => monthlyData[m].budget), backgroundColor: '#a7f3d0', borderRadius: 4 },
                { label: 'Actual Spent', data: sortedMonths.map(m => monthlyData[m].actual), backgroundColor: '#059669', borderRadius: 4 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } }, plugins: { legend: { position: 'bottom', labels: { color: textColor, font: {size: 11}, boxWidth: 12 } } } }
    });
};

window.updateInflationChart = function() {
    try {
        if(!document.getElementById('analytics').classList.contains('active')) return;
        const interval = document.getElementById('inflation-interval').value;
        const nameFilter = document.getElementById('inflation-expense-filter').value;

        let data = transactions.filter(t => t.date && t.type === 'Expense');
        if (nameFilter !== 'ALL') data = data.filter(t => t.name === nameFilter);

        const isDark = document.body.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#a7f3d0' : '#475569';
        const bucketedData = {};

        const now = new Date();
        data.forEach(t => {
            const d = new Date(t.date);
            const y = d.getFullYear(); const m = d.getMonth();
            
            if(interval === 'MTD' && d.getDate() > now.getDate()) return;
            if(interval === 'QTD' && ((m%3) > (now.getMonth()%3) || ((m%3) === (now.getMonth()%3) && d.getDate() > now.getDate()))) return;
            if(interval === 'YTD' && (m > now.getMonth() || (m === now.getMonth() && d.getDate() > now.getDate()))) return;

            let key = "";
            if(interval === 'Monthly' || interval === 'MTD') key = `${y}-${String(m+1).padStart(2,'0')}`;
            else if (interval === 'Quarterly' || interval === 'QTD') key = `${y}-Q${Math.floor(m/3)+1}`;
            else if (interval === 'Half-Year') key = `${y}-H${Math.floor(m/6)+1}`;
            else if (interval === 'Yearly' || interval === 'YTD') key = `${y}`;
            bucketedData[key] = (bucketedData[key] || 0) + t.kes;
        });

        const sortedKeys = Object.keys(bucketedData).sort();
        const inflationData = []; const chartLabels = [];

        for(let i = 0; i < sortedKeys.length; i++) {
            const currentPeriod = sortedKeys[i];
            const currentVal = bucketedData[currentPeriod];
            chartLabels.push(currentPeriod);
            if (i === 0) { inflationData.push(0); } else {
                const prevVal = bucketedData[sortedKeys[i-1]];
                if (prevVal === 0) inflationData.push(currentVal > 0 ? 100 : 0);
                else inflationData.push(parseFloat((((currentVal - prevVal) / prevVal) * 100).toFixed(2)));
            }
        }

        const ctxInf = document.getElementById('inflationChart').getContext('2d');
        if(inflationChartInstance) inflationChartInstance.destroy();
        
        inflationChartInstance = new Chart(ctxInf, {
            type: 'line',
            data: { labels: chartLabels, datasets: [{ label: 'Inflation / Growth %', data: inflationData, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.2)', fill: true, tension: 0.3, pointBackgroundColor: '#d97706', pointRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: textColor } } }, scales: { y: { title: { display: true, text: 'Growth Percentage (%)', color: textColor }, grid: { color: isDark ? '#14281f' : '#d1fae5' } }, x: { grid: { color: isDark ? '#14281f' : '#d1fae5' } } } }
        });
    } catch(e) { console.error("Inflation Chart Error:", e); }
};

window.fetchAIInsights = async function() {
    const btn = document.getElementById('ai-insight-btn');
    const container = document.getElementById('ai-insight-container');
    
    btn.innerText = "Analyzing... 🧠";
    btn.disabled = true;
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted);">Fetching your personalized insights... this takes about 5 seconds.</div>`;

    try {
        const response = await fetch('/.netlify/functions/get-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: transactions })
        });
        
        const result = await response.json();
        if(result.success) {
            let htmlOutput = result.insights.replace(/\n\*/g, '<br>•');
            htmlOutput = htmlOutput.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            container.innerHTML = htmlOutput;
        } else {
            throw new Error(result.message || "Failed to load");
        }
    } catch (error) {
        console.error("AI Fetch Error:", error);
        container.innerHTML = `<span style="color:var(--danger); font-weight:bold;">Error fetching insights. Please check your internet connection or verify your GEMINI_API_KEY in Netlify.</span>`;
    } finally {
        btn.innerText = "Refresh Advice ✨";
        btn.disabled = false;
    }
};

window.undo = function() { if (historyStack.length === 0) return alert("Nothing to undo!"); redoStack.push(JSON.stringify(transactions)); transactions = JSON.parse(historyStack.pop()); window.saveData(); window.updateDatalists(); window.updateUI(); window.updateCharts(); window.updateInflationChart(); };
window.redo = function() { if (redoStack.length === 0) return alert("Nothing to redo!"); historyStack.push(JSON.stringify(transactions)); transactions = JSON.parse(redoStack.pop()); window.saveData(); window.updateDatalists(); window.updateUI(); window.updateCharts(); window.updateInflationChart(); };
window.saveState = function() { historyStack.push(JSON.stringify(transactions)); redoStack = []; if (historyStack.length > 20) historyStack.shift(); };
window.saveData = function() { localStorage.setItem('suppa_tx', JSON.stringify(transactions)); };

window.resetData = function() {
    if(confirm("⚠ DANGER: This will wipe ALL transactions, budgets, and portfolio history. Are you entirely sure?")) {
        if(confirm("Final confirmation: Type 'YES' to proceed.")) {
            localStorage.clear(); transactions = []; categoryBudgets = {}; 
            customMem = { Expense: [], Income: [], Savings: [], Names: [], Icons: {} };
            window.updateDatalists(); window.updateUI();
        }
    }
};

window.exportCSV = function() {
    if(transactions.length === 0 && customMem.Savings.length === 0) return alert("No transaction data to export!");
    let csvContent = "ID,Name,Type,Category,Date,Actual_Amount,Quantity,FX_Rate,Total_KES,Notes\n";
    transactions.forEach(t => { csvContent += `${t.id},"${t.name}",${t.type},"${t.category}",${t.date},${t.actual},${t.qty},${t.fx},${t.kes},"${(t.notes||'').replace(/"/g, '""')}"\n`; });
    customMem.Savings.forEach((cat, index) => {
        if (!transactions.some(t => t.category === cat && (t.type === 'Starting-Balance' || t.type.includes('Savings')))) {
            csvContent += `${Date.now() + 1000 + index},"Initial Balance","Starting-Balance","${cat}","2020-01-01",0,1,1,0,"Auto-migrated empty account"\n`;
        }
    });
    window.triggerDownload(csvContent, `Suppa_Transactions_Backup_${new Date().toISOString().split('T')[0]}.csv`);
};

window.exportBudgetCSV = function() {
    if(Object.keys(categoryBudgets).length === 0) return alert("No budget data to export!");
    let csvContent = "Month,Category,Expense_Name,Budget_Amount\n";
    Object.keys(categoryBudgets).sort().forEach(month => {
        Object.keys(categoryBudgets[month]).forEach(key => {
            let parts = key.split('::'); let amt = categoryBudgets[month][key];
            if(amt > 0) csvContent += `${month},"${parts[0]}","${parts[1]}",${amt}\n`;
        });
    });
    window.triggerDownload(csvContent, `Suppa_Budgets_Backup_${new Date().toISOString().split('T')[0]}.csv`);
};

window.triggerDownload = function(content, fileName) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.setAttribute("download", fileName);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
};

window.exportTableToExcel = function(tableID, filename = ''){
    var tableSelect = document.getElementById(tableID);
    var wb = XLSX.utils.table_to_book(tableSelect, {sheet:"Sheet1", raw: true});
    XLSX.writeFile(wb, filename+".xlsx");
};

window.importCSV = function(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        const rows = evt.target.result.split('\n'); window.saveState();
        rows.forEach((row, i) => {
            if(i === 0 || !row.trim()) return; 
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/(^"|"$)/g, '').trim());
            if(cols.length >= 10 && cols[0] !== 'ID') {
                let newId = parseInt(cols[0]);
                if(!transactions.some(t => t.id === newId)) {
                    let importedTx = {
                        id: newId || Date.now() + i, name: cols[1] || '(General)', type: cols[2], category: cols[3], date: cols[4],
                        actual: parseFloat(cols[5]) || 0, qty: parseFloat(cols[6]) || 1, fx: parseFloat(cols[7]) || 1, kes: parseFloat(cols[8]) || 0, notes: cols[9] || ""
                    };
                    transactions.push(importedTx);
                    window.addToMemory(importedTx.type, importedTx.category, importedTx.name, null);
                }
            }
        });
        window.saveData(); window.updateDatalists(); window.updateUI(); alert("Transactions & Portfolio CSV Imported Successfully!"); e.target.value = '';
    };
    reader.readAsText(file);
};

window.importBudgetCSV = function(e) {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        const rows = evt.target.result.split('\n');
        rows.forEach((row, i) => {
            if(i === 0 || !row.trim()) return; 
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.replace(/(^"|"$)/g, '').trim());
            if(cols.length >= 4 && cols[0].match(/^\d{4}-\d{2}$/)) {
                if(!categoryBudgets[cols[0]]) categoryBudgets[cols[0]] = {};
                categoryBudgets[cols[0]][`${cols[1]}::${cols[2]}`] = parseFloat(cols[3]) || 0;
            }
        });
        localStorage.setItem('suppa_budgets_v2', JSON.stringify(categoryBudgets));
        window.updateUI(); window.renderBudgetSetup(); alert("Budgets CSV Imported Successfully!"); e.target.value = '';
    };
    reader.readAsText(file);
};


// ==========================================
// 4. EVENT LISTENERS (Only runs after page loads)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Load Data
    window.repairAndLoadData();
    window.initTheme();
    window.initializeApp();

    // Setup initial dates
    const dateInput = document.getElementById('tx-date');
    if(dateInput) dateInput.valueAsDate = new Date();
    
    const monthPicker = document.getElementById('budget-month-picker');
    if(monthPicker) monthPicker.value = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2, '0')}`;
    
    // Initial Render
    window.handleTypeChange('tx');
    window.updateDatalists();
    window.updateUI();

    // Profile Dropdowns
    const setupProfileDropdown = (triggerId, dropdownId) => {
        const trigger = document.getElementById(triggerId);
        const dropdown = document.getElementById(dropdownId);
        if (trigger && dropdown) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation(); 
                dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
            });
            document.addEventListener('click', (e) => {
                if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.style.display = 'none';
                }
            });
        }
    };
    setupProfileDropdown('profileTrigger', 'profileDropdown');
    setupProfileDropdown('appProfileTrigger', 'appProfileDropdown');

    // Pay Button
    const payButton = document.getElementById('payButton');
    if (payButton) {
        payButton.addEventListener('click', async () => {
            const phoneInput = document.getElementById('phoneInput');
            const paymentStatus = document.getElementById('paymentStatus');
            const phone = phoneInput ? phoneInput.value.trim() : '';
            
            if (!phone || phone.length < 9) { alert("Please enter a valid M-Pesa phone number."); return; }

            payButton.disabled = true; payButton.textContent = "Processing...";
            if (paymentStatus) { paymentStatus.textContent = "Contacting M-Pesa... please wait."; paymentStatus.style.color = "blue"; }

            try {
                const response = await fetch('/.netlify/functions/initiate-tuma', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: phone, userId: currentUser.id, amount: 1700 })
                });
                
                const result = await response.json();

                if (response.ok && result.success) {
                    if (paymentStatus) { paymentStatus.textContent = "Prompt sent! Enter your PIN on your phone."; paymentStatus.style.color = "orange"; }
                    window.startPollingDatabase(); 
                } else {
                    throw new Error(result.message || "Payment failed to initiate.");
                }
            } catch (error) {
                console.error("Payment error:", error);
                if (paymentStatus) { paymentStatus.textContent = "Error: " + error.message; paymentStatus.style.color = "red"; }
                payButton.disabled = false; payButton.textContent = "Pay to Unlock";
            }
        });
    }

    // Auto-fill forms
    const txNameEl = document.getElementById('tx-name');
    if(txNameEl) {
        txNameEl.addEventListener('input', function(e) {
            let val = e.target.value.trim().toLowerCase();
            if(!val) return;
            let match = transactions.slice().reverse().find(t => t.name.toLowerCase() === val);
            if (match) {
                if(match.type.includes('Savings') || match.type === 'Starting-Balance') {
                    document.getElementById('tx-type').value = 'Savings';
                    window.handleTypeChange('tx');
                    document.getElementById('tx-savings-action').value = match.type;
                } else {
                    document.getElementById('tx-type').value = match.type;
                    window.handleTypeChange('tx');
                }
                document.getElementById('tx-category').value = match.category;
                window.autoSelectIcon('tx');
            }
        });
    }

    const budgetNameEl = document.getElementById('budget-name');
    if(budgetNameEl) {
        budgetNameEl.addEventListener('input', function(e) {
            let val = e.target.value.trim().toLowerCase();
            if(!val) return;
            let match = transactions.slice().reverse().find(t => t.name.toLowerCase() === val && t.type !== 'Income' && t.type !== 'Savings-Withdrawal' && t.type !== 'Starting-Balance');
            if (match) document.getElementById('budget-category').value = match.category;
        });
    }

    // M-Pesa Auto-Paste
    const pasteBox = document.getElementById('mpesa-paste-box');
    if (pasteBox) {
        pasteBox.addEventListener('input', function(e) {
            const sms = e.target.value.trim();
            if (!sms) return;
            
            const amountMatch = sms.match(/Ksh([\d,]+\.\d{2})/);
            const paidToMatch = sms.match(/paid to (.*?)(?=\. on)/) || sms.match(/paid to (.*?)(?= on)/);
            const dateMatch = sms.match(/on (\d{1,2}\/\d{1,2}\/\d{2})/);
            const costMatch = sms.match(/Transaction cost, Ksh([\d,]+\.\d{2})/);

            if (amountMatch) {
                const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
                document.getElementById('tx-actual').value = amount;
                
                if (paidToMatch) {
                    const vendor = paidToMatch[1].trim();
                    document.getElementById('tx-name').value = vendor;
                    
                    const vLower = vendor.toLowerCase();
                    if (vLower.includes('java') || vLower.includes('kfc') || vLower.includes('naivas') || vLower.includes('quickmart')) {
                        document.getElementById('tx-category').value = 'Food';
                    } else if (vLower.includes('uber') || vLower.includes('bolt') || vLower.includes('fuel')) {
                        document.getElementById('tx-category').value = 'Transport';
                    }
                    window.autoSelectIcon('tx');
                }

                if (dateMatch) {
                    const parts = dateMatch[1].split('/');
                    const year = "20" + parts[2];
                    const month = parts[1].padStart(2, '0');
                    const day = parts[0].padStart(2, '0');
                    document.getElementById('tx-date').value = `${year}-${month}-${day}`;
                }
                
                window.calcKES('tx');
                setTimeout(() => e.target.value = '', 500);
                
                if (costMatch) {
                    const txCost = parseFloat(costMatch[1].replace(/,/g, ''));
                    if(txCost > 0 && confirm(`Also log KES ${txCost} as a Transaction Cost?`)) {
                        transactions.push({
                            id: Date.now() + 1, name: 'M-Pesa Fee', type: 'Expense', category: 'Transaction Cost',
                            date: document.getElementById('tx-date').value, actual: txCost, qty: 1, fx: 1, kes: txCost, notes: 'Auto-extracted'
                        });
                        window.saveData(); window.updateDatalists(); window.updateUI();
                    }
                }
            }
        });
    }

    // Service Worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Error:', err)); });
    }
});
