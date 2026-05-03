let charts = {};
let autoRefreshInterval = null;
let isAutoRefreshEnabled = false;
let currentSearchTerm = "";
let currentDateFilter = { from: null, to: null };

document.addEventListener("DOMContentLoaded", () => {
    initializeCharts();
    attachEventListeners();
    updateVisibleCount();
    loadSavedPreferences();
});

function initializeCharts() {
    const pieCanvas = document.getElementById("pieChart");
    if (pieCanvas) {
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
    
    const exportBtn = document.getElementById("exportBtn");
    const exportOptions = document.getElementById("exportOptions");
    if (exportBtn && exportOptions) {
        exportBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            exportOptions.style.display = exportOptions.style.display === "flex" ? "none" : "flex";
        });
        document.getElementById("closeExport")?.addEventListener("click", () => exportOptions.style.display = "none");
        document.getElementById("exportCurrentView")?.addEventListener("click", exportCurrentView);
        document.getElementById("exportAllData")?.addEventListener("click", exportAllData);
        document.addEventListener("click", (e) => {
            if (!exportBtn.contains(e.target) && !exportOptions.contains(e.target)) {
                exportOptions.style.display = "none";
            }
        });
    }
}

async function refreshDashboard() {
    const refreshBtn = document.getElementById("refreshBtn");
    refreshBtn.classList.add("rotating");
    
    try {
        const fromDate = document.getElementById("dashboardFromDate")?.value || "";
        const toDate = document.getElementById("dashboardToDate")?.value || "";
        const search = document.getElementById("searchInput")?.value || "";
        
        let url = `/api/filtered-data?${new URLSearchParams({ from: fromDate, to: toDate, search })}`;
        const response = await fetch(url);
        const data = await response.json();
        
        updateDashboard(data);
        document.getElementById("lastUpdatedTime").textContent = `📅 Last updated: ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error("Refresh failed:", error);
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
            <td>${entry.id}</td>
            <td>${escapeHtml(entry.name)}</td>
            <td>${escapeHtml(entry.instagram)}</td>
            <td>${entry.mobile}</td>
            <td class="${entry.status === 'yes' ? 'yes' : 'no'}">${entry.status === 'yes' ? '✓ Follower' : '✗ Non-Follower'}</td>
            <td>${entry.time}</td>
        `;
    });
    
    if (charts.pie) charts.pie.data.datasets[0].data = [data.yes, data.no];
    if (charts.pie) charts.pie.update();
    
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
    document.getElementById("clearSearch").style.display = currentSearchTerm ? "flex" : "none";
    filterTable();
}

function clearSearch() {
    document.getElementById("searchInput").value = "";
    currentSearchTerm = "";
    document.getElementById("clearSearch").style.display = "none";
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
    document.getElementById("visibleCount").textContent = visible;
    document.getElementById("noResults").style.display = visible === 0 ? "block" : "none";
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
    } else if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    localStorage.setItem("autoRefresh", isAutoRefreshEnabled);
}

function loadSavedPreferences() {
    if (localStorage.getItem("autoRefresh") === "true" && document.getElementById("autoRefreshToggle")) {
        document.getElementById("autoRefreshToggle").checked = true;
        toggleAutoRefresh({ target: document.getElementById("autoRefreshToggle") });
    }
}

function exportCurrentView() {
    const rows = document.querySelectorAll("#tableBody tr:not([style*='display: none'])");
    if (!rows.length) return alert("No data to export");
    
    const csv = [["ID", "Name", "Instagram", "Mobile", "Status", "Time"]];
    rows.forEach(row => {
        csv.push([
            row.cells[0]?.textContent || "",
            row.cells[1]?.textContent || "",
            row.cells[2]?.textContent || "",
            row.cells[3]?.textContent || "",
            row.cells[4]?.textContent || "",
            row.cells[5]?.textContent || ""
        ]);
    });
    
    const blob = new Blob([csv.map(row => row.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `export_${new Date().toISOString().slice(0,19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById("exportOptions").style.display = "none";
}

function exportAllData() {
    const from = document.getElementById("exportFromDate")?.value || "";
    const to = document.getElementById("exportToDate")?.value || "";
    window.open(`/export?${new URLSearchParams({ from, to })}`, "_blank");
    document.getElementById("exportOptions").style.display = "none";
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}