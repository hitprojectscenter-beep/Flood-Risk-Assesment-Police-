/**
 * TSRS Visualization Module
 * Handles station layer rendering, popups, and TSRS score display.
 */
const TSRSViz = (() => {
    let stationsLayer = null;
    let selectedStation = null;
    const API_BASE = getApiBase();

    function getApiBase() {
        const port = window.location.port;
        // If served directly from the FastAPI backend, use relative paths
        if (port === '8000' || port === '5380') return '';
        // Local dev: try the backend
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:5380';
        }
        // Production (Vercel etc): no API, rely on local JSON fallback
        return '';
    }

    /**
     * Data loading with fallback chain: Firebase → API → Local JSON
     */
    // True when served from FastAPI backend
    const HAS_API = window.location.port === '8000' || window.location.port === '5380';

    async function fetchData(firebaseFn, apiPath, localPath) {
        // Try Firebase first
        if (FirebaseConfig.isReady()) {
            const data = await firebaseFn();
            if (data) return data;
        }
        // Try API only if backend is available (skip in Vercel/static)
        if (HAS_API) {
            try {
                const resp = await fetch(`${API_BASE}${apiPath}`);
                if (resp.ok) return await resp.json();
            } catch (e) { /* fall through */ }
        }
        // Local JSON fallback (always works — data/ is deployed with frontend)
        try {
            const resp = await fetch(localPath);
            if (resp.ok) return await resp.json();
        } catch (e) { /* fall through */ }
        return null;
    }

    function getTSRSColor(score) {
        if (score >= 80) return '#EF4444'; // Red — Critical
        if (score >= 60) return '#F97316'; // Orange — High
        if (score >= 40) return '#EAB308'; // Yellow — Medium
        if (score >= 20) return '#22C55E'; // Green — Low
        return '#3B82F6';                   // Blue — Minimal
    }

    function getRiskIcon(tier) {
        const icons = {
            'CRITICAL': '🔴',
            'HIGH': '🟠',
            'MEDIUM': '🟡',
            'LOW': '🟢',
            'MINIMAL': '🔵',
        };
        return icons[tier] || '⚪';
    }

    function stationStyle(feature) {
        const score = feature.properties.tsrs_score;
        return {
            fillColor: getTSRSColor(score),
            fillOpacity: 0.45,
            color: getTSRSColor(score),
            weight: 2.5,
            opacity: 0.9,
        };
    }

    function highlightStyle() {
        return {
            weight: 4,
            color: '#1E3A5F',
            fillOpacity: 0.65,
        };
    }

    async function loadStations(map, district = 'all') {
        try {
            const data = await fetchData(
                () => FirebaseConfig.getStations(district),
                `/api/stations?district=${district}`,
                'data/stations.json'
            );
            if (!data) { console.warn('No station data available'); return null; }

            if (stationsLayer) {
                map.removeLayer(stationsLayer);
            }

            stationsLayer = L.geoJSON(data, {
                style: stationStyle,
                onEachFeature: (feature, layer) => {
                    layer.on({
                        click: (e) => _onStationClick(e, feature, layer, map),
                        mouseover: (e) => {
                            e.target.setStyle(highlightStyle());
                            e.target.bringToFront();
                        },
                        mouseout: (e) => {
                            if (selectedStation !== feature.properties.station_id) {
                                stationsLayer.resetStyle(e.target);
                            }
                        },
                    });

                    // Tooltip with station name
                    layer.bindTooltip(
                        `<b>${feature.properties.station_name}</b><br>TSRS: ${feature.properties.tsrs_score}`,
                        { direction: 'top', className: 'station-tooltip' }
                    );
                },
            });

            stationsLayer.addTo(map);
            return stationsLayer;
        } catch (err) {
            console.error('Error loading stations:', err);
            return null;
        }
    }

    function _onStationClick(e, feature, layer, map) {
        const props = feature.properties;
        selectedStation = props.station_id;

        // Build popup HTML
        const popupHTML = _buildPopupHTML(props);
        layer.bindPopup(popupHTML, { maxWidth: 320, className: 'tsrs-popup-wrapper' }).openPopup();

        // Update sidebar summary
        _updateSidebarSummary(props);

        // Trigger operational panel load
        if (typeof TSRSOps !== 'undefined') {
            TSRSOps.loadOperational(props.station_id);
        }
    }

    function _buildPopupHTML(props) {
        const scoreColor = getTSRSColor(props.tsrs_score);
        const icon = getRiskIcon(props.risk_tier);

        const components = [
            { key: 'H', label: 'סיכון הצפה', score: props.H_score, color: '#EF4444' },
            { key: 'V', label: 'פגיעות אוכלוסייה', score: props.V_score, color: '#8B5CF6' },
            { key: 'O', label: 'צוואר בקבוק', score: props.O_score, color: '#F97316' },
            { key: 'R', label: 'יכולת תגובה', score: props.R_score, color: '#10B981' },
            { key: 'I', label: 'תשתיות', score: props.I_score, color: '#3B82F6' },
        ];

        let barsHTML = components.map(c => `
            <div class="component-bar">
                <span class="bar-label">${c.label}</span>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${c.score}%; background:${c.color}"></div>
                </div>
                <span class="bar-value">${c.score}</span>
            </div>
        `).join('');

        return `
            <div class="tsrs-popup">
                <h3>${icon} ${props.station_name}</h3>
                <div class="tsrs-total" style="background:${scoreColor}22; border:1px solid ${scoreColor}">
                    <span>ציון TSRS</span>
                    <span style="color:${scoreColor}; font-size:22px">${props.tsrs_score}</span>
                </div>
                <div style="margin-bottom:6px">
                    <span style="font-size:12px; color:#666">דרגת סיכון: </span>
                    <strong>${props.risk_tier_he}</strong>
                    <span style="margin-right:10px; font-size:12px; color:#666">נפה: </span>
                    <strong>${props.district}</strong>
                </div>
                ${barsHTML}
                <div style="margin-top:8px; font-size:12px; color:#666">
                    👥 אוכלוסייה: ${props.population.toLocaleString()} |
                    🏗️ מקלטים: ${props.vertical_shelters} |
                    🚗 צירי פינוי: ${props.evacuation_routes}
                </div>
                <div class="popup-actions">
                    <button class="popup-btn popup-btn-primary" onclick="TSRSOps.loadOperational('${props.station_id}')">📋 הנחיות מבצעיות</button>
                </div>
            </div>
        `;
    }

    function _updateSidebarSummary(props) {
        const container = document.getElementById('station-summary');
        const content = document.getElementById('station-summary-content');
        container.style.display = 'block';

        content.innerHTML = `
            <div style="text-align:center; margin-bottom:8px">
                <div style="font-size:16px; font-weight:800; color:#1E3A5F">${props.station_name}</div>
                <div style="font-size:28px; font-weight:800; color:${getTSRSColor(props.tsrs_score)}">${props.tsrs_score}</div>
                <div style="font-size:12px; color:#666">${props.risk_tier_he}</div>
            </div>
            <div class="summary-stat"><span class="summary-label">נפה</span><span class="summary-value">${props.district}</span></div>
            <div class="summary-stat"><span class="summary-label">אוכלוסייה</span><span class="summary-value">${props.population.toLocaleString()}</span></div>
            <div class="summary-stat"><span class="summary-label">מרחק מהחוף</span><span class="summary-value">${props.coast_distance_km} ק"מ</span></div>
            <div class="summary-stat"><span class="summary-label">ניידות גיבוי</span><span class="summary-value">${props.backup_units}</span></div>
            <div class="summary-stat"><span class="summary-label">עדיפות</span><span class="summary-value">${props.priority}</span></div>
            <div class="summary-stat"><span class="summary-label">מוסדות קריטיים</span><span class="summary-value">${props.critical_facilities}</span></div>
            <div class="summary-stat"><span class="summary-label">מקלטים אנכיים</span><span class="summary-value">${props.vertical_shelters}</span></div>
        `;
    }

    function getStationsLayer() {
        return stationsLayer;
    }

    function getSelectedStation() {
        return selectedStation;
    }

    return {
        loadStations,
        getStationsLayer,
        getSelectedStation,
        getTSRSColor,
        API_BASE,
    };
})();
