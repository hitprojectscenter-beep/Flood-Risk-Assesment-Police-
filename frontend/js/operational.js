/**
 * TSRS Operational Output Module
 * Shows operational guidelines, resource allocation, and evacuation info.
 */
const TSRSOps = (() => {
    const API_BASE = TSRSViz.API_BASE;
    const HAS_API = window.location.port === '8000' || window.location.port === '5380';

    async function loadOperational(stationId) {
        const waveHeight = TSRSControls.getWaveHeight();

        // Try API if backend is running
        if (HAS_API) {
            try {
                const url = `${API_BASE}/api/operational/${stationId}?wave_height=${waveHeight}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    _renderPanel(data);
                    return;
                }
            } catch (err) { /* fall through to client-side */ }
        }

        // Client-side operational data generation (for Vercel / static)
        _renderFromStationData(stationId, waveHeight);
    }

    function _renderFromStationData(stationId, waveHeight) {
        // Find station in the loaded GeoJSON layer
        const layer = TSRSViz.getStationsLayer();
        if (!layer) return;
        let props = null;
        layer.eachLayer(l => {
            if (l.feature && l.feature.properties.station_id === stationId) {
                props = l.feature.properties;
            }
        });
        if (!props) return;

        const severity = waveHeight >= 5 ? 'קיצוני' : waveHeight >= 3 ? 'חזק' : waveHeight >= 1.5 ? 'בינוני' : 'נמוך';
        const evacMode = waveHeight >= 5 ? 'חובה' : waveHeight >= 2 ? 'מומלץ' : 'המלצה';
        const popAtRisk = Math.round(props.population * Math.min(waveHeight / 10, 0.5));

        const guidelines = [];
        if (props.tsrs_score >= 60) {
            guidelines.push(`תחנה בעדיפות ${props.priority} — נדרש גיבוי מיידי של ${props.backup_units} ניידות`);
        } else {
            guidelines.push(`תחנה בעדיפות ${props.priority} — כוננות רגילה`);
        }
        if (waveHeight >= 3) {
            guidelines.push(`פינוי אוכלוסייה עד ${Math.round(props.coast_distance_km * 1000 + waveHeight * 200)}מ' מקו החוף`);
        }
        guidelines.push(`הפניית אוכלוסייה ל-${props.vertical_shelters} מבני מקלט אנכי באזור`);
        guidelines.push(`חסימת ${props.evacuation_routes} צירי פינוי ראשיים`);
        if (props.critical_facilities > 5) {
            guidelines.push(`תיאום פינוי ${props.critical_facilities} מוסדות קריטיים (בתי ספר, בתי חולים)`);
        }

        _renderPanel({
            station_id: stationId,
            station_name: props.station_name,
            wave_height: waveHeight,
            severity: severity,
            tsrs_score: props.tsrs_score,
            risk_tier_he: props.risk_tier_he,
            evacuation: { mode_he: evacMode, estimated_population_at_risk: popAtRisk },
            resource_allocation: {
                backup_units_needed: props.backup_units,
                priority_level: props.priority,
                critical_facilities_count: props.critical_facilities,
                vertical_shelters_available: props.vertical_shelters,
            },
            guidelines: guidelines,
        });
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
