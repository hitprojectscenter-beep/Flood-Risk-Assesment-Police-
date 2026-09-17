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

    // --- Panes for z-ordering + canvas renderers ---
    // Thousands of building polygons render far faster on a shared canvas
    // than as individual SVG DOM nodes.
    let _panesCreated = false;
    let _renderer2D = null;
    let _renderer3D = null;
    function _ensurePanes(map) {
        if (_panesCreated) return;
        map.createPane('roadsPane').style.zIndex = 450;
        map.createPane('buildingsPane').style.zIndex = 445;
        map.createPane('buildings3DPane').style.zIndex = 446;
        map.createPane('policePane').style.zIndex = 460;
        _renderer2D = L.canvas({ pane: 'buildingsPane' });
        _renderer3D = L.canvas({ pane: 'buildings3DPane' });
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
    // mail.ru mirror first: overpass-api.de intermittently refuses (406/504)
    // and kumi.systems hangs without responding.
    const OVERPASS_ENDPOINTS = [
        'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
    ];
    const ENDPOINT_TIMEOUT_MS = 20000; // per-endpoint cap so a hung mirror can't stall the chain

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
            _buildings3DParts = [];
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
            _buildings3DParts = [];
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
            if (!data) { _showLoadError('roads-zoom-hint'); return; }

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
            // Local tiles first: instant and reliable across the coastal band;
            // Overpass only where local coverage ends (inland cities)
            const loadBounds = _expandBounds(bounds, 0.2);
            let geojson = await _loadLocalBuildingTiles(loadBounds);
            if (!geojson) {
                const bbox = _toBBoxStr(bounds);
                const query = `[out:json][timeout:15];(way["building"](${bbox});relation["building"](${bbox}););out geom;`;
                const data = await _queryOverpass(query, buildingsAbort.signal);
                if (data) geojson = osmtogeojson(data);
            }
            // Only build Leaflet paths for features near the viewport —
            // tiles can hold far more than is visible
            geojson = _cropToBounds(geojson, loadBounds);
            if (!geojson || !geojson.features || geojson.features.length === 0) {
                _showLoadError('buildings-zoom-hint');
                return;
            }

            const waveHeight = typeof TSRSControls !== 'undefined' ? TSRSControls.getWaveHeight() : 2.0;

            if (buildingsLayer) _map.removeLayer(buildingsLayer);
            buildingsLayer = L.geoJSON(geojson, {
                renderer: _renderer2D,
                pane: 'buildingsPane',
                style: (feature) => _buildingFloodStyle(feature, waveHeight),
                onEachFeature: (feature, layer) => {
                    layer.bindTooltip(_buildingTooltip(feature, waveHeight), { direction: 'top', sticky: true });
                },
            });
            buildingsLayer.addTo(_map);

            lastBuildingsBounds = loadBounds;
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
            // Local tiles first (same source as the 2D buildings layer)
            const loadBounds = _expandBounds(bounds, 0.2);
            let geojson = await _loadLocalBuildingTiles(loadBounds);
            if (!geojson) {
                const bbox = _toBBoxStr(bounds);
                const query = `[out:json][timeout:15];(way["building"](${bbox});relation["building"](${bbox}););out geom;`;
                const data = await _queryOverpass(query, buildings3DAbort.signal);
                if (data) geojson = osmtogeojson(data);
            }
            geojson = _cropToBounds(geojson, loadBounds);
            if (!geojson || !geojson.features || geojson.features.length === 0) {
                _showLoadError('buildings-3d-zoom-hint');
                return;
            }

            if (buildings3DLayer) _map.removeLayer(buildings3DLayer);
            buildings3DLayer = _createPseudo3DLayer(geojson);
            buildings3DLayer.addTo(_map);

            lastBuildings3DBounds = loadBounds;
            console.log(`3D buildings loaded: ${geojson.features.length} features`);
        } catch (e) {
            if (e.name !== 'AbortError') console.warn('3D buildings load error:', e.message);
        } finally {
            if (label) label.classList.remove('layer-loading');
        }
    }

    // Color palettes per flood status (base/walls/roof shades)
    const BUILDING_PALETTES = {
        submerged: { base: '#7F1D1D', lit: '#DC2626', dark: '#991B1B', roof: '#EF4444', border: '#7F1D1D' },
        shelter:   { base: '#1E3A8A', lit: '#2563EB', dark: '#1D4ED8', roof: '#3B82F6', border: '#1E3A8A' },
        safe:      { base: '#047857', lit: '#059669', dark: '#065F46', roof: '#10B981', border: '#047857' },
    };

    // Parts registry so a wave-height change recolors in place (no reload)
    let _buildings3DParts = [];

    /**
     * Create pseudo-3D buildings as CLOSED BOXES on a canvas renderer.
     * Per building only 4 canvas paths: base footprint, lit walls (one
     * MultiPolygon), shadow walls (one MultiPolygon), roof — instead of a
     * separate polygon per wall edge. Only the roof is interactive.
     * Height = building:levels * 3m. Offset direction: NW (isometric).
     */
    function _createPseudo3DLayer(geojson) {
        const group = L.layerGroup();
        const waveHeight = typeof TSRSControls !== 'undefined' ? TSRSControls.getWaveHeight() : 2.0;
        _buildings3DParts = [];

        const sorted = geojson.features
            .filter(f => f.geometry && f.geometry.type === 'Polygon')
            .sort((a, b) => _getFeatureCentroidLat(a) - _getFeatureCentroidLat(b));

        sorted.forEach(feature => {
            const levels = _getBuildingLevels(feature);
            const heightM = levels * 3;
            const ring = feature.geometry.coordinates[0];
            if (!ring || ring.length < 4) return;

            const status = _getBuildingFloodStatus(heightM, waveHeight, levels);
            const pal = BUILDING_PALETTES[status];

            // Isometric offset per level (NW direction)
            const ox = -0.000015 * levels; // longitude offset (west)
            const oy = 0.000015 * levels;  // latitude offset (north)

            // 1. BASE footprint (ground level — dark)
            const basePoly = L.polygon(ring.map(c => [c[1], c[0]]), {
                renderer: _renderer3D, pane: 'buildings3DPane', interactive: false,
                fillColor: pal.base, fillOpacity: 0.6, color: pal.border, weight: 1, opacity: 0.7,
            });
            group.addLayer(basePoly);

            // 2. WALL quads, merged into lit/shadow MultiPolygons
            const litRings = [], darkRings = [];
            for (let i = 0; i < ring.length - 1; i++) {
                const b1 = ring[i], b2 = ring[i + 1];
                const quad = [
                    [b1[1], b1[0]],            // base-left
                    [b2[1], b2[0]],            // base-right
                    [b2[1] + oy, b2[0] + ox],  // roof-right
                    [b1[1] + oy, b1[0] + ox],  // roof-left
                ];
                // Faces pointing south/east are "lit", north/west are "shadow"
                ((b2[0] - b1[0] > 0 || b2[1] - b1[1] < 0) ? litRings : darkRings).push([quad]);
            }
            const mkWalls = (rings, color) => rings.length ? L.polygon(rings, {
                renderer: _renderer3D, pane: 'buildings3DPane', interactive: false,
                fillColor: color, fillOpacity: 0.75, color: pal.border, weight: 0.5, opacity: 0.6,
            }) : null;
            const wallsLit = mkWalls(litRings, pal.lit);
            const wallsDark = mkWalls(darkRings, pal.dark);
            if (wallsLit) group.addLayer(wallsLit);
            if (wallsDark) group.addLayer(wallsDark);

            // 3. ROOF polygon (top — lighter, full offset, interactive)
            const roofPoly = L.polygon(ring.map(c => [c[1] + oy, c[0] + ox]), {
                renderer: _renderer3D, pane: 'buildings3DPane',
                fillColor: pal.roof, fillOpacity: 0.9, color: pal.border, weight: 1.5, opacity: 0.9,
            });
            roofPoly.bindTooltip(_roofTooltip(feature, levels, heightM, status), { direction: 'top', sticky: true });
            group.addLayer(roofPoly);

            _buildings3DParts.push({ feature, levels, heightM, base: basePoly, wallsLit, wallsDark, roof: roofPoly });
        });

        return group;
    }

    function _roofTooltip(feature, levels, heightM, status) {
        // building=yes is OSM's generic tag — not a meaningful label
        const rawType = feature.properties.building || '';
        const name = feature.properties.name || (rawType === 'yes' ? '' : rawType);
        return `<b>${name || 'מבנה'}</b><br>` +
               `🏢 ${levels} קומות (~${heightM} מ')<br>` +
               `${_statusText(status)}<br>` +
               `📐 גובה: ${heightM} מ' (${levels}×3)`;
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
            if (!data) { _showLoadError('police-zoom-hint'); return; }

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

    /**
     * Classification vs the WAVE HEIGHT directly:
     *   red    — building height below the wave height
     *   green  — building height above the wave height
     *   blue   — above the wave AND 4+ floors → potential vertical shelter
     */
    function _getBuildingFloodStatus(heightM, waveHeight, levels) {
        if (heightM < waveHeight) return 'submerged'; // lower than the wave
        if (levels >= 4) return 'shelter';            // tall enough to shelter vertically
        return 'safe';                                // above the wave height
    }

    function _statusText(status) {
        return status === 'shelter' ? '🔵 מקלט פוטנציאלי' :
               status === 'safe' ? '🟢 גבוה מגובה הגל' :
               '🔴 נמוך מגובה הגל';
    }

    function _buildingTooltip(feature, waveHeight) {
        const name = feature.properties.name || '';
        // building=yes is OSM's generic tag — not a meaningful label
        const rawType = feature.properties.building || '';
        const type = rawType === 'yes' ? '' : rawType;
        const levels = _getBuildingLevels(feature);
        const heightM = levels * 3;
        const status = _getBuildingFloodStatus(heightM, waveHeight, levels);
        return `${name || type || 'מבנה'}<br>${levels} קומות (~${heightM}מ')<br>${_statusText(status)}<br>גובה גל: ${waveHeight.toFixed(1)}מ'`;
    }

    function _buildingFloodStyle(feature, waveHeight) {
        const levels = _getBuildingLevels(feature);
        const heightM = levels * 3; // ~3m per floor
        const status = _getBuildingFloodStatus(heightM, waveHeight, levels);

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

    // ---- In-place recoloring on wave-height change (no layer reload) ----

    function _recolorBuildings2D(waveHeight) {
        if (!buildingsLayer) return;
        buildingsLayer.eachLayer(l => {
            if (!l.feature) return;
            l.setStyle(_buildingFloodStyle(l.feature, waveHeight));
            if (l.getTooltip()) l.setTooltipContent(_buildingTooltip(l.feature, waveHeight));
        });
    }

    function _recolorBuildings3D(waveHeight) {
        _buildings3DParts.forEach(p => {
            const status = _getBuildingFloodStatus(p.heightM, waveHeight, p.levels);
            const pal = BUILDING_PALETTES[status];
            p.base.setStyle({ fillColor: pal.base, color: pal.border });
            if (p.wallsLit) p.wallsLit.setStyle({ fillColor: pal.lit, color: pal.border });
            if (p.wallsDark) p.wallsDark.setStyle({ fillColor: pal.dark, color: pal.border });
            p.roof.setStyle({ fillColor: pal.roof, color: pal.border });
            if (p.roof.getTooltip()) p.roof.setTooltipContent(_roofTooltip(p.feature, p.levels, p.heightM, status));
        });
    }

    // ========== Internal: Overpass API ==========

    // Overpass rate-limits concurrent queries per IP (returns 504/429),
    // so requests are serialized: only one query is in flight at a time.
    let _overpassChain = Promise.resolve();

    function _queryOverpass(query, signal) {
        const run = _overpassChain.then(
            () => _queryOverpassNow(query, signal),
            () => _queryOverpassNow(query, signal)
        );
        _overpassChain = run.catch(() => {});
        return run;
    }

    // Show a temporary error hint next to the layer label when all endpoints fail
    function _showLoadError(hintId) {
        const hint = document.getElementById(hintId);
        if (!hint) return;
        const msg = (typeof I18n !== 'undefined') ? I18n.t('layer_load_error') : 'שגיאת טעינה — נסו שוב';
        hint.textContent = '⚠️ ' + msg;
        setTimeout(() => {
            if (hint.textContent.startsWith('⚠️')) hint.textContent = '';
        }, 6000);
    }

    async function _queryOverpassNow(query, signal) {
        for (const endpoint of OVERPASS_ENDPOINTS) {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), ENDPOINT_TIMEOUT_MS);
            const onAbort = () => ctrl.abort();
            if (signal) signal.addEventListener('abort', onAbort, { once: true });
            try {
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'data=' + encodeURIComponent(query),
                    signal: ctrl.signal,
                });
                if (resp.ok) return await resp.json();
            } catch (e) {
                // Rethrow only when the CALLER aborted (new map view);
                // a per-endpoint timeout just moves on to the next mirror.
                if (signal && signal.aborted) throw e;
            } finally {
                clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', onAbort);
            }
        }
        console.warn('All Overpass endpoints failed');
        return null;
    }

    // ========== Internal: Local building tiles ==========
    // Pre-generated from the Geofabrik OSM shapefile for the Mediterranean
    // coastal band (backend/generate_building_tiles.py), with real OSM
    // building:levels baked in — buildings and 3D layers stay functional
    // even when every Overpass endpoint is down.

    const LOCAL_TILE_SIZE = 0.02; // degrees, must match the generator
    let _localTilesIndex = null;  // Set of "x_y" keys ({} when unavailable)
    const _localTileCache = {};   // key -> features array

    async function _getLocalTilesIndex() {
        if (_localTilesIndex) return _localTilesIndex;
        try {
            const resp = await fetch('data/buildings_tiles/index.json');
            _localTilesIndex = resp.ok ? new Set(await resp.json()) : new Set();
        } catch (e) {
            _localTilesIndex = new Set();
        }
        return _localTilesIndex;
    }

    async function _loadLocalBuildingTiles(bounds) {
        const index = await _getLocalTilesIndex();
        const keys = [];
        const x0 = Math.floor(bounds.getWest() / LOCAL_TILE_SIZE);
        const x1 = Math.floor(bounds.getEast() / LOCAL_TILE_SIZE);
        const y0 = Math.floor(bounds.getSouth() / LOCAL_TILE_SIZE);
        const y1 = Math.floor(bounds.getNorth() / LOCAL_TILE_SIZE);
        for (let x = x0; x <= x1; x++) {
            for (let y = y0; y <= y1; y++) {
                const key = `${x}_${y}`;
                if (index.has(key)) keys.push(key);
            }
        }
        if (keys.length === 0) return null;

        const lists = await Promise.all(keys.map(async key => {
            if (_localTileCache[key]) return _localTileCache[key];
            try {
                const resp = await fetch(`data/buildings_tiles/${key}.json`);
                if (!resp.ok) return [];
                const fc = await resp.json();
                _localTileCache[key] = fc.features || [];
                return _localTileCache[key];
            } catch (e) {
                return [];
            }
        }));
        const features = [].concat(...lists);
        return features.length ? { type: 'FeatureCollection', features } : null;
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

    // Keep only features whose first vertex falls inside the given bounds —
    // avoids building Leaflet paths for far-off-screen tile content
    function _cropToBounds(geojson, bounds) {
        if (!geojson || !geojson.features) return geojson;
        const features = geojson.features.filter(f => {
            try {
                const g = f.geometry;
                const c = g.type === 'Polygon' ? g.coordinates[0][0] : g.coordinates[0][0][0];
                return bounds.contains([c[1], c[0]]);
            } catch (e) {
                return false;
            }
        });
        return { type: 'FeatureCollection', features };
    }

    /**
     * Recolor loaded building layers when the wave height changes — their
     * classification (red/green/blue shelter) depends on it. Styles are
     * updated IN PLACE via setStyle (no geometry rebuild), so the refresh
     * is immediate.
     */
    function refreshForWaveChange() {
        const wave = typeof TSRSControls !== 'undefined' ? TSRSControls.getWaveHeight() : 2.0;
        if (buildingsLayer) _recolorBuildings2D(wave);
        else if (isBuildingsEnabled) _loadBuildings();
        if (buildings3DLayer) _recolorBuildings3D(wave);
        else if (isBuildings3DEnabled) _loadBuildings3D();
    }

    return { init, setRoadsVisible, setBuildingsVisible, setBuildings3DVisible, setPoliceVisible, refreshForWaveChange };
})();
