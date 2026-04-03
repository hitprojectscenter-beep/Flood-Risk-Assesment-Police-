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

    // Police station icon (Israel Police shield SVG as data URI)
    const POLICE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48" width="40" height="48">
        <path d="M20 2 L36 14 L36 32 L20 46 L4 32 L4 14 Z" fill="%230F172A" stroke="%2314B8A6" stroke-width="2.5"/>
        <text x="20" y="22" text-anchor="middle" fill="%2314B8A6" font-size="10" font-weight="bold" font-family="Arial">IL</text>
        <text x="20" y="34" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">POLICE</text>
    </svg>`;

    const policeIcon = L.icon({
        iconUrl: 'data:image/svg+xml,' + encodeURIComponent(POLICE_ICON_SVG.replace(/%23/g, '#')),
        iconSize: [32, 38],
        iconAnchor: [16, 38],
        popupAnchor: [0, -38],
    });

    let policeMarkersLayer = null;
    const POLICE_ZOOM_MIN = 15;

    function stationStyle(feature) {
        const score = feature.properties.tsrs_score;
        return {
            fillColor: getTSRSColor(score),
            fillOpacity: 0.35,
            color: getTSRSColor(score),
            weight: 2.5,
            opacity: 0.9,
        };
    }

    function highlightStyle() {
        return {
            weight: 4,
            color: '#14B8A6',
            fillOpacity: 0.55,
        };
    }

    function _setupPoliceIcons(map, data) {
        // Create police icon markers for zoom 15+
        policeMarkersLayer = L.layerGroup();
        const features = data.features || [];
        features.forEach(f => {
            const props = f.properties;
            // Get centroid of the geometry
            const bounds = L.geoJSON(f).getBounds();
            const center = bounds.getCenter();
            const marker = L.marker(center, { icon: policeIcon });
            marker.bindTooltip(`<b>🛡️ ${props.station_name}</b><br>TSRS: ${props.tsrs_score}`, { direction: 'top' });
            marker.on('click', () => {
                const popupHTML = _buildPopupHTML(props);
                marker.bindPopup(popupHTML, { maxWidth: 340, className: 'tsrs-popup-wrapper' }).openPopup();
                _updateSidebarSummary(props);
                if (typeof TSRSOps !== 'undefined') TSRSOps.loadOperational(props.station_id);
            });
            policeMarkersLayer.addLayer(marker);
        });

        // Zoom-dependent visibility
        function updatePoliceVisibility() {
            const zoom = map.getZoom();
            if (zoom >= POLICE_ZOOM_MIN) {
                if (!map.hasLayer(policeMarkersLayer)) map.addLayer(policeMarkersLayer);
            } else {
                if (map.hasLayer(policeMarkersLayer)) map.removeLayer(policeMarkersLayer);
            }
        }
        map.on('zoomend', updatePoliceVisibility);
        updatePoliceVisibility();
    }

    async function loadStations(map, district = 'all') {
        try {
            // Try cities.json (real municipal boundaries) first, then stations.json (sample)
            const data = await fetchData(
                () => FirebaseConfig.getStations(district),
                `/api/stations?district=${district}`,
                'data/cities.json'
            ) || await fetchData(null, '', 'data/stations.json');
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

            // Setup police station icons (visible at zoom 15+)
            _setupPoliceIcons(map, data);

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
        layer.bindPopup(popupHTML, { maxWidth: 360, maxHeight: 450, className: 'tsrs-popup-wrapper' }).openPopup();

        // Update sidebar summary
        _updateSidebarSummary(props);

        // Trigger operational panel load
        if (typeof TSRSOps !== 'undefined') {
            TSRSOps.loadOperational(props.station_id);
        }
    }

    // Verbal TSRS interpretations
    function getScoreVerbal(score) {
        if (score >= 80) return { text: 'קריטי', class: 'verbal-critical' };
        if (score >= 60) return { text: 'דורש שיפור', class: 'verbal-high' };
        if (score >= 40) return { text: 'מספק', class: 'verbal-medium' };
        if (score >= 20) return { text: 'טוב', class: 'verbal-low' };
        return { text: 'מצוין', class: 'verbal-minimal' };
    }

    function getOverallVerbal(score) {
        if (score >= 80) return 'מצב קריטי — נדרשת תגובה מיידית';
        if (score >= 60) return 'סיכון גבוה — נדרש שיפור משמעותי';
        if (score >= 40) return 'סיכון בינוני — מצב מספק, נדרש ניטור';
        if (score >= 20) return 'סיכון נמוך — מוכנות טובה';
        return 'סיכון מינימלי — מוכנות מצוינת';
    }

    function _buildPopupHTML(props) {
        const scoreColor = getTSRSColor(props.tsrs_score);
        const icon = getRiskIcon(props.risk_tier);
        const verbal = getOverallVerbal(props.tsrs_score);

        const components = [
            { key: 'H', label: 'סיכון הצפה', desc: 'חשיפה לגלי צונאמי', score: props.H_score, color: '#EF4444' },
            { key: 'V', label: 'פגיעות', desc: 'פגיעות דמוגרפית', score: props.V_score, color: '#8B5CF6' },
            { key: 'O', label: 'צוואר בקבוק', desc: 'קושי בפינוי', score: props.O_score, color: '#F97316' },
            { key: 'R', label: 'תגובה', desc: 'משאבי תגובה', score: props.R_score, color: '#10B981' },
            { key: 'I', label: 'תשתיות', desc: 'מבנים ומקלטים', score: props.I_score, color: '#3B82F6' },
        ];

        let barsHTML = components.map(c => {
            const sv = getScoreVerbal(c.score);
            return `
            <div class="component-bar">
                <div class="bar-label-group">
                    <span class="bar-label">${c.label}</span>
                    <span class="bar-desc">${c.desc}</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${c.score}%; background:${c.color}"></div>
                </div>
                <div class="bar-score-group">
                    <span class="bar-value">${c.score}</span>
                    <span class="bar-verbal ${sv.class}">${sv.text}</span>
                </div>
            </div>`;
        }).join('');

        return `
            <div class="tsrs-popup">
                <h3>${icon} ${props.station_name}</h3>
                <div class="tsrs-total" style="background:${scoreColor}15; border:1px solid ${scoreColor}">
                    <div>
                        <div style="font-size:12px; color:#666">ציון TSRS</div>
                        <div style="font-size:11px; color:${scoreColor}; margin-top:2px">${verbal}</div>
                    </div>
                    <span style="color:${scoreColor}; font-size:26px; font-weight:800">${props.tsrs_score}</span>
                </div>
                <div style="margin-bottom:8px; display:flex; gap:12px; font-size:12px">
                    <span><span style="color:#999">דרגה:</span> <strong>${props.risk_tier_he}</strong></span>
                    <span><span style="color:#999">נפה:</span> <strong>${props.district}</strong></span>
                </div>
                ${barsHTML}
                <div style="margin-top:10px; font-size:12px; color:#94A3B8; display:flex; gap:8px; flex-wrap:wrap">
                    <span>👥 ${props.population.toLocaleString()}</span>
                    <span>🏗️ ${props.vertical_shelters} מקלטים</span>
                    <span>🚗 ${props.evacuation_routes} צירים</span>
                </div>
                <div class="popup-actions">
                    <button class="popup-btn popup-btn-primary" onclick="TSRSOps.loadOperational('${props.station_id}')">📋 הנחיות מבצעיות</button>
                    <button class="popup-btn popup-btn-secondary" onclick="TSRSViz.showDemographicProfile('${props.station_id}')">📊 פילוח דמוגרפי</button>
                </div>
            </div>
        `;
    }

    // ========== Demographic Profiling ==========

    function _generateDemographics(props) {
        // Generate deterministic demographics based on station_id hash
        const seed = props.station_id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const r = (min, max) => min + ((seed * 7 + min * 13) % (max - min));
        const pop = props.population || 50000;

        return {
            population: pop,
            age_0_14: r(12, 28),
            age_15_24: r(10, 18),
            age_25_44: r(22, 35),
            age_45_64: r(18, 28),
            age_65_plus: r(8, 22),
            socioeconomic_cluster: r(3, 9),
            avg_income: r(6000, 18000),
            car_ownership: r(45, 85),
        };
    }

    function showDemographicProfile(stationId) {
        // Find the station
        let props = null;
        if (stationsLayer) {
            stationsLayer.eachLayer(l => {
                if (l.feature && l.feature.properties.station_id === stationId) {
                    props = l.feature.properties;
                }
            });
        }
        if (!props) return;

        const demo = _generateDemographics(props);
        const container = document.getElementById('station-summary');
        const content = document.getElementById('station-summary-content');
        container.style.display = 'block';

        const ageGroups = [
            { label: '0-14', pct: demo.age_0_14, color: '#60A5FA' },
            { label: '15-24', pct: demo.age_15_24, color: '#34D399' },
            { label: '25-44', pct: demo.age_25_44, color: '#FBBF24' },
            { label: '45-64', pct: demo.age_45_64, color: '#FB923C' },
            { label: '65+', pct: demo.age_65_plus, color: '#F87171' },
        ];

        const maxPct = Math.max(...ageGroups.map(g => g.pct));
        const barsHTML = ageGroups.map(g => `
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:3px">
                <span style="width:35px; font-size:10px; text-align:left; color:var(--text-muted)">${g.label}</span>
                <div style="flex:1; height:14px; background:rgba(148,163,184,0.1); border-radius:3px; overflow:hidden">
                    <div style="height:100%; width:${(g.pct / maxPct * 100)}%; background:${g.color}; border-radius:3px; display:flex; align-items:center; justify-content:flex-end; padding-right:4px">
                        <span style="font-size:9px; font-weight:700; color:#0F172A">${g.pct}%</span>
                    </div>
                </div>
            </div>
        `).join('');

        // Socioeconomic cluster visual
        const clusterColor = demo.socioeconomic_cluster >= 7 ? '#10B981' :
                             demo.socioeconomic_cluster >= 4 ? '#FBBF24' : '#EF4444';
        const clusterDesc = demo.socioeconomic_cluster >= 7 ? 'גבוה' :
                            demo.socioeconomic_cluster >= 4 ? 'בינוני' : 'נמוך';

        content.innerHTML = `
            <div style="text-align:center; margin-bottom:10px">
                <div style="font-size:15px; font-weight:700; color:var(--accent)">${props.station_name}</div>
                <div style="font-size:11px; color:var(--text-muted)">פילוח דמוגרפי-גאוגרפי</div>
            </div>

            <div class="summary-stat">
                <span class="summary-label">👥 אוכלוסייה</span>
                <span class="summary-value">${demo.population.toLocaleString()}</span>
            </div>

            <div style="margin:10px 0 6px; font-size:11px; font-weight:700; color:var(--accent)">📊 התפלגות גילאים</div>
            ${barsHTML}

            <div style="margin-top:10px; padding:8px; background:rgba(148,163,184,0.08); border-radius:8px">
                <div style="display:flex; justify-content:space-between; margin-bottom:4px">
                    <span style="font-size:11px; color:var(--text-muted)">אשכול סוציו-אקונומי</span>
                    <span style="font-size:13px; font-weight:800; color:${clusterColor}">${demo.socioeconomic_cluster}/10 (${clusterDesc})</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px">
                    <span style="font-size:11px; color:var(--text-muted)">הכנסה ממוצעת</span>
                    <span style="font-size:11px; font-weight:600; color:var(--text)">₪${demo.avg_income.toLocaleString()}</span>
                </div>
                <div style="display:flex; justify-content:space-between">
                    <span style="font-size:11px; color:var(--text-muted)">בעלות רכב</span>
                    <span style="font-size:11px; font-weight:600; color:var(--text)">${demo.car_ownership}%</span>
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
        showDemographicProfile,
        API_BASE,
    };
})();
