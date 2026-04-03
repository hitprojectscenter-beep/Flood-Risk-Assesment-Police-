/**
 * TSRS Inundation Layer Module
 * Manages flood zone visualization based on wave height.
 */
const TSRSInundation = (() => {
    let inundationLayer = null;
    let coastlineLayer = null;
    let isVisible = true;
    let isCoastlineVisible = true;
    const API_BASE = TSRSViz.API_BASE;

    function getDepthColor(depth) {
        if (depth >= 5) return '#EF4444'; // Red — severe
        if (depth >= 2) return '#F97316'; // Orange — moderate
        return '#EAB308';                  // Yellow — light
    }

    function inundationStyle(feature) {
        const depth = feature.properties.max_depth_m;
        return {
            fillColor: getDepthColor(depth),
            fillOpacity: 0.45,
            color: '#1E40AF',
            weight: 1.5,
            dashArray: '6 4',
            opacity: 0.7,
        };
    }

    async function loadInundation(map, waveHeight) {
        try {
            // Fallback chain: Firebase → API → Local JSON
            let data = null;
            if (FirebaseConfig.isReady()) {
                data = await FirebaseConfig.getInundation(waveHeight);
            }
            if (!data) {
                try {
                    const resp = await fetch(`${API_BASE}/api/inundation?wave_height=${waveHeight}`);
                    if (resp.ok) data = await resp.json();
                } catch(e) {}
            }
            if (!data) {
                try {
                    const resp = await fetch('data/inundation.json');
                    if (resp.ok) {
                        const all = await resp.json();
                        const key = `wh_${waveHeight.toFixed(1).replace('.', '_')}`;
                        data = all[key];
                    }
                } catch(e) {}
            }
            if (!data) { console.warn('No inundation data'); return null; }

            if (inundationLayer) {
                map.removeLayer(inundationLayer);
            }

            inundationLayer = L.geoJSON(data, {
                style: inundationStyle,
                onEachFeature: (feature, layer) => {
                    layer.bindTooltip(
                        `עומק מקסימלי: ${feature.properties.max_depth_m} מ'`,
                        { direction: 'top' }
                    );
                },
            });

            if (isVisible) {
                inundationLayer.addTo(map);
                // Make sure stations are on top
                const stationsLayer = TSRSViz.getStationsLayer();
                if (stationsLayer) stationsLayer.bringToFront();
            }

            return inundationLayer;
        } catch (err) {
            console.error('Error loading inundation:', err);
            return null;
        }
    }

    async function loadCoastline(map) {
        try {
            let data = null;
            if (FirebaseConfig.isReady()) {
                data = await FirebaseConfig.getCoastline();
            }
            if (!data) {
                try {
                    const resp = await fetch(`${API_BASE}/api/coastline`);
                    if (resp.ok) data = await resp.json();
                } catch(e) {}
            }
            if (!data) {
                try {
                    const resp = await fetch('data/coastline.json');
                    if (resp.ok) data = await resp.json();
                } catch(e) {}
            }
            if (!data) { console.warn('No coastline data'); return; }

            coastlineLayer = L.geoJSON(data, {
                style: {
                    color: '#0EA5E9',
                    weight: 3,
                    opacity: 0.8,
                    dashArray: '',
                },
            });

            if (isCoastlineVisible) {
                coastlineLayer.addTo(map);
            }
        } catch (err) {
            console.error('Error loading coastline:', err);
        }
    }

    // Debounced update for slider changes
    let updateTimeout = null;
    function updateLayer(map, waveHeight) {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            loadInundation(map, waveHeight);
        }, 200);
    }

    function setVisible(map, visible) {
        isVisible = visible;
        if (inundationLayer) {
            visible ? map.addLayer(inundationLayer) : map.removeLayer(inundationLayer);
        }
    }

    function setCoastlineVisible(map, visible) {
        isCoastlineVisible = visible;
        if (coastlineLayer) {
            visible ? map.addLayer(coastlineLayer) : map.removeLayer(coastlineLayer);
        }
    }

    return { loadInundation, loadCoastline, updateLayer, setVisible, setCoastlineVisible };
})();
