console.log("🚀 LeadScout UI loaded successfully!");

// ===== DOM Elements =====
const form = document.getElementById('predictionForm');
const resultsCard = document.getElementById('resultsCard');
const resultEmpty = document.getElementById('resultEmpty');
const resultActive = document.getElementById('resultActive');
const validationMsg = document.getElementById('validationMessage');

const predictionValue = document.getElementById('predictionValue');
const recommendationValue = document.getElementById('recommendationValue');
const gaugeFill = document.getElementById('gaugeFill');
const gaugeThumb = document.getElementById('gaugeThumb');
const gaugeValue = document.getElementById('gaugeValue');
const probNo = document.getElementById('probNo');
const probYes = document.getElementById('probYes');
const resultMessage = document.getElementById('resultMessage');
const confidenceFill = document.getElementById('confidenceFill');
const confidenceValue = document.getElementById('confidenceValue');

// ===== Data Stores =====
let historyData = [];
let leadData = [];
let predictionCount = 0;

// ===== TAB SWITCHING =====
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = {
    predict: document.getElementById('tab-predict'),
    dashboard: document.getElementById('tab-dashboard'),
    analytics: document.getElementById('tab-analytics'),
    bulk: document.getElementById('tab-bulk'),
    leads: document.getElementById('tab-leads'),
    about: document.getElementById('tab-about'),
    ai: document.getElementById('tab-ai')  // ✅ ADD THIS
};

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tabId = btn.dataset.tab;
        Object.keys(tabContents).forEach(key => {
            tabContents[key].style.display = key === tabId ? 'block' : 'none';
        });

        if (tabId === 'dashboard') updateDashboard();
        if (tabId === 'analytics') updateAnalytics();
        if (tabId === 'leads') renderLeadTable();
    });
});

// ===== VALIDATION =====
function validateForm() {
    const required = ['age', 'balance', 'day', 'duration', 'campaign', 'pdays', 'previous'];
    let allFilled = true;

    required.forEach(id => {
        const el = document.getElementById(id);
        if (el && (!el.value || el.value === '')) {
            allFilled = false;
            el.style.borderColor = 'rgba(255,50,50,0.6)';
        } else if (el) {
            el.style.borderColor = '';
        }
    });

    return allFilled;
}

// ===== FORM SUBMIT =====
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    validationMsg.style.display = 'none';

    if (!validateForm()) {
        validationMsg.style.display = 'block';
        validationMsg.textContent = '⚠️ Please fill in all required fields before predicting.';
        return;
    }

    const submitBtn = document.getElementById('predictBtn');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="loading"></span> Analyzing...';
    submitBtn.disabled = true;

    try {
        const clientData = {
            age: parseInt(document.getElementById('age').value),
            job: document.getElementById('job').value,
            marital: document.getElementById('marital').value,
            education: document.getElementById('education').value,
            default: document.getElementById('default').value,
            balance: parseFloat(document.getElementById('balance').value),
            housing: document.getElementById('housing').value,
            loan: document.getElementById('loan').value,
            contact: document.getElementById('contact').value,
            day: parseInt(document.getElementById('day').value),
            month: document.getElementById('month').value,
            duration: parseInt(document.getElementById('duration').value),
            campaign: parseInt(document.getElementById('campaign').value),
            pdays: parseInt(document.getElementById('pdays').value),
            previous: parseInt(document.getElementById('previous').value),
            poutcome: document.getElementById('poutcome').value
        };

        const response = await fetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clientData)
        });

        const result = await response.json();

        if (response.ok) {
            displayResults(result, clientData);
        } else {
            showError(result.error || 'Something went wrong.');
        }

    } catch (error) {
        showError('Network error. Check if server is running.');
    } finally {
        submitBtn.innerHTML = originalHTML;
        submitBtn.disabled = false;
    }
});

// ===== DISPLAY RESULTS =====
function displayResults(result, clientData) {
    resultEmpty.style.display = 'none';
    resultActive.style.display = 'flex';

    const isYes = result.prediction === 'Yes';

    predictionValue.textContent = result.prediction;
    predictionValue.className = 'result-value ' + (isYes ? 'yes' : 'no');

    const isHigh = result.recommendation === 'High Priority';
    recommendationValue.textContent = result.recommendation;
    recommendationValue.className = 'result-value ' + (isHigh ? 'high' : 'low');

    const yesProb = Math.round(result.probability_yes);
    const noProb = Math.round(result.probability_no);

    gaugeFill.style.width = yesProb + '%';
    gaugeThumb.style.left = yesProb + '%';
    gaugeValue.textContent = yesProb + '%';

    probYes.textContent = yesProb + '%';
    probNo.textContent = noProb + '%';

    const message = result.message || (isYes ? '🎯 Call this client!' : '⏳ Skip this client');
    resultMessage.innerHTML = `<p>${message}</p>`;
    resultMessage.className = 'result-message ' + (isYes ? 'success' : 'fail');

    const confidence = Math.min(Math.round(Math.abs(yesProb - 50) * 2), 95);
    confidenceFill.style.width = confidence + '%';
    confidenceValue.textContent = confidence + '%';

    resultActive.style.animation = 'none';
    setTimeout(() => {
        resultActive.style.animation = 'fadeInUp 0.5s ease';
    }, 10);

    // Save to history
    if (clientData) {
        addToHistory(clientData, result);
    }
}

// ===== SHOW ERROR =====
function showError(message) {
    resultEmpty.style.display = 'none';
    resultActive.style.display = 'flex';

    predictionValue.textContent = 'Error';
    predictionValue.className = 'result-value no';
    recommendationValue.textContent = '—';
    recommendationValue.className = 'result-value';

    gaugeFill.style.width = '0%';
    gaugeThumb.style.left = '0%';
    gaugeValue.textContent = '0%';
    probYes.textContent = '0%';
    probNo.textContent = '0%';

    resultMessage.innerHTML = `<p>⚠️ ${message}</p>`;
    resultMessage.className = 'result-message fail';

    confidenceFill.style.width = '0%';
    confidenceValue.textContent = '0%';
}

// ===== HISTORY =====
function addToHistory(client, result) {
    const entry = {
        id: Date.now(),
        client: client,
        result: result,
        timestamp: new Date().toLocaleString(),
        confidence: Math.min(Math.round(Math.abs(result.probability_yes - 50) * 2), 95)
    };
    historyData.unshift(entry);
    leadData.unshift({
        id: Date.now(),
        job: client.job,
        age: client.age,
        balance: client.balance,
        education: client.education,
        prediction: result.prediction,
        confidence: entry.confidence,
        data: client,
        result: result,
        timestamp: entry.timestamp
    });
    predictionCount++;

    renderHistory();
    updateDashboard();
    updateAnalytics();
    renderLeadTable();
}

function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;

    if (historyData.length === 0) {
        container.innerHTML = '<p class="history-empty">No predictions yet.</p>';
        return;
    }

    container.innerHTML = historyData.slice(0, 20).map(item => `
        <div class="history-item">
            <div class="history-info">
                <span class="history-name">${item.client.job} · ${item.client.age} yrs</span>
                <span class="history-detail">₦${item.client.balance} · ${item.client.education}</span>
            </div>
            <div class="history-result">
                <span class="history-badge ${item.result.prediction.toLowerCase()}">${item.result.prediction}</span>
                <span class="history-time">${item.timestamp}</span>
            </div>
        </div>
    `).join('');
}

// ===== DASHBOARD =====
function updateDashboard() {
    const total = historyData.length;
    const high = historyData.filter(h => h.result.prediction === 'Yes').length;
    const low = total - high;
    const rate = total > 0 ? Math.round((high / total) * 100) : 0;

    document.getElementById('totalPredictions').textContent = total;
    document.getElementById('highPotential').textContent = high;
    document.getElementById('lowPriority').textContent = low;
    document.getElementById('conversionRate').textContent = rate + '%';
    document.getElementById('lastPrediction').textContent = total > 0 ? historyData[0].timestamp : '—';

    // Chart
    const maxVal = Math.max(high, low, 1);
    document.getElementById('chartHigh').style.height = Math.max((high / maxVal) * 80, 10) + '%';
    document.getElementById('chartLow').style.height = Math.max((low / maxVal) * 80, 10) + '%';
    document.getElementById('chartHighValue').textContent = high;
    document.getElementById('chartLowValue').textContent = low;

    // Activity
    const activityList = document.getElementById('activityList');
    if (historyData.length === 0) {
        activityList.innerHTML = '<p class="activity-empty">No recent activity</p>';
    } else {
        activityList.innerHTML = historyData.slice(0, 5).map(item => `
            <div class="activity-item">
                <span class="activity-text">${item.client.job} · ${item.result.prediction}</span>
                <span class="activity-time">${item.timestamp}</span>
            </div>
        `).join('');
    }
}

// ===== ANALYTICS =====
function updateAnalytics() {
    const total = historyData.length;
    const high = historyData.filter(h => h.result.prediction === 'Yes').length;
    const rate = total > 0 ? Math.round((high / total) * 100) : 0;
    const avgProb = total > 0 ? Math.round(historyData.reduce((sum, h) => sum + h.result.probability_yes, 0) / total) : 0;
    const avgConf = total > 0 ? Math.round(historyData.reduce((sum, h) => sum + (h.confidence || 50), 0) / total) : 0;

    document.getElementById('analyticsTotal').textContent = total;
    document.getElementById('analyticsHighRate').textContent = rate + '%';
    document.getElementById('analyticsConfidence').textContent = avgConf + '%';
    document.getElementById('analyticsAvgProb').textContent = avgProb + '%';

    // Job distribution
    const jobs = {};
    historyData.forEach(h => {
        const job = h.client.job || 'unknown';
        jobs[job] = (jobs[job] || 0) + 1;
    });

    const sortedJobs = Object.entries(jobs).sort((a, b) => b[1] - a[1]);

    const jobContainer = document.getElementById('jobDistribution');
    if (jobContainer) {
        if (sortedJobs.length === 0) {
            jobContainer.innerHTML = '<div class="job-item"><span>No data yet</span><span>0</span></div>';
        } else {
            jobContainer.innerHTML = sortedJobs.slice(0, 6).map(([job, count]) => `
                <div class="job-item"><span>${job}</span><span>${count}</span></div>
            `).join('');
        }
    }
}

// ===== BULK UPLOAD =====
const fileUploadArea = document.getElementById('fileUploadArea');
const fileInput = document.getElementById('fileInput');
const bulkPredictBtn = document.getElementById('bulkPredictBtn');
const bulkResults = document.getElementById('bulkResults');

fileUploadArea?.addEventListener('click', () => fileInput.click());

fileUploadArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.classList.add('dragover');
});

fileUploadArea?.addEventListener('dragleave', () => {
    fileUploadArea.classList.remove('dragover');
});

fileUploadArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileUpload(e.dataTransfer.files[0]);
    }
});

fileInput?.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFileUpload(e.target.files[0]);
    }
});

function handleFileUpload(file) {
    if (!file.name.endsWith('.csv')) {
        alert('Please upload a CSV file.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        bulkResults.innerHTML = `
            <div style="margin-top:16px;padding:16px;background:rgba(255,255,255,0.04);border-radius:12px;">
                <p style="color:rgba(255,255,255,0.6);">✅ Loaded file: ${file.name}</p>
                <p style="font-size:0.8rem;color:rgba(255,255,255,0.3);">Click "Predict All" to process.</p>
            </div>
        `;
        bulkPredictBtn.style.display = 'flex';
        bulkPredictBtn.dataset.csvData = text;
    };
    reader.readAsText(file);
}

bulkPredictBtn?.addEventListener('click', async () => {
    const text = bulkPredictBtn.dataset.csvData;
    if (!text) return;

    const rows = text.split('\n').filter(row => row.trim());
    if (rows.length < 2) {
        alert('CSV file is empty or invalid.');
        return;
    }

    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
    bulkPredictBtn.disabled = true;
    bulkPredictBtn.innerHTML = '<span class="loading"></span> Processing...';

    const results = [];
    for (let i = 1; i < Math.min(rows.length, 101); i++) {
        const values = rows[i].split(',').map(v => v.trim());
        const client = {};
        headers.forEach((h, idx) => {
            const val = values[idx] || '';
            client[h] = isNaN(val) ? val : parseFloat(val);
        });

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(client)
            });
            const result = await response.json();
            results.push({ client, result });
        } catch (e) {
            results.push({ client, result: { prediction: 'Error', error: e.message } });
        }
    }

    const high = results.filter(r => r.result.prediction === 'Yes').length;
    const low = results.filter(r => r.result.prediction === 'No').length;
    const errors = results.filter(r => r.result.prediction === 'Error').length;

    bulkResults.innerHTML = `
        <div style="margin-top:16px;padding:20px;background:rgba(255,255,255,0.04);border-radius:12px;">
            <h4 style="color:#fff;margin-bottom:12px;">📊 Bulk Results</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div style="background:rgba(0,230,118,0.08);padding:16px;border-radius:10px;text-align:center;">
                    <div style="font-size:1.5rem;font-weight:700;color:#00e676;">${high}</div>
                    <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);">High Potential</div>
                </div>
                <div style="background:rgba(255,82,82,0.08);padding:16px;border-radius:10px;text-align:center;">
                    <div style="font-size:1.5rem;font-weight:700;color:#ff5252;">${low}</div>
                    <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);">Low Priority</div>
                </div>
                <div style="background:rgba(255,200,0,0.08);padding:16px;border-radius:10px;text-align:center;">
                    <div style="font-size:1.5rem;font-weight:700;color:#ffab40;">${errors}</div>
                    <div style="font-size:0.75rem;color:rgba(255,255,255,0.4);">Errors</div>
                </div>
            </div>
            <p style="color:rgba(255,255,255,0.3);font-size:0.8rem;margin-top:12px;">${results.length} clients processed.</p>
        </div>
    `;

    results.forEach(r => {
        if (r.result.prediction !== 'Error') {
            addToHistory(r.client, r.result);
        }
    });

    bulkPredictBtn.style.display = 'none';
    bulkPredictBtn.disabled = false;
    bulkPredictBtn.innerHTML = '<span class="btn-icon">🚀</span><span class="btn-text">Predict All</span>';
});

// ===== LEAD PROFILE =====
function renderLeadTable(filter = '') {
    const tbody = document.getElementById('leadTableBody');
    if (!tbody) return;

    let filtered = leadData;
    if (filter) {
        const f = filter.toLowerCase();
        filtered = leadData.filter(l =>
            l.job.toLowerCase().includes(f) ||
            l.education.toLowerCase().includes(f) ||
            String(l.age).includes(f) ||
            String(l.balance).includes(f) ||
            l.prediction.toLowerCase().includes(f)
        );
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="no-data">No leads found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.slice(0, 100).map((lead, idx) => {
        const isRealId = typeof lead.id === 'number' && lead.id > 1000000;
        return `
            <tr>
                <td>
                    <input type="checkbox" class="lead-checkbox" data-id="${lead.id}" ${!isRealId ? 'disabled' : ''} />
                </td>
                <td>${idx + 1}</td>
                <td>${lead.job}</td>
                <td>${lead.age}</td>
                <td>₦${lead.balance}</td>
                <td><span class="badge ${lead.prediction.toLowerCase()}">${lead.prediction}</span></td>
                <td>${lead.confidence}%</td>
                <td>
                    ${isRealId ? `<button class="score-btn" onclick="fetchLeadScore(${lead.id})">📊 Score</button>` : ''}
                    <button class="view-btn" onclick="showLeadDetail(${lead.id})">View</button>
                    ${isRealId ? `<button class="delete-btn" onclick="deleteLead(${lead.id})">✕</button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

function showLeadDetail(id) {
    const lead = leadData.find(l => l.id === id);
    if (!lead) return;

    const detail = document.getElementById('leadDetail');
    const content = document.getElementById('leadDetailContent');
    detail.style.display = 'block';

    const d = lead.data;
    content.innerHTML = `
        <div class="lead-detail-grid">
            <div class="lead-detail-item">
                <span class="label">Job</span>
                <span class="value">${d.job}</span>
            </div>
            <div class="lead-detail-item">
                <span class="label">Age</span>
                <span class="value">${d.age}</span>
            </div>
            <div class="lead-detail-item">
                <span class="label">Education</span>
                <span class="value">${d.education}</span>
            </div>
            <div class="lead-detail-item">
                <span class="label">Marital Status</span>
                <span class="value">${d.marital}</span>
            </div>
            <div class="lead-detail-item">
                <span class="label">Balance</span>
                <span class="value">₦${d.balance}</span>
            </div>
            <div class="lead-detail-item">
                <span class="label">Call Duration</span>
                <span class="value">${d.duration}s</span>
            </div>
            <div class="lead-detail-item">
                <span class="label">Previous Outcome</span>
                <span class="value">${d.poutcome}</span>
            </div>
            <div class="lead-detail-item">
                <span class="label">Prediction</span>
                <span class="value" style="color:${lead.prediction === 'Yes' ? '#00e676' : '#ff5252'};">${lead.prediction}</span>
            </div>
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);">
            <span style="color:rgba(255,255,255,0.3);font-size:0.75rem;">Predicted on: ${lead.timestamp}</span>
        </div>
    `;

    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Search leads
document.getElementById('leadSearchBtn')?.addEventListener('click', () => {
    const query = document.getElementById('leadSearch').value;
    renderLeadTable(query);
});

document.getElementById('leadSearch')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        const query = document.getElementById('leadSearch').value;
        renderLeadTable(query);
    }
});

// Clear validation styling
document.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', () => {
        el.style.borderColor = '';
        el.style.boxShadow = '';
        validationMsg.style.display = 'none';
    });
});

// ============================================================
// DATABASE INTEGRATION
// ============================================================

function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-container');
    if (existing) existing.remove();
    
    const container = document.createElement('div');
    container.className = 'toast-container';
    container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 1000;
        max-width: 400px;
        width: 100%;
    `;
    
    const toast = document.createElement('div');
    const colors = {
        success: 'rgba(0,230,118,0.15)',
        error: 'rgba(255,82,82,0.15)',
        info: 'rgba(255,200,0,0.15)'
    };
    const borderColors = {
        success: 'rgba(0,230,118,0.3)',
        error: 'rgba(255,82,82,0.3)',
        info: 'rgba(255,200,0,0.3)'
    };
    
    toast.style.cssText = `
        padding: 16px 20px;
        border-radius: 12px;
        color: #fff;
        font-size: 0.9rem;
        font-weight: 500;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        backdrop-filter: blur(20px);
        animation: slideIn 0.3s ease;
        border: 1px solid ${borderColors[type] || borderColors.info};
        background: ${colors[type] || colors.info};
    `;
    toast.textContent = message;
    
    container.appendChild(toast);
    document.body.appendChild(container);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => container.remove(), 300);
    }, 4000);
}

async function loadLeadsFromDB() {
    try {
        const response = await fetch('/leads?limit=1000');
        const data = await response.json();
        
        if (data.status === 'success' && data.leads.length > 0) {
            const existingIds = new Set(leadData.map(l => l.id));
            
            data.leads.forEach(lead => {
                if (existingIds.has(lead.id)) return;
                
                const entry = {
                    id: lead.id,
                    client: lead.client_data,
                    result: {
                        prediction: lead.prediction,
                        probability_yes: lead.probability_yes,
                        probability_no: lead.probability_no
                    },
                    timestamp: new Date(lead.timestamp).toLocaleString(),
                    confidence: lead.confidence,
                    priority: lead.priority,
                    message: lead.message,
                    source: lead.source
                };
                
                historyData.push(entry);
                leadData.push({
                    id: lead.id,
                    job: lead.client_data.job || 'unknown',
                    age: lead.client_data.age || 0,
                    balance: lead.client_data.balance || 0,
                    education: lead.client_data.education || 'unknown',
                    prediction: lead.prediction,
                    confidence: lead.confidence,
                    data: lead.client_data,
                    result: entry.result,
                    timestamp: entry.timestamp,
                    source: lead.source
                });
                predictionCount++;
            });
            
            renderHistory();
            updateDashboard();
            updateAnalytics();
            renderLeadTable();
            
            console.log(`✅ Loaded ${data.leads.length} leads from database`);
        }
    } catch (error) {
        console.error('Error loading leads:', error);
    }
}

async function deleteLead(id) {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    
    try {
        const response = await fetch(`/leads/${id}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            historyData = historyData.filter(h => h.id !== id);
            leadData = leadData.filter(l => l.id !== id);
            predictionCount = historyData.length;
            
            renderHistory();
            updateDashboard();
            updateAnalytics();
            renderLeadTable();
            
            document.getElementById('leadDetail').style.display = 'none';
            showToast('Lead deleted successfully', 'success');
        } else {
            showToast('Error deleting lead: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    }
}

async function clearAllLeads() {
    const total = leadData.length;
    if (total === 0) {
        showToast('No leads to clear', 'info');
        return;
    }
    
    if (!confirm(`⚠️ Are you sure you want to delete ALL ${total} leads? This action cannot be undone!`)) return;
    if (!confirm(`⚠️⚠️ FINAL CONFIRMATION: Delete all ${total} leads?`)) return;
    
    try {
        const response = await fetch('/leads/clear?confirm=true', {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            historyData = [];
            leadData = [];
            predictionCount = 0;
            
            renderHistory();
            updateDashboard();
            updateAnalytics();
            renderLeadTable();
            
            document.getElementById('leadDetail').style.display = 'none';
            showToast(`✅ ${data.deleted_count} leads cleared successfully`, 'success');
        } else {
            showToast('Error clearing leads: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Network error: ' + error.message, 'error');
    }
}

async function deleteSelectedLeads(ids) {
    if (!ids || ids.length === 0) {
        showToast('No leads selected', 'info');
        return;
    }
    
    if (!confirm(`Delete ${ids.length} selected leads?`)) return;
    
    let deleted = 0;
    for (const id of ids) {
        try {
            const response = await fetch(`/leads/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) deleted++;
        } catch (e) {
            console.error(`Failed to delete lead ${id}:`, e);
        }
    }
    
    await loadLeadsFromDB();
    showToast(`Deleted ${deleted} leads`, 'success');
}

function toggleAllCheckboxes(master) {
    document.querySelectorAll('.lead-checkbox').forEach(cb => {
        cb.checked = master.checked;
    });
    updateSelectedCount();
}

function selectAllLeads() {
    document.querySelectorAll('.lead-checkbox').forEach(cb => cb.checked = true);
    updateSelectedCount();
}

function deselectAllLeads() {
    document.querySelectorAll('.lead-checkbox').forEach(cb => cb.checked = false);
    updateSelectedCount();
}

function updateSelectedCount() {
    const count = document.querySelectorAll('.lead-checkbox:checked').length;
    const el = document.getElementById('selectedCount');
    if (el) el.textContent = `${count} selected`;
}

function getSelectedLeadIds() {
    return Array.from(document.querySelectorAll('.lead-checkbox:checked'))
        .map(cb => parseInt(cb.dataset.id));
}

async function deleteSelectedLeadsFromUI() {
    const ids = getSelectedLeadIds();
    if (ids.length === 0) {
        showToast('No leads selected', 'info');
        return;
    }
    await deleteSelectedLeads(ids);
}

async function refreshLeads() {
    showToast('Refreshing leads...', 'info');
    await loadLeadsFromDB();
    showToast('Leads refreshed', 'success');
}

function addBulkActions() {
    const leadTable = document.querySelector('.lead-profile-content');
    if (!leadTable) return;
    if (document.querySelector('.bulk-actions')) return;
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'bulk-actions';
    actionsDiv.style.cssText = `
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
        flex-wrap: wrap;
        align-items: center;
        padding: 8px 0;
    `;
    actionsDiv.innerHTML = `
        <button class="search-btn" onclick="selectAllLeads()" style="background:rgba(255,255,255,0.05);color:#fff;padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;">
            ☑ Select All
        </button>
        <button class="search-btn" onclick="deselectAllLeads()" style="background:rgba(255,255,255,0.05);color:#fff;padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;">
            ☐ Deselect All
        </button>
        <button class="search-btn" onclick="deleteSelectedLeadsFromUI()" style="background:rgba(255,50,50,0.15);color:#ff5252;padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;">
            🗑 Delete Selected
        </button>
        <button class="search-btn" onclick="clearAllLeads()" style="background:rgba(255,50,50,0.2);color:#ff5252;padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;">
            🗑 Clear All
        </button>
        <button class="search-btn" onclick="refreshLeads()" style="background:rgba(0,128,255,0.15);color:#0080ff;padding:8px 16px;border:none;border-radius:8px;cursor:pointer;font-size:0.8rem;">
            🔄 Refresh
        </button>
        <span id="selectedCount" style="color:rgba(255,255,255,0.4);font-size:0.8rem;margin-left:auto;padding:4px 12px;background:rgba(255,255,255,0.04);border-radius:20px;">0 selected</span>
    `;
    
    const searchDiv = leadTable.querySelector('.lead-search');
    searchDiv.parentNode.insertBefore(actionsDiv, searchDiv.nextSibling);
}

// ===== INITIALIZE ON PAGE LOAD =====
document.addEventListener('DOMContentLoaded', function() {
    loadLeadsFromDB();
    setTimeout(addBulkActions, 200);
    
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('lead-checkbox')) {
            updateSelectedCount();
        }
    });
});

console.log('✅ LeadScout UI ready!');

// ============================================================
// LEAD SCORING SYSTEM
// ============================================================

async function fetchLeadScore(leadId) {
    try {
        const response = await fetch(`/lead-score/${leadId}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            displayScoreBreakdown(data.score);
            showToast('📊 Score breakdown loaded!', 'success');
        } else {
            showToast('Error loading score: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error fetching lead score:', error);
        showToast('Network error loading score', 'error');
    }
}

function displayScoreBreakdown(scoreData) {
    const container = document.getElementById('scoreBreakdown');
    const factorsContainer = document.getElementById('scoreFactors');
    const insightsContainer = document.getElementById('insightsList');
    
    if (!container || !factorsContainer || !insightsContainer) {
        console.warn('Score breakdown elements not found in DOM');
        return;
    }
    
    container.style.display = 'block';
    document.getElementById('totalScore').textContent = scoreData.percentage;
    
    factorsContainer.innerHTML = scoreData.breakdown.map(factor => {
        const percentage = (factor.score / factor.max_score) * 100;
        return `
            <div class="score-factor">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 2px;">
                    <span style="color: rgba(255,255,255,0.6);">
                        ${factor.icon} ${factor.factor}
                    </span>
                    <span style="color: ${factor.level === 'high' ? '#00e676' : factor.level === 'medium' ? '#ffab40' : '#ff5252'}; font-weight: 600;">
                        ${factor.score}/${factor.max_score}
                    </span>
                </div>
                <div class="score-bar-track">
                    <div class="score-bar-fill ${factor.level}" style="width: ${percentage}%;"></div>
                </div>
                <div style="font-size: 0.65rem; color: rgba(255,255,255,0.3); margin-top: 1px;">
                    ${factor.description}
                </div>
            </div>
        `;
    }).join('');
    
    insightsContainer.innerHTML = scoreData.insights.map(insight => `
        <div style="padding: 4px 0; display: flex; align-items: flex-start; gap: 8px;">
            <span style="font-size: 0.9rem;">💡</span>
            <span>${insight}</span>
        </div>
    `).join('');
}

// ============================================================
// AI LEAD ASSISTANT - ENHANCED WITH CHAT HISTORY
// ============================================================

// ===== STATE =====
let currentLeadId = null;
let isProcessing = false;
let chatHistory = [];
let historyPanelOpen = false;

// ===== CHECK AI HEALTH =====
async function checkAIHealth() {
    try {
        const response = await fetch('/ai/health');
        const data = await response.json();
        const statusEl = document.getElementById('aiStatus');
        if (statusEl) {
            if (data.available) {
                statusEl.textContent = '🟢 Online';
                statusEl.style.color = '#00e676';
            } else {
                statusEl.textContent = '🔴 Offline';
                statusEl.style.color = '#ff5252';
            }
        }
    } catch (error) {
        console.error('AI health check failed:', error);
    }
}

// ===== LOAD LEADS DROPDOWN =====
async function loadLeadsDropdown() {
    try {
        const response = await fetch('/leads?limit=100');
        const data = await response.json();
        
        const select = document.getElementById('aiLeadSelect');
        if (!select) return;
        
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select a lead...</option>';
        
        if (data.leads && data.leads.length > 0) {
            data.leads.forEach(lead => {
                const client = lead.client_data;
                const option = document.createElement('option');
                option.value = lead.id;
                option.textContent = `#${lead.id} - ${client.job || 'Unknown'} (${client.age || '?'}yrs) - ${lead.prediction}`;
                select.appendChild(option);
            });
        }
        
        if (currentValue) {
            select.value = currentValue;
        }
    } catch (error) {
        console.error('Error loading leads:', error);
    }
}

// ===== LOAD TOP LEADS =====
async function loadTopLeads() {
    try {
        const response = await fetch('/ai/top-leads?limit=5');
        const data = await response.json();
        
        if (data.status === 'success') {
            const select = document.getElementById('aiLeadSelect');
            if (!select) return;
            
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            data.leads.forEach(lead => {
                const option = document.createElement('option');
                option.value = lead.id;
                option.textContent = `⭐ #${lead.id} - ${lead.job} (${lead.probability}%)`;
                select.appendChild(option);
            });
            
            if (data.leads.length > 0) {
                select.value = data.leads[0].id;
                currentLeadId = parseInt(data.leads[0].id);
                addMessage('bot', `📋 Loaded top ${data.leads.length} leads. Select one to ask questions!`);
                loadChatHistory(currentLeadId);
            }
        }
    } catch (error) {
        console.error('Error loading top leads:', error);
        addMessage('bot', '❌ Error loading top leads.');
    }
}

// ===== LOAD CHAT HISTORY =====
async function loadChatHistory(leadId) {
    try {
        const response = await fetch(`/chat/history/${leadId}`);
        const data = await response.json();
        
        if (data.status === 'success') {
            chatHistory = data.history || [];
            const countEl = document.getElementById('historyCount');
            if (countEl) countEl.textContent = chatHistory.length;
            renderHistory();
            return chatHistory;
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
    return [];
}

// ===== RENDER HISTORY =====
function renderHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;
    
    if (chatHistory.length === 0) {
        container.innerHTML = '<p class="history-empty">No chat history yet.</p>';
        return;
    }
    
    container.innerHTML = chatHistory.map(item => `
        <div class="history-item" onclick="loadHistoryMessage(${item.id})">
            <span class="history-time">${formatTime(item.timestamp)}</span>
            <div class="history-question">${escapeHtml(item.question)}</div>
            <div class="history-preview">${escapeHtml(item.answer.slice(0, 100))}...</div>
        </div>
    `).join('');
}

// ===== TOGGLE HISTORY PANEL =====
function toggleHistory() {
    historyPanelOpen = !historyPanelOpen;
    const panel = document.getElementById('historyPanel');
    if (panel) {
        panel.style.display = historyPanelOpen ? 'block' : 'none';
    }
}

// ===== SAVE CHAT TO DATABASE =====
async function saveChatToDB(leadId, question, answer) {
    try {
        const response = await fetch('/chat/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: leadId, question, answer })
        });
        
        if (response.ok) {
            await loadChatHistory(leadId);
        }
    } catch (error) {
        console.error('Error saving chat:', error);
    }
}

// ===== CLEAR CHAT HISTORY =====
async function clearChatHistory() {
    const leadSelect = document.getElementById('aiLeadSelect');
    if (!leadSelect) return;
    
    const leadId = leadSelect.value;
    if (!leadId) {
        showToast('⚠️ No lead selected', 'info');
        return;
    }
    
    if (!confirm('Clear all chat history for this lead?')) return;
    
    try {
        const response = await fetch(`/chat/clear/${leadId}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        
        if (data.status === 'success') {
            chatHistory = [];
            const countEl = document.getElementById('historyCount');
            if (countEl) countEl.textContent = '0';
            renderHistory();
            showToast('✅ Chat history cleared', 'success');
        }
    } catch (error) {
        console.error('Error clearing history:', error);
        showToast('❌ Error clearing history', 'error');
    }
}

// ===== LOAD HISTORY MESSAGE =====
async function loadHistoryMessage(id) {
    const item = chatHistory.find(h => h.id === id);
    if (!item) return;
    
    addMessage('user', item.question);
    addMessage('bot', item.answer);
}

// ===== FORMAT TIME =====
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ===== ESCAPE HTML =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== ASK AI =====
async function askAI() {
    const questionInput = document.getElementById('aiQuestion');
    const leadSelect = document.getElementById('aiLeadSelect');
    
    if (!questionInput || !leadSelect) return;
    
    const question = questionInput.value.trim();
    const leadId = leadSelect.value;
    
    if (!leadId) {
        addMessage('bot', '⚠️ Please select a lead first.');
        return;
    }
    
    if (!question) {
        addMessage('bot', '⚠️ Please enter a question.');
        return;
    }
    
    if (isProcessing) return;
    
    isProcessing = true;
    currentLeadId = parseInt(leadId);
    
    addMessage('user', question);
    questionInput.value = '';
    
    addTypingIndicator();
    
    try {
        const response = await fetch('/ai/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lead_id: currentLeadId,
                question: question
            })
        });
        
        const data = await response.json();
        removeTypingIndicator();
        
        if (data.status === 'success') {
            addMessage('bot', data.answer);
            await saveChatToDB(currentLeadId, question, data.answer);
        } else {
            addMessage('bot', '❌ Error: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        removeTypingIndicator();
        addMessage('bot', '❌ Network error. Please try again.');
    }
    
    isProcessing = false;
}

// ===== QUICK ACTIONS =====
async function quickAsk(action) {
    const leadSelect = document.getElementById('aiLeadSelect');
    if (!leadSelect) return;
    
    const leadId = leadSelect.value;
    
    if (!leadId) {
        addMessage('bot', '⚠️ Please select a lead first.');
        return;
    }
    
    if (isProcessing) return;
    
    let question = '';
    switch(action) {
        case 'summary':
            question = 'Give me a brief summary of this lead.';
            break;
        case 'recommendations':
            question = 'What are your specific recommendations for this lead?';
            break;
        case 'call strategy':
            question = 'What is the best call strategy for this lead?';
            break;
        case 'objections':
            question = 'What objections might this lead have and how should I handle them?';
            break;
        default:
            return;
    }
    
    const questionInput = document.getElementById('aiQuestion');
    if (questionInput) questionInput.value = question;
    await askAI();
}

// ===== ADD MESSAGE TO CHAT =====
function addMessage(type, content) {
    const container = document.getElementById('aiMessages');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = `ai-message ${type}`;
    const avatar = type === 'bot' ? '🤖' : '👤';
    
    let formattedContent = content;
    
    formattedContent = formattedContent
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^### (.*$)/gim, '<h4>$1</h4>')
        .replace(/^## (.*$)/gim, '<h3>$1</h3>')
        .replace(/^# (.*$)/gim, '<h2>$1</h2>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/^\d+\. (.*$)/gim, '<li>$1</li>')
        .replace(/\n/g, '<br>');
    
    formattedContent = formattedContent
        .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
        .replace(/<ul><\/ul>/g, '');
    
    div.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">${formattedContent}</div>
    `;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ===== TYPING INDICATOR =====
function addTypingIndicator() {
    const container = document.getElementById('aiMessages');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'ai-message bot typing';
    div.id = 'typingIndicator';
    div.innerHTML = `
        <div class="message-avatar">🤖</div>
        <div class="message-content">
            <span class="typing-dots">
                <span>.</span><span>.</span><span>.</span>
            </span>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

// ===== CLEAR CHAT UI =====
function clearChat() {
    if (!confirm('Clear the chat messages? (History will remain saved)')) return;
    
    const container = document.getElementById('aiMessages');
    if (!container) return;
    
    container.innerHTML = `
        <div class="ai-message bot">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <p><strong>Chat cleared.</strong> Select a lead and ask me anything!</p>
            </div>
        </div>
    `;
}

// ===== VOICE INPUT - CAPTURE ONE SPEECH =====
function startVoiceInput() {
    // Check if browser supports speech recognition
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
        addMessage('bot', '⚠️ Your browser does not support voice input. Please type your question.');
        return;
    }

    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.continuous = false;     // Stops after one speech
    recognition.interimResults = true;  // Shows what you're saying while speaking
    recognition.maxAlternatives = 1;
    
    let fullTranscript = '';
    
    const voiceBtn = document.getElementById('voiceBtn');
    if (!voiceBtn) return;
    
    voiceBtn.textContent = '🎤 Listening...';
    voiceBtn.style.background = 'rgba(255,50,50,0.3)';
    voiceBtn.disabled = true;
    
    const questionInput = document.getElementById('aiQuestion');
    
    recognition.onresult = function(event) {
        let interimText = '';
        let finalText = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalText += transcript;
            } else {
                interimText += transcript;
            }
        }
        
        // Show what you're saying in real-time
        if (interimText) {
            if (questionInput) {
                questionInput.placeholder = `🎤 ${interimText}`;
            }
        }
        
        // Store final text
        if (finalText) {
            fullTranscript = finalText;
            if (questionInput) {
                questionInput.value = fullTranscript;
            }
        }
    };
    
    recognition.onend = function() {
        voiceBtn.textContent = '🎙️';
        voiceBtn.style.background = '';
        voiceBtn.disabled = false;
        
        if (questionInput) {
            questionInput.placeholder = 'Ask about this lead...';
        }
        
        // Submit if we have text
        if (fullTranscript.trim()) {
            if (questionInput) {
                questionInput.value = fullTranscript.trim();
            }
            askAI();
        } else {
            addMessage('bot', '⚠️ No speech detected. Please type your question.');
        }
    };
    
    recognition.onerror = function(event) {
        voiceBtn.textContent = '🎙️';
        voiceBtn.style.background = '';
        voiceBtn.disabled = false;
        
        if (questionInput) {
            questionInput.placeholder = 'Ask about this lead...';
        }
        
        if (event.error === 'not-allowed') {
            addMessage('bot', '⚠️ Please allow microphone access.');
        } else if (event.error === 'no-speech') {
            // Silent fail - user didn't speak
        } else if (event.error !== 'aborted') {
            addMessage('bot', `⚠️ Voice error: ${event.error}`);
        }
    };
    
    recognition.start();
}

// ===== LEAD SELECT CHANGE =====
document.getElementById('aiLeadSelect')?.addEventListener('change', function() {
    const leadId = this.value;
    if (leadId) {
        currentLeadId = parseInt(leadId);
        loadChatHistory(currentLeadId);
    } else {
        chatHistory = [];
        const countEl = document.getElementById('historyCount');
        if (countEl) countEl.textContent = '0';
        renderHistory();
    }
});

// ===== ENTER KEY TO SEND =====
document.getElementById('aiQuestion')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        askAI();
    }
});

// ===== INITIALIZE =====
document.addEventListener('DOMContentLoaded', function() {
    checkAIHealth();
    
    // Load leads when AI tab is clicked
    document.querySelector('[data-tab="ai"]')?.addEventListener('click', function() {
        const select = document.getElementById('aiLeadSelect');
        if (select) {
            if (select.options.length <= 1) {
                loadLeadsDropdown();
            }
            if (select.value) {
                currentLeadId = parseInt(select.value);
                loadChatHistory(currentLeadId);
            }
        }
        checkAIHealth();
    });
    
    // Load history if AI tab is already visible
    const aiTab = document.getElementById('tab-ai');
    if (aiTab && aiTab.style.display !== 'none') {
        const select = document.getElementById('aiLeadSelect');
        if (select && select.value) {
            currentLeadId = parseInt(select.value);
            loadChatHistory(currentLeadId);
        }
    }
});

console.log('🤖 AI Lead Assistant loaded!');
console.log('✅ LeadScout UI ready!');