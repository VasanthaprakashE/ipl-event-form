let charts = {};
let autoRefreshInterval = null;
let isAutoRefreshEnabled = false;
let currentSearchTerm = "";
let currentDateFilter = { from: null, to: null };

document.addEventListener("DOMContentLoaded", () => {
    console.log("Admin JS loaded");
    initializeCharts();
    attachEventListeners();
    updateVisibleCount();
    loadSavedPreferences();
});

function initializeCharts() {
    const pieCanvas = document.getElementById("pieChart");
    if (pieCanvas && typeof YES_COUNT !== 'undefined') {
        charts.pie = new Chart(pieCanvas, {
            type: "doughnut",
            data: {
                labels: ["Followers", "Non-followers"],
                datasets: [{
                    data: [YES_COUNT, NO_COUNT],
                    backgroundColor: ["#00ff88", "#ff4d4d"]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { labels: { color: "#fff" } },
                    datalabels: {
                        color: "#fff",
                        font: { weight: "bold", size: 14 },
                        formatter: (value, context) => {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return value > 0 ? `${value} (${percentage}%)` : "";
                        }
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    }
    
    const dailyCanvas = document.getElementById("dailyChart");
    if (dailyCanvas && DAILY_DATA && Object.keys(DAILY_DATA).length > 0) {
        const labels = Object.keys(DAILY_DATA).sort();
        const followers = labels.map(d => DAILY_DATA[d]?.yes || 0);
        const nonFollowers = labels.map(d => DAILY_DATA[d]?.no || 0);
        
        charts.daily = new Chart(dailyCanvas, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [
                    { label: "Followers", data: followers, backgroundColor: "#00ff88" },
                    { label: "Non-followers", data: nonFollowers, backgroundColor: "#ff4d4d" }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { labels: { color: "#fff" } },
                    datalabels: {
                        color: "#fff",
                        font: { weight: "bold", size: 12 },
                        anchor: "end",
                        align: "top",
                        formatter: (value) => value > 0 ? value : ""
                    }
                },
                scales: {
                    x: { ticks: { color: "#fff" } },
                    y: { beginAtZero: true, ticks: { color: "#fff" } }
                }
            },
            plugins: [ChartDataLabels]
        });
    }
}

function attachEventListeners() {
    document.getElementById("refreshBtn")?.addEventListener("click", refreshDashboard);
    document.getElementById("autoRefreshToggle")?.addEventListener("change", toggleAutoRefresh);
    document.getElementById("searchInput")?.addEventListener("input", handleSearch);
    document.getElementById("clearSearch")?.addEventListener("click", clearSearch);
    document.getElementById("applyDateFilter")?.addEventListener("click", applyDateFilter);
    document.getElementById("clearDateFilter")?.addEventListener("click", clearDateFilter);
    document.getElementById("toggleFilters")?.addEventListener("click", () => {
        const controls = document.getElementById("filterControls");
        const isVisible = controls.style.display !== "none";
        controls.style.display = isVisible ? "none" : "block";
        document.getElementById("toggleFilters").textContent = isVisible ? "Show Filters ▼" : "Hide Filters ▲";
    });
    
    // Export button - respects date range
    document.getElementById("exportRangeBtn")?.addEventListener("click", exportWithDateRange);
}

async function refreshDashboard() {
    const refreshBtn = document.getElementById("refreshBtn");
    refreshBtn.classList.add("rotating");
    
    try {
        const fromDate = document.getElementById("dashboardFromDate")?.value || "";
        const toDate = document.getElementById("dashboardToDate")?.value || "";
        const search = document.getElementById("searchInput")?.value || "";
        
        let url = `/api/filtered-data?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&search=${encodeURIComponent(search)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        updateDashboard(data);
        document.getElementById("lastUpdatedTime").textContent = `📅 Last updated: ${new Date().toLocaleTimeString()}`;
        showNotification("Dashboard refreshed!", "success");
    } catch (error) {
        console.error("Refresh failed:", error);
        showNotification("Refresh failed!", "error");
    } finally {
        refreshBtn.classList.remove("rotating");
    }
}

function updateDashboard(data) {
    document.getElementById("totalCount").textContent = data.total;
    document.getElementById("yesCount").textContent = data.yes;
    document.getElementById("noCount").textContent = data.no;
    document.getElementById("totalEntries").textContent = data.total;
    
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";
    data.entries.forEach(entry => {
        const row = tbody.insertRow();
        row.setAttribute("data-status", entry.status);
        row.setAttribute("data-date", entry.date);
        row.innerHTML = `
            <td>${escapeHtml(String(entry.id))}</td>
            <td>${escapeHtml(entry.name)}</td>
            <td>${escapeHtml(entry.instagram)}</td>
            <td>${escapeHtml(entry.mobile)}</td>
            <td class="${entry.status === 'yes' ? 'yes' : 'no'}">${entry.status === 'yes' ? '✓ Follower' : '✗ Non-Follower'}</td>
            <td>${escapeHtml(entry.time)}</td>
        `;
    });
    
    if (charts.pie) {
        charts.pie.data.datasets[0].data = [data.yes, data.no];
        charts.pie.update();
    }
    
    if (charts.daily && data.daily) {
        const labels = Object.keys(data.daily).sort();
        charts.daily.data.labels = labels;
        charts.daily.data.datasets[0].data = labels.map(d => data.daily[d]?.yes || 0);
        charts.daily.data.datasets[1].data = labels.map(d => data.daily[d]?.no || 0);
        charts.daily.update();
    }
    
    updateVisibleCount();
}

function handleSearch(e) {
    currentSearchTerm = e.target.value.toLowerCase();
    const clearBtn = document.getElementById("clearSearch");
    if (clearBtn) clearBtn.style.display = currentSearchTerm ? "flex" : "none";
    filterTable();
}

function clearSearch() {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.value = "";
    currentSearchTerm = "";
    const clearBtn = document.getElementById("clearSearch");
    if (clearBtn) clearBtn.style.display = "none";
    filterTable();
}

function filterTable() {
    const rows = document.querySelectorAll("#tableBody tr");
    let visible = 0;
    rows.forEach(row => {
        const name = row.cells[1]?.textContent.toLowerCase() || "";
        const mobile = row.cells[3]?.textContent.toLowerCase() || "";
        const insta = row.cells[2]?.textContent.toLowerCase() || "";
        const rowDate = row.getAttribute("data-date") || "";
        
        const matchSearch = !currentSearchTerm || name.includes(currentSearchTerm) || mobile.includes(currentSearchTerm) || insta.includes(currentSearchTerm);
        const matchDate = !currentDateFilter.from || !currentDateFilter.to || (rowDate >= currentDateFilter.from && rowDate <= currentDateFilter.to);
        
        if (matchSearch && matchDate) {
            row.style.display = "";
            visible++;
        } else {
            row.style.display = "none";
        }
    });
    updateVisibleCount(visible);
}

function updateVisibleCount(visible = null) {
    if (visible === null) {
        visible = document.querySelectorAll("#tableBody tr:not([style*='display: none'])").length;
    }
    const visibleSpan = document.getElementById("visibleCount");
    if (visibleSpan) visibleSpan.textContent = visible;
    const noResults = document.getElementById("noResults");
    if (noResults) noResults.style.display = visible === 0 ? "block" : "none";
}

function applyDateFilter() {
    currentDateFilter.from = document.getElementById("dashboardFromDate").value;
    currentDateFilter.to = document.getElementById("dashboardToDate").value;
    filterTable();
    refreshDashboard();
}

function clearDateFilter() {
    document.getElementById("dashboardFromDate").value = "";
    document.getElementById("dashboardToDate").value = "";
    currentDateFilter = { from: null, to: null };
    filterTable();
    refreshDashboard();
}

function toggleAutoRefresh(e) {
    isAutoRefreshEnabled = e.target.checked;
    if (isAutoRefreshEnabled) {
        autoRefreshInterval = setInterval(() => { if (!document.hidden) refreshDashboard(); }, 30000);
        showNotification("Auto-refresh enabled (30s)", "success");
    } else if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        showNotification("Auto-refresh disabled", "info");
    }
    localStorage.setItem("autoRefresh", isAutoRefreshEnabled);
}

function loadSavedPreferences() {
    if (localStorage.getItem("autoRefresh") === "true" && document.getElementById("autoRefreshToggle")) {
        document.getElementById("autoRefreshToggle").checked = true;
        toggleAutoRefresh({ target: document.getElementById("autoRefreshToggle") });
    }
}

// ============ EXPORT FUNCTION - RESPECTS DATE RANGE ============

function exportWithDateRange() {
    const fromDate = document.getElementById("dashboardFromDate").value;
    const toDate = document.getElementById("dashboardToDate").value;
    
    let url = '/export?';
    if (fromDate && toDate) {
        url += `from=${fromDate}&to=${toDate}`;
        showNotification(`Exporting data from ${fromDate} to ${toDate}...`, "info");
    } else {
        showNotification("Exporting all data...", "info");
    }
    
    console.log("Export URL:", url);
    
    // Open in new tab to download
    window.open(url, '_blank');
    
    setTimeout(() => {
        showNotification("✅ Export started! Check your downloads folder.", "success");
    }, 1000);
}

function showNotification(message, type) {
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#17a2b8"};
        color: white;
        border-radius: 8px;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = "slideOut 0.3s ease";
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// Add CSS animations
const style = document.createElement("style");
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .rotating {
        animation: rotate 0.5s ease-in-out;
    }
    
    @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

console.log("Admin JS fully loaded");