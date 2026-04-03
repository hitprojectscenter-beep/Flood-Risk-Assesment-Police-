/**
 * TSRS OSM Overlays Module
 * Dynamically loads roads and buildings from the Overpass API
 * with zoom-dependent visibility and checkbox enable/disable.
 */
const TSRSOverlays = (() => {
    // --- State ---
    let roadsLayer = null;
    let buildingsLayer = null;
    let isRoadsEnabled = false;
    let isBuildingsEnabled = false;
    let roadsAbort = null;
    let buildingsAbort = null;
    let lastRoadsBounds = null;
    let lastBuildingsBounds = null;
    let debounceTimer = null;
    let _map = null;

    // --- Panes for z-ordering (above default overlayPane) ---
    let _panesCreated = false;
    function _ensurePanes(map) {
        if (_panesCreated) return;
        map.createPane('roadsPane').style.zIndex = 450;
        map.createPane('buildingsPane').style.zIndex = 445;
        _panesCreated = true;
    }

    // --- Zoom ranges ---
    const ROADS_ZOOM = { min: 13, max: 18 };
    const BUILDINGS_ZOOM = { min: 15, max: 18 };

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
        isRoadsEnabled = visible;
        if (visible) {
            _loadRoads();
        } else {
            if (roadsLayer) { map.removeLayer(roadsLayer); roadsLayer = null; }
            lastRoadsBounds = null;
        }
    }

    function setBuildingsVisible(map, visible) {
        isBuildingsEnabled = visible;
        if (visible) {
            _loadBuildings();
        } else {
            if (buildingsLayer) { map.removeLayer(buildingsLayer); buildingsLayer = null; }
            lastBuildingsBounds = null;
        }
    }

    // ========== Internal: Checkbox state management ==========

    function _updateCheckboxStates() {
        const zoom = _map.getZoom();

        _setCheckboxEnabled('layer-roads', 'label-roads', 'roads-zoom-hint',
            zoom >= ROADS_ZOOM.min, ROADS_ZOOM.min);
        _setCheckboxEnabled('layer-buildings', 'label-buildings', 'buildings-zoom-hint',
            zoom >= BUILDINGS_ZOOM.min, BUILDINGS_ZOOM.min);

        // Remove layers if zoom went below range
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
            if (checkboxId === 'layer-roads') isRoadsEnabled = false;
            if (checkboxId === 'layer-buildings') isBuildingsEnabled = false;
        }
    }

    // ========== Internal: Debounced loading ==========

    function _debouncedLoad() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (isRoadsEnabled) _loadRoads();
            if (isBuildingsEnabled) _loadBuildings();
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

            if (buildingsLayer) _map.removeLayer(buildingsLayer);
            buildingsLayer = L.geoJSON(geojson, {
                pane: 'buildingsPane',
                style: () => ({
                    fillColor: '#8B7355',
                    fillOpacity: 0.5,
                    color: '#6B5B45',
                    weight: 1,
                    opacity: 0.7,
                }),
                onEachFeature: (feature, layer) => {
                    const name = feature.properties.name || '';
                    const type = feature.properties.building || '';
                    const tip = name || (type !== 'yes' ? type : '');
                    if (tip) {
                        layer.bindTooltip(tip, { direction: 'top', sticky: true });
                    }
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

    return { init, setRoadsVisible, setBuildingsVisible };
})();
