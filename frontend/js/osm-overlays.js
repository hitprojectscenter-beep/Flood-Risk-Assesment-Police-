/**
 * TSRS OSM Overlays Module
 * Dynamically loads roads and buildings from the Overpass API
 * with zoom-dependent visibility and checkbox enable/disable.
 */
const TSRSOverlays = (() => {
    // --- State ---
    let roadsLayer = null;
    let buildingsLayer = null;
    let buildings3DLayer = null;
    let policeLayer = null;
    let isRoadsEnabled = false;
    let isBuildingsEnabled = false;
    let isBuildings3DEnabled = false;
    let isPoliceEnabled = false;
    let roadsAbort = null;
    let buildingsAbort = null;
    let buildings3DAbort = null;
    let policeAbort = null;
    let lastRoadsBounds = null;
    let lastBuildingsBounds = null;
    let lastBuildings3DBounds = null;
    let lastPoliceBounds = null;
    let debounceTimer = null;
    let _map = null;

    // --- Panes for z-ordering ---
    let _panesCreated = false;
    function _ensurePanes(map) {
        if (_panesCreated) return;
        map.createPane('roadsPane').style.zIndex = 450;
        map.createPane('buildingsPane').style.zIndex = 445;
        map.createPane('policePane').style.zIndex = 460;
        _panesCreated = true;
    }

    // --- Israel Police icon (SVG data URI) ---
    const POLICE_ICON = L.icon({
        iconUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48" width="40" height="48"><path d="M20 2 L36 14 L36 32 L20 46 L4 32 L4 14 Z" fill="#0F172A" stroke="#14B8A6" stroke-width="2.5"/><text x="20" y="22" text-anchor="middle" fill="#14B8A6" font-size="10" font-weight="bold" font-family="Arial">IL</text><text x="20" y="34" text-anchor="middle" fill="white" font-size="8" font-weight="bold" font-family="Arial">POLICE</text></svg>'),
        iconSize: [30, 36],
        iconAnchor: [15, 36],
        popupAnchor: [0, -36],
    });

    // --- Zoom ranges ---
    const ROADS_ZOOM = { min: 13, max: 18 };
    const BUILDINGS_ZOOM = { min: 15, max: 18 };
    const POLICE_ZOOM = { min: 12, max: 18 };

    // --- Overpass API endpoints (fallback chain) ---
    const OVERPASS_ENDPOINTS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
    ];

    // --- Road styles by highway type ---
    const ROAD_COLORS = {
        motorway: '#E74C3C',
        trunk: '#E67E22',
        primary: '#F1C40F',
        secondary: '#2ECC71',
        tertiary: '#3498DB',
        residential: '#95A5A6',
        service: '#BDC3C7',
        default: '#AAB7B8',
    };

    const ROAD_WIDTHS = {
        motorway: 4, trunk: 3.5, primary: 3, secondary: 2.5,
        tertiary: 2, residential: 1.5, service: 1, default: 1,
    };

    // ========== Public API ==========

    function init(map) {
        _map = map;
        _ensurePanes(map);
        _updateCheckboxStates();

        map.on('zoomend', () => {
            _updateCheckboxStates();
            _debouncedLoad();
        });
        map.on('moveend', () => {
            _debouncedLoad();
        });
    }

    function setRoadsVisible(map, visible) {
        if (!_map && map) { _map = map; _ensurePanes(map); }
        isRoadsEnabled = visible;
        if (visible) {
            _loadRoads();
        } else {
            if (roadsLayer && _map) { _map.removeLayer(roadsLayer); roadsLayer = null; }
            lastRoadsBounds = null;
        }
    }

    function setBuildingsVisible(map, visible) {
        if (!_map && map) { _map = map; _ensurePanes(map); }
        isBuildingsEnabled = visible;
        if (visible) {
            _loadBuildings();
        } else {
            if (buildingsLayer && _map) { _map.removeLayer(buildingsLayer); buildingsLayer = null; }
            lastBuildingsBounds = null;
        }
    }

    function setBuildings3DVisible(map, visible) {
        if (!_map && map) { _map = map; _ensurePanes(map); }
        isBuildings3DEnabled = visible;
        if (visible) {
            _loadBuildings3D();
        } else {
            if (buildings3DLayer && _map) { _map.removeLayer(buildings3DLayer); buildings3DLayer = null; }
            lastBuildings3DBounds = null;
        }
    }

    function setPoliceVisible(map, visible) {
        if (!_map && map) { _map = map; _ensurePanes(map); }
        isPoliceEnabled = visible;
        if (visible) {
            _loadPolice();
        } else {
            if (policeLayer && _map) { _map.removeLayer(policeLayer); policeLayer = null; }
            lastPoliceBounds = null;
        }
    }

    // ========== Internal: Checkbox state management ==========

    function _updateCheckboxStates() {
        const zoom = _map.getZoom();

        _setCheckboxEnabled('layer-police-osm', 'label-police-osm', 'police-zoom-hint',
            zoom >= POLICE_ZOOM.min, POLICE_ZOOM.min);
        _setCheckboxEnabled('layer-roads', 'label-roads', 'roads-zoom-hint',
            zoom >= ROADS_ZOOM.min, ROADS_ZOOM.min);
        _setCheckboxEnabled('layer-buildings', 'label-buildings', 'buildings-zoom-hint',
            zoom >= BUILDINGS_ZOOM.min, BUILDINGS_ZOOM.min);
        _setCheckboxEnabled('layer-buildings-3d', 'label-buildings-3d', 'buildings-3d-zoom-hint',
            zoom >= BUILDINGS_ZOOM.min, BUILDINGS_ZOOM.min);

        // Remove layers if zoom went below range
        if (zoom < POLICE_ZOOM.min && policeLayer) {
            _map.removeLayer(policeLayer);
            policeLayer = null;
            lastPoliceBounds = null;
        }
        if (zoom < ROADS_ZOOM.min && roadsLayer) {
            _map.removeLayer(roadsLayer);
            roadsLayer = null;
            lastRoadsBounds = null;
        }
        if (zoom < BUILDINGS_ZOOM.min && buildingsLayer) {
            _map.removeLayer(buildingsLayer);
            buildingsLayer = null;
            lastBuildingsBounds = null;
        }
        if (zoom < BUILDINGS_ZOOM.min && buildings3DLayer) {
            _map.removeLayer(buildings3DLayer);
            buildings3DLayer = null;
            lastBuildings3DBounds = null;
        }
    }

    function _setCheckboxEnabled(checkboxId, labelId, hintId, enabled, minZoom) {
        const checkbox = document.getElementById(checkboxId);
        const label = document.getElementById(labelId);
        const hint = document.getElementById(hintId);
        if (!checkbox || !label) return;

        if (enabled) {
            label.classList.remove('layer-disabled');
            checkbox.disabled = false;
            if (hint) hint.textContent = '';
        } else {
            label.classList.add('layer-disabled');
            checkbox.disabled = true;
            checkbox.checked = false;
            if (hint) hint.textContent = `(זום ${minZoom}+ נדרש)`;
            // Reset visibility flag since we unchecked
            if (checkboxId === 'layer-police-osm') isPoliceEnabled = false;
            if (checkboxId === 'layer-roads') isRoadsEnabled = false;
            if (checkboxId === 'layer-buildings') isBuildingsEnabled = false;
            if (checkboxId === 'layer-buildings-3d') isBuildings3DEnabled = false;
        }
    }

    // ========== Internal: Debounced loading ==========

    function _debouncedLoad() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (isPoliceEnabled) _loadPolice();
            if (isRoadsEnabled) _loadRoads();
            if (isBuildingsEnabled) _loadBuildings();
            if (isBuildings3DEnabled) _loadBuildings3D();
        }, 500);
    }

    // ========== Internal: Load Roads ==========

    async function _loadRoads() {
        const zoom = _map.getZoom();
        if (zoom < ROADS_ZOOM.min) return;

        const bounds = _map.getBounds();
        if (_isBoundsContained(bounds, lastRoadsBounds)) return; // Already fetched for this area

        // Check area isn't too large
        if (_boundsArea(bounds) > 0.05) return;

        // Set loading state
        const label = document.getElementById('label-roads');
        if (label) label.classList.add('layer-loading');

        // Cancel previous request
        if (roadsAbort) roadsAbort.abort();
        roadsAbort = new AbortController();

        try {
            const bbox = _toBBoxStr(bounds);
            // Zoom-adaptive road types
            let roadFilter;
            if (zoom <= 14) {
                roadFilter = '["highway"~"motorway|trunk|primary|secondary"]';
            } else {
                roadFilter = '["highway"~"motorway|trunk|primary|secondary|tertiary|residential|service|living_street|pedestrian"]';
            }

            const query = `[out:json][timeout:15];(way${roadFilter}(${bbox}););out geom;`;
            const data = await _queryOverpass(query, roadsAbort.signal);
            if (!data) return;

            const geojson = osmtogeojson(data);

            if (roadsLayer) _map.removeLayer(roadsLayer);
            roadsLayer = L.geoJSON(geojson, {
                pane: 'roadsPane',
                style: (feature) => {
                    const hw = feature.properties.highway || 'default';
                    return {
                        color: ROAD_COLORS[hw] || ROAD_COLORS.default,
                        weight: ROAD_WIDTHS[hw] || ROAD_WIDTHS.default,
                        opacity: 0.8,
                    };
                },
                onEachFeature: (feature, layer) => {
                    const name = feature.properties.name || feature.properties.highway || '';
                    if (name) {
                        layer.bindTooltip(name, { direction: 'top', sticky: true });
                    }
                },
            });
            roadsLayer.addTo(_map);
            roadsLayer.bringToFront();
            // Bring stations on top
            const sl = TSRSViz.getStationsLayer();
            if (sl) sl.bringToFront();

            lastRoadsBounds = _expandBounds(bounds, 0.2);
        } catch (e) {
            if (e.name !== 'AbortError') console.warn('Roads load error:', e.message);
        } finally {
            if (label) label.classList.remove('layer-loading');
        }
    }

    // ========== Internal: Load Buildings ==========

    async function _loadBuildings() {
        const zoom = _map.getZoom();
        if (zoom < BUILDINGS_ZOOM.min) return;

        const bounds = _map.getBounds();
        if (_isBoundsContained(bounds, lastBuildingsBounds)) return;

        if (_boundsArea(bounds) > 0.02) return; // Buildings need tighter area limit

        const label = document.getElementById('label-buildings');
        if (label) label.classList.add('layer-loading');

        if (buildingsAbort) buildingsAbort.abort();
        buildingsAbort = new AbortController();

        try {
            const bbox = _toBBoxStr(bounds);
            const query = `[out:json][timeout:15];(way["building"](${bbox});relation["building"](${bbox}););out geom;`;
            const data = await _queryOverpass(query, buildingsAbort.signal);
            if (!data) return;

            const geojson = osmtogeojson(data);

            // Get current max flood depth from wave height
            const waveHeight = typeof TSRSControls !== 'undefined' ? TSRSControls.getWaveHeight() : 2.0;
            const maxFloodDepth = waveHeight * 0.7; // approximate max depth

            if (buildingsLayer) _map.removeLayer(buildingsLayer);
            buildingsLayer = L.geoJSON(geojson, {
                pane: 'buildingsPane',
                style: (feature) => _buildingFloodStyle(feature, maxFloodDepth),
                onEachFeature: (feature, layer) => {
                    const name = feature.properties.name || '';
                    const type = feature.properties.building || '';
                    const levels = _getBuildingLevels(feature);
                    const heightM = levels * 3;
                    const status = _getBuildingFloodStatus(heightM, maxFloodDepth, levels);
                    const statusText = status === 'shelter' ? '🔵 מקלט פוטנציאלי' :
                                       status === 'safe' ? '🟢 מעל עומק הצפה' :
                                       '🔴 מתחת לעומק הצפה';
                    const tip = `${name || type || 'מבנה'}<br>${levels} קומות (~${heightM}מ')<br>${statusText}<br>עומק הצפה מירבי: ${maxFloodDepth.toFixed(1)}מ'`;
                    layer.bindTooltip(tip, { direction: 'top', sticky: true });
                },
            });
            buildingsLayer.addTo(_map);
            buildingsLayer.bringToFront();
            const sl = TSRSViz.getStationsLayer();
            if (sl) sl.bringToFront();

            lastBuildingsBounds = _expandBounds(bounds, 0.2);
        } catch (e) {
            if (e.name !== 'AbortError') console.warn('Buildings load error:', e.message);
        } finally {
            if (label) label.classList.remove('layer-loading');
        }
    }

    // ========== Internal: Load 3D Buildings ==========

    async function _loadBuildings3D() {
        const zoom = _map.getZoom();
        if (zoom < BUILDINGS_ZOOM.min) return;

        const bounds = _map.getBounds();
        if (_isBoundsContained(bounds, lastBuildings3DBounds)) return;
        if (_boundsArea(bounds) > 0.02) return;

        const label = document.getElementById('label-buildings-3d');
        if (label) label.classList.add('layer-loading');

        if (buildings3DAbort) buildings3DAbort.abort();
        buildings3DAbort = new AbortController();

        try {
            const bbox = _toBBoxStr(bounds);
            const query = `[out:json][timeout:15];(way["building"](${bbox});relation["building"](${bbox}););out geom;`;
            const data = await _queryOverpass(query, buildings3DAbort.signal);
            if (!data) return;

            const geojson = osmtogeojson(data);

            if (buildings3DLayer) _map.removeLayer(buildings3DLayer);

            // Try OSMBuildings classic (if available)
            if (typeof OSMBuildings !== 'undefined') {
                buildings3DLayer = new OSMBuildings(_map).set(geojson);
            } else {
                // Fallback: CSS-based pseudo-3D extrusion using GeoJSON
                buildings3DLayer = _createPseudo3DLayer(geojson);
                buildings3DLayer.addTo(_map);
            }

            lastBuildings3DBounds = _expandBounds(bounds, 0.2);
            console.log(`3D buildings loaded: ${geojson.features.length} features`);
        } catch (e) {
            if (e.name !== 'AbortError') console.warn('3D buildings load error:', e.message);
        } finally {
            if (label) label.classList.remove('layer-loading');
        }
    }

    /**
     * Create pseudo-3D buildings as CLOSED BOXES.
     * Each building rendered as: base footprint + 4 side wall panels + roof.
     * Wall panels are quadrilaterals connecting each base edge to its roof edge.
     * Height = building:levels * 3m. Offset direction: NW (isometric).
     */
    function _createPseudo3DLayer(geojson) {
        const group = L.layerGroup();
        const waveHeight = typeof TSRSControls !== 'undefined' ? TSRSControls.getWaveHeight() : 2.0;
        const maxFloodDepth = waveHeight * 0.7;

        const sorted = geojson.features
            .filter(f => f.geometry && f.geometry.type === 'Polygon')
            .sort((a, b) => _getFeatureCentroidLat(a) - _getFeatureCentroidLat(b));

        sorted.forEach(feature => {
            const levels = _getBuildingLevels(feature);
            const heightM = levels * 3;
            const ring = feature.geometry.coordinates[0];
            if (!ring || ring.length < 4) return;

            // Colors by flood status
            let baseColor, wallColorLight, wallColorDark, roofColor, borderColor;
            if (heightM <= maxFloodDepth) {
                baseColor = '#7F1D1D'; wallColorLight = '#DC2626'; wallColorDark = '#991B1B';
                roofColor = '#EF4444'; borderColor = '#7F1D1D';
            } else if (levels >= 4) {
                baseColor = '#1E3A8A'; wallColorLight = '#2563EB'; wallColorDark = '#1D4ED8';
                roofColor = '#3B82F6'; borderColor = '#1E3A8A';
            } else {
                baseColor = '#047857'; wallColorLight = '#059669'; wallColorDark = '#065F46';
                roofColor = '#10B981'; borderColor = '#047857';
            }

            // Isometric offset per level (NW direction)
            const ox = -0.000015 * levels; // longitude offset (west)
            const oy = 0.000015 * levels;  // latitude offset (north)

            // 1. BASE footprint (ground level — dark)
            const basePoly = L.polygon(
                ring.map(c => [c[1], c[0]]),
                { fillColor: baseColor, fillOpacity: 0.6, color: borderColor, weight: 1, opacity: 0.7 }
            );
            group.addLayer(basePoly);

            // 2. WALL panels — one quad per edge connecting base vertex to roof vertex
            for (let i = 0; i < ring.length - 1; i++) {
                const b1 = ring[i];      // base vertex i
                const b2 = ring[i + 1];  // base vertex i+1
                const r1 = [b1[0] + ox, b1[1] + oy]; // roof vertex i
                const r2 = [b2[0] + ox, b2[1] + oy]; // roof vertex i+1

                // Determine wall brightness by face direction
                const edgeDx = b2[0] - b1[0];
                const edgeDy = b2[1] - b1[1];
                // Faces pointing south/east are "lit", north/west are "shadow"
                const isLit = (edgeDx > 0 || edgeDy < 0);
                const wColor = isLit ? wallColorLight : wallColorDark;

                const wallQuad = L.polygon([
                    [b1[1], b1[0]],  // base-left
                    [b2[1], b2[0]],  // base-right
                    [r2[1], r2[0]],  // roof-right
                    [r1[1], r1[0]],  // roof-left
                ], {
                    fillColor: wColor,
                    fillOpacity: 0.75,
                    color: borderColor,
                    weight: 0.5,
                    opacity: 0.6,
                });
                group.addLayer(wallQuad);
            }

            // 3. ROOF polygon (top — lighter, full offset)
            const name = feature.properties.name || feature.properties.building || '';
            const status = heightM <= maxFloodDepth ? '🔴 מתחת לעומק הצפה' :
                           levels >= 4 ? '🔵 מקלט פוטנציאלי' : '🟢 מעל עומק הצפה';

            const roofPoly = L.polygon(
                ring.map(c => [c[1] + oy, c[0] + ox]),
                {
                    fillColor: roofColor,
                    fillOpacity: 0.9,
                    color: borderColor,
                    weight: 1.5,
                    opacity: 0.9,
                }
            );
            roofPoly.bindTooltip(
                `<b>${name || 'מבנה'}</b><br>` +
                `🏢 ${levels} קומות (~${heightM} מ')<br>` +
                `${status}<br>` +
                `📐 גובה: ${heightM} מ' (${levels}×3)`,
                { direction: 'top', sticky: true }
            );
            group.addLayer(roofPoly);
        });

        return group;
    }

    function _getFeatureCentroidLat(feature) {
        try {
            const coords = feature.geometry.type === 'Polygon' ?
                feature.geometry.coordinates[0] :
                feature.geometry.coordinates[0][0];
            return coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        } catch (e) {
            return 0;
        }
    }

    // ========== Internal: Load Police Stations ==========

    async function _loadPolice() {
        const zoom = _map.getZoom();
        if (zoom < POLICE_ZOOM.min) return;

        const bounds = _map.getBounds();
        if (_isBoundsContained(bounds, lastPoliceBounds)) return;
        if (_boundsArea(bounds) > 0.5) return; // Police stations are sparse — allow wider area

        const label = document.getElementById('label-police-osm');
        if (label) label.classList.add('layer-loading');

        if (policeAbort) policeAbort.abort();
        policeAbort = new AbortController();

        try {
            const bbox = _toBBoxStr(bounds);
            const query = `[out:json][timeout:15];(node["amenity"="police"](${bbox});way["amenity"="police"](${bbox}););out center;`;
            const data = await _queryOverpass(query, policeAbort.signal);
            if (!data) return;

            if (policeLayer) _map.removeLayer(policeLayer);
            policeLayer = L.layerGroup();

            const elements = data.elements || [];
            elements.forEach(el => {
                const lat = el.lat || (el.center && el.center.lat);
                const lon = el.lon || (el.center && el.center.lon);
                if (!lat || !lon) return;

                const name = (el.tags && el.tags['name:he']) || (el.tags && el.tags.name) || 'תחנת משטרה';
                const marker = L.marker([lat, lon], { icon: POLICE_ICON, pane: 'policePane' });
                marker.bindTooltip(`<b>🛡️ ${name}</b>`, { direction: 'top' });
                marker.bindPopup(`
                    <div style="direction:rtl; font-family:var(--font); min-width:180px">
                        <h3 style="color:#14B8A6; margin-bottom:6px">🛡️ ${name}</h3>
                        <div style="font-size:12px; color:#94A3B8">תחנת משטרת ישראל</div>
                        ${el.tags && el.tags.phone ? `<div style="font-size:12px; margin-top:4px">📞 ${el.tags.phone}</div>` : ''}
                        ${el.tags && el.tags['addr:street'] ? `<div style="font-size:12px">📍 ${el.tags['addr:street']}</div>` : ''}
                    </div>
                `, { maxWidth: 250, className: 'tsrs-popup-wrapper' });
                policeLayer.addLayer(marker);
            });

            policeLayer.addTo(_map);
            lastPoliceBounds = _expandBounds(bounds, 0.3);
            console.log(`Police stations loaded: ${elements.length} found`);
        } catch (e) {
            if (e.name !== 'AbortError') console.warn('Police load error:', e.message);
        } finally {
            if (label) label.classList.remove('layer-loading');
        }
    }

    // ========== Internal: Building Flood Analysis ==========

    function _getBuildingLevels(feature) {
        const levels = parseInt(feature.properties['building:levels']) ||
                       parseInt(feature.properties['levels']) || 2; // default 2 floors
        return Math.max(1, levels);
    }

    function _getBuildingFloodStatus(heightM, maxFloodDepth, levels) {
        if (levels >= 4 && heightM > maxFloodDepth) return 'shelter'; // Potential vertical shelter
        if (heightM > maxFloodDepth) return 'safe';                    // Above flood level
        return 'submerged';                                             // Below flood level
    }

    function _buildingFloodStyle(feature, maxFloodDepth) {
        const levels = _getBuildingLevels(feature);
        const heightM = levels * 3; // ~3m per floor
        const status = _getBuildingFloodStatus(heightM, maxFloodDepth, levels);

        const colors = {
            submerged: { fill: '#EF4444', border: '#B91C1C', opacity: 0.6 },  // Red
            safe:      { fill: '#10B981', border: '#059669', opacity: 0.5 },  // Green
            shelter:   { fill: '#3B82F6', border: '#1D4ED8', opacity: 0.6 },  // Blue
        };
        const c = colors[status];
        return {
            fillColor: c.fill,
            fillOpacity: c.opacity,
            color: c.border,
            weight: 1,
            opacity: 0.8,
        };
    }

    // ========== Internal: Overpass API ==========

    async function _queryOverpass(query, signal) {
        for (const endpoint of OVERPASS_ENDPOINTS) {
            try {
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'data=' + encodeURIComponent(query),
                    signal: signal,
                });
                if (resp.ok) return await resp.json();
            } catch (e) {
                if (e.name === 'AbortError') throw e;
                // Try next endpoint
            }
        }
        console.warn('All Overpass endpoints failed');
        return null;
    }

    // ========== Internal: Geometry helpers ==========

    function _toBBoxStr(bounds) {
        const s = bounds.getSouth(), w = bounds.getWest();
        const n = bounds.getNorth(), e = bounds.getEast();
        return `${s},${w},${n},${e}`;
    }

    function _boundsArea(bounds) {
        const dLat = bounds.getNorth() - bounds.getSouth();
        const dLng = bounds.getEast() - bounds.getWest();
        return dLat * dLng;
    }

    function _expandBounds(bounds, factor) {
        const dLat = (bounds.getNorth() - bounds.getSouth()) * factor;
        const dLng = (bounds.getEast() - bounds.getWest()) * factor;
        return L.latLngBounds(
            [bounds.getSouth() - dLat, bounds.getWest() - dLng],
            [bounds.getNorth() + dLat, bounds.getEast() + dLng]
        );
    }

    function _isBoundsContained(inner, outer) {
        if (!outer) return false;
        return outer.contains(inner);
    }

    return { init, setRoadsVisible, setBuildingsVisible, setBuildings3DVisible, setPoliceVisible };
})();
