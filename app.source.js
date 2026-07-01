const infModeEl = document.getElementById('stat-inflation-filter');
        const infMode = infModeEl ? infModeEl.value : 'rolling';
        
        // We declare the variables exactly once here using 'let'
        let currentExp = 0, prevExp = 0, currentInc = 0, prevInc = 0;
        const now = new Date();

        if (infMode === 'rolling') {
            const thirtyDaysAgo = new Date().setDate(now.getDate() - 30);
            const sixtyDaysAgo = new Date().setDate(now.getDate() - 60);
            
            currentExp = transactions.filter(t => t.date && new Date(t.date) >= thirtyDaysAgo && t.type === 'Expense').reduce((s,t)=>s+t.kes,0);
            prevExp = transactions.filter(t => t.date && new Date(t.date) >= sixtyDaysAgo && new Date(t.date) < thirtyDaysAgo && t.type === 'Expense').reduce((s,t)=>s+t.kes,0);
            
            // We assign values to the existing variables without using 'const' again
            currentInc = transactions.filter(t => t.date && new Date(t.date) >= thirtyDaysAgo && t.type === 'Income').reduce((s,t)=>s+t.kes,0);
            prevInc = transactions.filter(t => t.date && new Date(t.date) >= sixtyDaysAgo && new Date(t.date) < thirtyDaysAgo && t.type === 'Income').reduce((s,t)=>s+t.kes,0);
        } else {
            const currMonthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}`;
            const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2, '0')}`;
            
            currentExp = transactions.filter(t => t.date && t.date.startsWith(currMonthStr) && t.type === 'Expense').reduce((s,t)=>s+t.kes,0);
            prevExp = transactions.filter(t => t.date && t.date.startsWith(prevMonthStr) && t.type === 'Expense').reduce((s,t)=>s+t.kes,0);
            
            currentInc = transactions.filter(t => t.date && t.date.startsWith(currMonthStr) && t.type === 'Income').reduce((s,t)=>s+t.kes,0);
            prevInc = transactions.filter(t => t.date && t.date.startsWith(prevMonthStr) && t.type === 'Income').reduce((s,t)=>s+t.kes,0);
        }

        const inflation = prevExp ? (((currentExp - prevExp) / prevExp) * 100).toFixed(1) : (currentExp > 0 ? 100 : 0);
        const siEl = document.getElementById('stat-inflation');
        if(siEl) {
            siEl.innerText = `${inflation > 0 ? '+':''}${inflation}%`;
            siEl.className = inflation <= 0 ? 'value positive' : 'value negative';
        }

        const incGrowth = prevInc ? (((currentInc - prevInc) / prevInc) * 100).toFixed(1) : (currentInc > 0 ? 100 : 0);
        const incEl = document.getElementById('stat-income-growth');
        if(incEl) {
            incEl.innerText = `${incGrowth > 0 ? '+':''}${incGrowth}%`;
            incEl.className = incGrowth >= 0 ? 'value positive' : 'value negative';
        }
