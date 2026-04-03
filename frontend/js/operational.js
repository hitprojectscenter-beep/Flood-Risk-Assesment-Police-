/**
 * TSRS Operational Output Module
 * Shows operational guidelines, resource allocation, and evacuation info.
 */
const TSRSOps = (() => {
    const API_BASE = TSRSViz.API_BASE;

    async function loadOperational(stationId) {
        const waveHeight = TSRSControls.getWaveHeight();
        try {
            const url = `${API_BASE}/api/operational/${stationId}?wave_height=${waveHeight}`;
            const response = await fetch(url);
            const data = await response.json();
            _renderPanel(data);
        } catch (err) {
            console.error('Error loading operational data:', err);
        }
    }

    function _renderPanel(data) {
        const panel = document.getElementById('operational-panel');
        const header = document.getElementById('op-station-name');
        const content = document.getElementById('op-panel-content');

        panel.style.display = 'block';
        header.textContent = `📋 הנחיות מבצעיות — ${data.station_name}`;

        const scoreColor = TSRSViz.getTSRSColor(data.tsrs_score);
        const res = data.resource_allocation;

        // Guidelines list
        const guidelinesHTML = data.guidelines.map(g =>
            `<li>${g}</li>`
        ).join('');

        content.innerHTML = `
            <div class="op-grid">
                <div class="op-card">
                    <h4>ציון TSRS</h4>
                    <div class="op-value" style="color:${scoreColor}">${data.tsrs_score}</div>
                    <div style="font-size:11px; color:#666">${data.risk_tier_he}</div>
                </div>
                <div class="op-card">
                    <h4>גובה גל</h4>
                    <div class="op-value">${data.wave_height} מ'</div>
                    <div style="font-size:11px; color:#666">חומרה: ${data.severity}</div>
                </div>
                <div class="op-card">
                    <h4>מצב פינוי</h4>
                    <div class="op-value" style="font-size:16px">${data.evacuation.mode_he}</div>
                    <div style="font-size:11px; color:#666">~${data.evacuation.estimated_population_at_risk.toLocaleString()} תושבים בסיכון</div>
                </div>
                <div class="op-card">
                    <h4>ניידות גיבוי</h4>
                    <div class="op-value">${res.backup_units_needed}</div>
                    <div style="font-size:11px; color:#666">עדיפות: ${res.priority_level}</div>
                </div>
                <div class="op-card">
                    <h4>מוסדות קריטיים</h4>
                    <div class="op-value">${res.critical_facilities_count}</div>
                </div>
                <div class="op-card">
                    <h4>מקלטים אנכיים</h4>
                    <div class="op-value">${res.vertical_shelters_available}</div>
                </div>
            </div>
            <h4 style="font-size:13px; font-weight:700; margin-bottom:6px; color:#1E3A5F">הנחיות:</h4>
            <ul class="op-guidelines">${guidelinesHTML}</ul>
        `;
    }

    function closePanel() {
        document.getElementById('operational-panel').style.display = 'none';
    }

    // Close button handler
    document.addEventListener('DOMContentLoaded', () => {
        const closeBtn = document.getElementById('op-close');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);
    });

    return { loadOperational, closePanel };
})();
