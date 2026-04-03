/**
 * TSRS Inundation Layer Module
 * Manages flood zone visualization as HEATMAP + polygon overlay.
 * Heatmap intensity changes dynamically with wave height slider.
 */
const TSRSInundation = (() => {
    let inundationLayer = null;   // GeoJSON polygon outlines
    let heatmapLayer = null;      // L.heatLayer for depth visualization
    let coastlineLayer = null;
    let isVisible = true;
    let isCoastlineVisible = true;
    const API_BASE = TSRSViz.API_BASE;
    const HAS_API = window.location.port === '8000' || window.location.port === '5380';

    // ===== Heatmap color gradient (blue → yellow → orange → red) =====
    const HEATMAP_GRADIENT = {
        0.0: '#0000FF',   // Blue — minimal
        0.2: '#00BFFF',   // Deep sky blue
        0.4: '#00FF80',   // Green
        0.55: '#FFFF00',  // Yellow
        0.7: '#FFA500',   // Orange
        0.85: '#FF4500',  // Red-orange
        1.0: '#FF0000',   // Red — maximum depth
    };

    function getDepthColor(depth) {
        if (depth >= 5) return '#EF4444';
        if (depth >= 2) return '#F97316';
        return '#EAB308';
    }

    // Polygon style — thin dashed outlines only (heatmap provides fill)
    function inundationStyle(feature) {
        return {
            fillColor: 'transparent',
            fillOpacity: 0,
            color: '#1E40AF',
            weight: 1.5,
            dashArray: '6 4',
            opacity: 0.6,
        };
    }

    // ===== Generate heatmap points from GeoJSON polygons =====
    function _generateHeatPoints(geojson, waveHeight) {
        const points = [];
        const maxDepth = waveHeight * 1.0; // max possible depth = wave height

        if (!geojson || !geojson.features) return points;

        geojson.features.forEach(feature => {
            const depth = feature.properties.max_depth_m || 0;
            const intensity = Math.min(depth / Math.max(maxDepth, 1), 1.0); // 0-1 normalized

            // Extract points from polygon coordinates
            const coords = feature.geometry.coordinates;
            if (!coords || !coords[0]) return;

            const ring = coords[0]; // outer ring
            // Generate grid of points within the polygon bounding box
            const lats = ring.map(c => c[1]);
            const lons = ring.map(c => c[0]);
            const minLat = Math.min(...lats), maxLat = Math.max(...lats);
            const minLon = Math.min(...lons), maxLon = Math.max(...lons);

            // Centroid point with full intensity
            const cLat = (minLat + maxLat) / 2;
            const cLon = (minLon + maxLon) / 2;
            points.push([cLat, cLon, intensity]);

            // Additional points along the polygon edges for better coverage
            for (let i = 0; i < ring.length - 1; i++) {
                const lat = ring[i][1];
                const lon = ring[i][0];
                points.push([lat, lon, intensity * 0.8]);

                // Mid-points for denser coverage
                const midLat = (ring[i][1] + ring[i + 1][1]) / 2;
                const midLon = (ring[i][0] + ring[i + 1][0]) / 2;
                points.push([midLat, midLon, intensity * 0.9]);
            }

            // Interior grid points for larger polygons
            const latStep = (maxLat - minLat) / 4;
            const lonStep = (maxLon - minLon) / 4;
            if (latStep > 0 && lonStep > 0) {
                for (let lat = minLat; lat <= maxLat; lat += latStep) {
                    for (let lon = minLon; lon <= maxLon; lon += lonStep) {
                        // Gradient: intensity decreases with distance from coast (higher lon = more inland)
                        const inlandFactor = 1.0 - ((lon - minLon) / (maxLon - minLon)) * 0.4;
                        points.push([lat, lon, intensity * inlandFactor]);
                    }
                }
            }
        });

        return points;
    }

    async function loadInundation(map, waveHeight) {
        try {
            let data = null;
            if (FirebaseConfig.isReady()) {
                data = await FirebaseConfig.getInundation(waveHeight);
            }
            if (!data && HAS_API) {
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

            // Remove previous layers
            if (inundationLayer) map.removeLayer(inundationLayer);
            if (heatmapLayer) map.removeLayer(heatmapLayer);

            // 1. Create heatmap layer
            const heatPoints = _generateHeatPoints(data, waveHeight);
            if (heatPoints.length > 0 && typeof L.heatLayer !== 'undefined') {
                heatmapLayer = L.heatLayer(heatPoints, {
                    radius: _getHeatRadius(waveHeight),
                    blur: 20,
                    maxZoom: 17,
                    max: 1.0,
                    minOpacity: 0.3,
                    gradient: HEATMAP_GRADIENT,
                });
            }

            // 2. Create polygon outline layer (dashed blue borders)
            inundationLayer = L.geoJSON(data, {
                style: inundationStyle,
                onEachFeature: (feature, layer) => {
                    const depth = feature.properties.max_depth_m;
                    const desc = feature.properties.max_depth_desc || '';
                    layer.bindTooltip(
                        `<b>עומק מירבי: ${depth} מ'</b><br>${desc}`,
                        { direction: 'top' }
                    );
                },
            });

            if (isVisible) {
                if (heatmapLayer) heatmapLayer.addTo(map);
                inundationLayer.addTo(map);
                // Keep stations on top
                const stationsLayer = TSRSViz.getStationsLayer();
                if (stationsLayer) stationsLayer.bringToFront();
            }

            return inundationLayer;
        } catch (err) {
            console.error('Error loading inundation:', err);
            return null;
        }
    }

    // Heatmap radius scales with wave height (bigger waves = wider spread)
    function _getHeatRadius(waveHeight) {
        if (waveHeight >= 7) return 35;
        if (waveHeight >= 5) return 30;
        if (waveHeight >= 3) return 25;
        return 18;
    }

    async function loadCoastline(map) {
        try {
            let data = null;
            if (FirebaseConfig.isReady()) {
                data = await FirebaseConfig.getCoastline();
            }
            if (!data && HAS_API) {
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
        if (visible) {
            if (heatmapLayer) map.addLayer(heatmapLayer);
            if (inundationLayer) map.addLayer(inundationLayer);
        } else {
            if (heatmapLayer) map.removeLayer(heatmapLayer);
            if (inundationLayer) map.removeLayer(inundationLayer);
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
