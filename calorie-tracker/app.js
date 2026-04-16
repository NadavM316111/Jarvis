// State
let state = {
    entries: [],
    dailyGoal: 2000,
    macroGoals: {
        protein: 150,
        carbs: 250,
        fats: 65
    }
};

// Load from localStorage
function loadState() {
    const saved = localStorage.getItem('fuelTracker');
    if (saved) {
        const parsed = JSON.parse(saved);
        // Check if it's a new day
        const today = new Date().toDateString();
        if (parsed.lastDate !== today) {
            parsed.entries = [];
            parsed.lastDate = today;
        }
        state = { ...state, ...parsed };
    }
    document.getElementById('dailyGoal').value = state.dailyGoal;
}

// Save to localStorage
function saveState() {
    state.lastDate = new Date().toDateString();
    localStorage.setItem('fuelTracker', JSON.stringify(state));
}

// Update date display
function updateDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = now.toLocaleDateString('en-US', options).toUpperCase();
}

// Calculate totals
function getTotals() {
    return state.entries.reduce((acc, entry) => ({
        calories: acc.calories + entry.calories,
        protein: acc.protein + entry.protein,
        carbs: acc.carbs + entry.carbs,
        fats: acc.fats + entry.fats
    }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
}

// Update UI
function updateUI() {
    const totals = getTotals();
    const remaining = Math.max(0, state.dailyGoal - totals.calories);
    const progress = Math.min(100, (totals.calories / state.dailyGoal) * 100);
    
    // Update calories display
    document.getElementById('caloriesConsumed').textContent = totals.calories;
    document.getElementById('caloriesRemaining').textContent = remaining + ' remaining';
    
    // Update progress ring
    const circumference = 2 * Math.PI * 85;
    const offset = circumference - (progress / 100) * circumference;
    document.getElementById('progressRing').style.strokeDashoffset = offset;
    
    // Update macros
    document.getElementById('proteinValue').textContent = totals.protein + 'g';
    document.getElementById('carbsValue').textContent = totals.carbs + 'g';
    document.getElementById('fatsValue').textContent = totals.fats + 'g';
    
    document.getElementById('proteinBar').style.width = Math.min(100, (totals.protein / state.macroGoals.protein) * 100) + '%';
    document.getElementById('carbsBar').style.width = Math.min(100, (totals.carbs / state.macroGoals.carbs) * 100) + '%';
    document.getElementById('fatsBar').style.width = Math.min(100, (totals.fats / state.macroGoals.fats) * 100) + '%';
    
    // Update food log
    renderFoodLog();
}

// Render food log
function renderFoodLog() {
    const log = document.getElementById('foodLog');
    
    if (state.entries.length === 0) {
        log.innerHTML = '<div class="empty-state"><div class="empty-icon">[ ]</div><p>No entries logged yet</p></div>';
        return;
    }
    
    log.innerHTML = state.entries.map((entry, index) => `
        <div class="food-entry">
            <div class="food-entry-info">
                <span class="food-entry-name">${entry.name}</span>
                <span class="food-entry-macros">P: ${entry.protein}g | C: ${entry.carbs}g | F: ${entry.fats}g</span>
            </div>
            <span class="food-entry-calories">${entry.calories}</span>
            <button class="food-entry-delete" onclick="deleteEntry(${index})">X</button>
        </div>
    `).reverse().join('');
}

// Add entry
function addEntry(name, calories, protein, carbs, fats) {
    state.entries.push({
        name: name || 'Food Item',
        calories: parseInt(calories) || 0,
        protein: parseInt(protein) || 0,
        carbs: parseInt(carbs) || 0,
        fats: parseInt(fats) || 0,
        timestamp: Date.now()
    });
    saveState();
    updateUI();
}

// Delete entry
function deleteEntry(index) {
    state.entries.splice(index, 1);
    saveState();
    updateUI();
}

// Event listeners
document.getElementById('addFood').addEventListener('click', () => {
    const name = document.getElementById('foodName').value;
    const calories = document.getElementById('calories').value;
    const protein = document.getElementById('protein').value;
    const carbs = document.getElementById('carbs').value;
    const fats = document.getElementById('fats').value;
    
    if (calories) {
        addEntry(name, calories, protein, carbs, fats);
        
        // Clear inputs
        document.getElementById('foodName').value = '';
        document.getElementById('calories').value = '';
        document.getElementById('protein').value = '';
        document.getElementById('carbs').value = '';
        document.getElementById('fats').value = '';
    }
});

// Enter key support
document.querySelectorAll('.cyber-input').forEach(input => {
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('addFood').click();
        }
    });
});

// Quick add buttons
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        addEntry(
            btn.dataset.name,
            btn.dataset.calories,
            btn.dataset.protein,
            btn.dataset.carbs,
            btn.dataset.fats
        );
    });
});

// Daily goal change
document.getElementById('dailyGoal').addEventListener('change', (e) => {
    state.dailyGoal = parseInt(e.target.value) || 2000;
    saveState();
    updateUI();
});

// Reset day
document.getElementById('resetDay').addEventListener('click', () => {
    if (confirm('Reset all entries for today?')) {
        state.entries = [];
        saveState();
        updateUI();
    }
});

// Initialize
loadState();
updateDate();
updateUI();

// Animate progress ring on load
setTimeout(() => {
    updateUI();
}, 100);