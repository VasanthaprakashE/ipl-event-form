// Global variables
let charts = {};
let autoRefreshInterval = null;
let isAutoRefreshEnabled = false;
let isLoading = false;
let currentSearchTerm = "";
let currentDateFilter = { from: null, to: null };

// DOM Elements
const refreshBtn = document.getElementById("refreshBtn");
const autoRefreshToggle = document.getElementById("autoRefreshToggle");
const lastUpdatedTimeSpan = document.getElementById("lastUpdatedTime");
const autoRefreshStatusSpan = document.getElementById("autoRefreshStatus");
const loadingOverlay = document.getElementById("loadingOverlay");
const searchInput = document.getElementById("searchInput");
const clearSearchBtn = document.getElementById("clearSearch");
const dashboardFromDate = document.getElementById("dashboardFromDate");
const dashboardToDate = document.getElementById("dashboardToDate");
const applyDateFilter = document.getElementById("applyDateFilter");
const clearDateFilter = document.getElementById("clearDateFilter");
const toggleFilters = document.getElementById("toggleFilters");
const filterControls = document.getElementById("filterControls");
const exportBtn = document.getElementById("exportBtn");
const exportOptions = document.getElementById("exportOptions");
const closeExport = document.getElementById("closeExport");
const exportCurrentView = document.getElementById("exportCurrentView");
const exportAllData = document.getElementById("exportAllData");
const exportFromDate = document.getElementById("exportFromDate");
const exportToDate = document.getElementById("exportToDate");
const tableBody = document.getElementById("tableBody");

// Initialize dashboard
document.addEventListener("DOMContentLoaded", () => {
    initializeCharts();
    attachEventListeners();
    updateVisibleCount();
    loadSavedPreferences();
    
    // Initial data load if needed
    if (TOTAL_ENTRIES === 0) {
        refreshDashboardData();
    }
});

// Initialize charts
function initializeCharts() {
    // Pie Chart
    const pieCanvas = document.getElementById("pieChart");
    if (pieCanvas) {
        charts.pie = new Chart(pieCanvas, {
            type: "doughnut",
            data: {
                labels: ["Followers", "Non-followers"],
                datasets: [{
                    data: [YES_COUNT, NO_COUNT],
                    backgroundColor: ["#00ff88", "#ff4d4d"],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { labels: { color: "#fff", font: { size: 12 } } },
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
    
    // Daily Chart
    const dailyCanvas = document.getElementById("dailyChart");
    if (dailyCanvas && Object.keys(DAILY_DATA).length > 0) {
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
                    legend: { labels: { color: "#fff", font: { size: 12 } } },
                    datalabels: {
                        color: "#fff",
                        font: { weight: "bold", size: 12 },
                        anchor: "end",
                        align: "top",
                        offset: 4,
                        formatter: (value) => value > 0 ? value : ""
                    }
                },
                scales: {
                    x: { ticks: { color: "#fff" }, grid: { color: "rgba(255,255,255,0.1)" } },
                    y: { beginAtZero: true, ticks: { color: "#fff" }, grid: { color: "rgba(255,255,255,0.1)" } }
                }
            },
            plugins: [ChartDataLabels]
        });
    }
}

// Attach all event listeners
function attachEventListeners() {
    if (refreshBtn) refreshBtn.addEventListener("click", refreshDashboardData);
    if (autoRefreshToggle) autoRefreshToggle.addEventListener("change", toggleAutoRefresh);
    if (searchInput) searchInput.addEventListener("input", handleSearch);
    if (clearSearchBtn) clearSearchBtn.addEventListener("click", clearSearch);
    if (applyDateFilter) applyDateFilter.addEventListener("click", applyDateFilterHandler);
    if (clearDateFilter) clearDateFilter.addEventListener("click", clearDateFilterHandler);
    if (toggleFilters && filterControls) {
        toggleFilters.addEventListener("click", () => {
            const isVisible = filterControls.style.display !== "none";
            filterControls.style.display = isVisible ? "none" : "block";
            toggleFilters.textContent = isVisible ? "Show Filters ▼" : "Hide Filters ▲";
        });
    }
    
    // Export listeners
    if (exportBtn && exportOptions) {
        exportBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            exportOptions.style.display = exportOptions.style.display === "flex" ? "none" : "flex";
        });
    }
    if (closeExport && exportOptions) {
        closeExport.addEventListener("click", () => exportOptions.style.display = "none");
    }
    if (exportCurrentView) exportCurrentView.addEventListener("click", exportCurrentViewData);
    if (exportAllData) exportAllData.addEventListener("click", exportAllDataHandler);
    
    // Close export on outside click
    document.addEventListener("click", (e) => {
        if (exportOptions && exportBtn && !exportBtn.contains(e.target) && !exportOptions.contains(e.target)) {
            exportOptions.style.display = "none";
        }
    });
}

// Refresh dashboard data
async function refreshDashboardData() {
    if (isLoading) return;
    
    isLoading = true;
    if (loadingOverlay) loadingOverlay.style.display = "flex";
    if (refreshBtn) refreshBtn.classList.add("rotating");
    
    try {
        const fromDate = dashboardFromDate?.value || "";
        const toDate = dashboardToDate?.value || "";
        const searchTerm = searchInput?.value || "";
        
        let url = `/api/filtered-data?key=1234`;
        if (fromDate && toDate) url += `&from=${fromDate}&to=${toDate}`;
        if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch data");
        
        const data = await response.json();
        updateDashboardUI(data);
        
        const now = new Date();
        if (lastUpdatedTimeSpan) {
            lastUpdatedTimeSpan.textContent = `📅 Last updated: ${now.toLocaleTimeString()}`;
        }
        
        showNotification("Dashboard refreshed successfully!", "success");
    } catch (error) {
        console.error("Refresh error:", error);
        showNotification("Failed to refresh dashboard", "error");
    } finally {
        isLoading = false;
        if (loadingOverlay) setTimeout(() => loadingOverlay.style.display = "none", 500);
        if (refreshBtn) setTimeout(() => refreshBtn.classList.remove("rotating"), 500);
    }
}

// Update dashboard UI with new data
function updateDashboardUI(data) {
    // Update KPI cards
    document.getElementById("totalCount").textContent = data.total;
    document.getElementById("yesCount").textContent = data.yes;
    document.getElementById("noCount").textContent = data.no;
    document.getElementById("totalEntries").textContent = data.total;
    
    // Update table
    if (tableBody) {
        tableBody.innerHTML = "";
        data.entries.forEach(entry => {
            const row = document.createElement("tr");
            row.setAttribute("data-status", entry.status);
            row.setAttribute("data-date", entry.date);
            row.innerHTML = `
                <td>${entry.id}</td>
                <td>${escapeHtml(entry.name)}</td>
                <td>${escapeHtml(entry.instagram)}</td>
                <td>${entry.mobile}</td>
                <td class="${entry.status === 'yes' ? 'yes' : 'no'}">
                    ${entry.status === 'yes' ? '✓ Follower' : '✗ Non-Follower'}
                </td>
                <td>${entry.time}</td>
            `;
            tableBody.appendChild(row);
        });
        updateVisibleCount();
    }
    
    // Update charts
    if (charts.pie) {
        charts.pie.data.datasets[0].data = [data.yes, data.no];
        charts.pie.update();
    }
    
    if (charts.daily && data.daily) {
        const labels = Object.keys(data.daily).sort();
        const followers = labels.map(d => data.daily[d]?.yes || 0);
        const nonFollowers = labels.map(d => data.daily[d]?.no || 0);
        charts.daily.data.labels = labels;
        charts.daily.data.datasets[0].data = followers;
        charts.daily.data.datasets[1].data = nonFollowers;
        charts.daily.update();
    }
}

// Handle search
function handleSearch(e) {
    currentSearchTerm = e.target.value.toLowerCase();
    if (clearSearchBtn) {
        clearSearchBtn.style.display = currentSearchTerm ? "flex" : "none";
    }
    filterTable();
}

// Clear search
function clearSearch() {
    if (searchInput) {
        searchInput.value = "";
        currentSearchTerm = "";
        if (clearSearchBtn) clearSearchBtn.style.display = "none";
        filterTable();
        searchInput.focus();
    }
}

// Filter table based on search and date
function filterTable() {
    const rows = document.querySelectorAll("#tableBody tr");
    let visibleCount = 0;
    
    rows.forEach(row => {
        const name = row.cells[1]?.textContent.toLowerCase() || "";
        const mobile = row.cells[3]?.textContent.toLowerCase() || "";
        const instagram = row.cells[2]?.textContent.toLowerCase() || "";
        const rowDate = row.getAttribute("data-date") || "";
        
        const matchesSearch = currentSearchTerm === "" || 
                             name.includes(currentSearchTerm) || 
                             mobile.includes(currentSearchTerm) || 
                             instagram.includes(currentSearchTerm);
        
        const matchesDate = !currentDateFilter.from || !currentDateFilter.to || 
                           (rowDate >= currentDateFilter.from && rowDate <= currentDateFilter.to);
        
        if (matchesSearch && matchesDate) {
            row.style.display = "";
            visibleCount++;
        } else {
            row.style.display = "none";
        }
    });
    
    updateVisibleCount(visibleCount);
}

// Update visible count
function updateVisibleCount(visibleCount = null) {
    if (visibleCount === null) {
        const rows = document.querySelectorAll("#tableBody tr");
        visibleCount = Array.from(rows).filter(row => row.style.display !== "none").length;
    }
    
    const visibleCountSpan = document.getElementById("visibleCount");
    if (visibleCountSpan) visibleCountSpan.textContent = visibleCount;
    
    const noResults = document.getElementById("noResults");
    if (noResults) {
        noResults.style.display = visibleCount === 0 ? "block" : "none";
    }
}

// Date filter handlers
function applyDateFilterHandler() {
    currentDateFilter.from = dashboardFromDate?.value || null;
    currentDateFilter.to = dashboardToDate?.value || null;
    
    if (currentDateFilter.from && currentDateFilter.to && currentDateFilter.from > currentDateFilter.to) {
        showNotification("From date cannot be greater than To date!", "error");
        return;
    }
    
    filterTable();
    refreshDashboardData();
}

function clearDateFilterHandler() {
    if (dashboardFromDate) dashboardFromDate.value = "";
    if (dashboardToDate) dashboardToDate.value = "";
    currentDateFilter = { from: null, to: null };
    filterTable();
    refreshDashboardData();
}

// Auto-refresh handlers
function toggleAutoRefresh(e) {
    isAutoRefreshEnabled = e.target.checked;
    if (isAutoRefreshEnabled) {
        startAutoRefresh();
        showNotification("Auto-refresh enabled (every 30 seconds)", "success");
    } else {
        stopAutoRefresh();
        showNotification("Auto-refresh disabled", "info");
    }
    localStorage.setItem("autoRefreshEnabled", isAutoRefreshEnabled);
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        if (isAutoRefreshEnabled && !isLoading) {
            refreshDashboardData();
            if (autoRefreshStatusSpan) {
                autoRefreshStatusSpan.textContent = " 🔄 Auto-refreshing...";
                setTimeout(() => {
                    if (autoRefreshStatusSpan) autoRefreshStatusSpan.textContent = "";
                }, 2000);
            }
        }
    }, 30000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    if (autoRefreshStatusSpan) autoRefreshStatusSpan.textContent = "";
}

// Export handlers
function exportCurrentViewData() {
    const visibleRows = Array.from(document.querySelectorAll("#tableBody tr"))
        .filter(row => row.style.display !== "none");
    
    if (visibleRows.length === 0) {
        showNotification("No data to export!", "error");
        return;
    }
    
    const csvData = [["ID", "Name", "Instagram", "Mobile", "Status", "Time"]];
    visibleRows.forEach(row => {
        csvData.push([
            row.cells[0]?.textContent || "",
            row.cells[1]?.textContent || "",
            row.cells[2]?.textContent || "",
            row.cells[3]?.textContent || "",
            row.cells[4]?.textContent.replace(/[✓✗]/g, '').trim() || "",
            row.cells[5]?.textContent || ""
        ]);
    });
    
    downloadCSV(csvData, `export_${new Date().toISOString().slice(0, 19)}`);
    showNotification("Export completed!", "success");
    if (exportOptions) exportOptions.style.display = "none";
}

function exportAllDataHandler() {
    const fromDate = exportFromDate?.value;
    const toDate = exportToDate?.value;
    
    let url = `/export?key=1234`;
    if (fromDate && toDate) {
        url += `&from=${fromDate}&to=${toDate}`;
    }
    
    window.open(url, '_blank');
    showNotification("Export started...", "info");
    if (exportOptions) exportOptions.style.display = "none";
}

function downloadCSV(data, filename) {
    const csvContent = data.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Helper functions
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type) {
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        background: ${type === "success" ? "#28a745" : type === "error" ? "#dc3545" : "#ff8e53"};
        color: white;
        border-radius: 10px;
        font-weight: bold;
        z-index: 10001;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = "slideOut 0.3s ease";
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function loadSavedPreferences() {
    const savedAutoRefresh = localStorage.getItem("autoRefreshEnabled");
    if (savedAutoRefresh === "true" && autoRefreshToggle) {
        autoRefreshToggle.checked = true;
        isAutoRefreshEnabled = true;
        startAutoRefresh();
    }
}