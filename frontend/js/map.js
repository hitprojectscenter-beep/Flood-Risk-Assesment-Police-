/**
 * TSRS Map Module — Leaflet + GOVMAP WMS + Hillshade Integration
 * Manages base layers, overlays, and map initialization.
 */
const TSRSMap = (() => {
    let map = null;
    let baseLayers = {};
    let overlayLayers = {};

    const ISRAEL_CENTER = [31.5, 34.8];
    const ISRAEL_BOUNDS = [[28.5, 33.0], [34.0, 36.5]];
    const COAST_CENTER = [32.0, 34.78];

    function init() {
        map = L.map('map', {
            center: COAST_CENTER,
            zoom: 9,
            minZoom: 7,
            maxZoom: 18,
            zoomControl: false,
            maxBounds: ISRAEL_BOUNDS,
        });

        L.control.zoom({ position: 'topleft' }).addTo(map);
        L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

        _addBaseLayers();
        _addLayerControl();

        return map;
    }

    function _addBaseLayers() {
        // === Base Map Tiles ===

        // OpenStreetMap
        const osmStandard = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19,
            }
        );

        // CartoDB Voyager (modern, clean)
        const cartoVoyager = L.tileLayer(
            'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '© <a href="https://carto.com/">CARTO</a>',
                maxZoom: 19,
            }
        );

        // CartoDB Dark Matter
        const cartoDark = L.tileLayer(
            'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© <a href="https://carto.com/">CARTO</a>',
                maxZoom: 19,
            }
        );

        // ESRI World Imagery (satellite)
        const esriImagery = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                attribution: '© ESRI',
                maxZoom: 18,
            }
        );

        // === Hillshade Overlays ===

        // ESRI World Hillshade (free, no token) — enhanced for terrain visibility
        map.createPane('hillshadePane');
        map.getPane('hillshadePane').style.zIndex = 250;
        map.getPane('hillshadePane').style.mixBlendMode = 'multiply';

        const esriHillshade = L.tileLayer(
            'https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', {
                attribution: '© ESRI Hillshade',
                maxZoom: 18,
                opacity: 0.55,
                pane: 'hillshadePane',
            }
        );

        // Combined: OSM + Hillshade blend (multiply mode for stronger terrain)
        const osmHillshadeGroup = L.layerGroup([osmStandard, esriHillshade]);

        // GOVMAP WMS — Open Data
        const govmapWMS = L.tileLayer.wms('https://open.govmap.gov.il/geoserver/opendata/wms', {
            layers: 'opendata:REGIONAL_COUNCILS',
            format: 'image/png',
            transparent: true,
            attribution: '© GOVMAP',
            maxZoom: 18,
        });

        // OpenTopoMap (built-in terrain)
        const openTopo = L.tileLayer(
            'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenTopoMap',
                maxZoom: 17,
            }
        );

        baseLayers = {
            '🗺️ OSM + תבליט': osmHillshadeGroup,
            '🗺️ OSM רגיל': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap', maxZoom: 19
            }),
            '🎨 Voyager': cartoVoyager,
            '🌙 כהה': cartoDark,
            '🛰️ לוויין (ESRI)': esriImagery,
            '⛰️ טופוגרפי': openTopo,
            '🏛️ GOVMAP': govmapWMS,
        };

        overlayLayers = {
            '⛰️ תבליט (Hillshade)': esriHillshade,
        };

        // Default: OSM + Hillshade
        osmHillshadeGroup.addTo(map);
    }

    function _addLayerControl() {
        L.control.layers(baseLayers, overlayLayers, {
            position: 'topleft',
            collapsed: true,
        }).addTo(map);
    }

    function getMap() { return map; }

    function fitToFeatures(geojsonLayer) {
        if (geojsonLayer && geojsonLayer.getBounds && geojsonLayer.getLayers().length > 0) {
            map.fitBounds(geojsonLayer.getBounds(), { padding: [30, 30] });
        }
    }

    function flyToDistrict(districtBounds) {
        if (districtBounds) {
            map.fitBounds(districtBounds, { padding: [30, 30], animate: false });
        } else {
            map.setView(COAST_CENTER, 9, { animate: false });
        }
    }

    return { init, getMap, fitToFeatures, flyToDistrict };
})();
