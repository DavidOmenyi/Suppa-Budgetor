// ==========================================
// 1. SUPABASE AUTH
// ==========================================
const supabaseUrl = 'https://ffzkpuiujxdqwjvmhrmx.supabase.co'; 
const supabaseKey = 'sb_publishable_yNJ1bJEdGV4Vpw_itRG1mA_XOBP8efu'; 
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;
let transactions = [];
let categoryBudgets = {}; 
let customMem = { Expense: [], Income: [], Savings: [], Names: [], Icons: {} };
let currentDate = new Date();

// ==========================================
// 2. EXPOSED GLOBAL FUNCTIONS (HTML Accessible)
// ==========================================

window.openLedger = function(cat, name, isIncome = false) {
    const monthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2, '0')}`;
    let txs = transactions.filter(t => t.date && t.date.substring(0,7) === monthStr);
    
    if (isIncome) {
        txs = txs.filter(t => t.type === 'Income' && t.category === cat);
        document.getElementById('ledger-title').innerText = `Income Ledger: ${cat} (${monthStr})`;
    } else {
        txs = txs.filter(t => (t.type === 'Expense' || t.type === 'Savings-Deposit') && t.category === cat && t.name === name);
        document.getElementById('ledger-title').innerText = `Ledger: ${name} (${monthStr})`;
    }
    
    const tbody = document.getElementById('ledger-body'); 
    tbody.innerHTML = '';
    
    txs.forEach(tx => {
        tbody.innerHTML += `
            <tr>
                <td>${tx.date}</td>
                <td>${tx.name}</td>
                <td style="font-weight:bold;">${tx.kes.toLocaleString()}</td>
                <td>${tx.notes || ''}</td>
                <td>
                    <button onclick="window.editTx(${tx.id})" style="background:var(--accent); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Edit</button>
                    <button onclick="window.deleteTxFromLedger(${tx.id})" style="background:var(--danger); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Del</button>
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
    if(!confirm("Delete this transaction?")) return;
    transactions = transactions.filter(t => t.id !== id);
    saveData(); updateUI();
    window.closeLedger();
};

window.fetchAIInsights = async function() {
    const btn = document.getElementById('ai-insight-btn');
    const container = document.getElementById('ai-insight-container');
    
    btn.innerText = "Analyzing... 🧠";
    btn.disabled = true;
    
    try {
        // Use a relative path to the Netlify function
        const response = await fetch('/.netlify/functions/get-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transactions: transactions })
        });
        
        const result = await response.json();
        if(result.success) {
            container.innerHTML = result.insights.replace(/\n/g, '<br>');
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        container.innerHTML = `<span style="color:var(--danger)">Error: ${error.message}. Check Netlify Functions logs.</span>`;
    } finally {
        btn.innerText = "Get AI Advice ✨";
        btn.disabled = false;
    }
};

// --- Data Persistence ---
function saveData() { localStorage.setItem('suppa_tx', JSON.stringify(transactions)); }
function saveState() { /* implementation */ }
function updateUI() { /* your existing UI logic */ }
// ... (Include all other necessary helper functions here)

// ==========================================
// 4. INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    repairAndLoadData();
    initializeApp();
    updateUI();
});
