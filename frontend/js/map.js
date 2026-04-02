/**
 * TSRS Map Module — Leaflet + GOVMAP WMS Integration
 * Manages base layers, overlays, and map initialization.
 */
const TSRSMap = (() => {
    let map = null;
    let baseLayers = {};
    let overlayLayers = {};

    // Israel center coordinates
    const ISRAEL_CENTER = [31.5, 34.8];
    const ISRAEL_BOUNDS = [[29.5, 34.0], [33.3, 35.9]];
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

        // Zoom control on the left (since sidebar is right in RTL)
        L.control.zoom({ position: 'topleft' }).addTo(map);

        // Scale bar
        L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

        _addBaseLayers();
        _addLayerControl();

        return map;
    }

    function _addBaseLayers() {
        // GOVMAP WMS — Open Data layers
        const govmapWMS = L.tileLayer.wms('https://open.govmap.gov.il/geoserver/opendata/wms', {
            layers: 'opendata:REGIONAL_COUNCILS',
            format: 'image/png',
            transparent: true,
            attribution: '© GOVMAP — ממשל זמין',
            maxZoom: 18,
        });

        // GOVMAP Orthophoto tiles
        const govmapOrtho = L.tileLayer(
            'https://cdn.govmap.gov.il/IsraelOrthPhoto/{z}/{x}/{y}.png', {
                attribution: '© GOVMAP תצלומי אוויר',
                maxZoom: 18,
                errorTileUrl: '',
            }
        );

        // OpenStreetMap — primary reliable base
        const osmStandard = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
            }
        );

        // CartoDB light — clean background for data overlays
        const cartoLight = L.tileLayer(
            'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '© <a href="https://carto.com/">CARTO</a>',
                maxZoom: 19,
            }
        );

        // CartoDB dark
        const cartoDark = L.tileLayer(
            'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '© <a href="https://carto.com/">CARTO</a>',
                maxZoom: 19,
            }
        );

        baseLayers = {
            'OSM רגיל': osmStandard,
            'בהיר (CartoDB)': cartoLight,
            'כהה (CartoDB)': cartoDark,
            'GOVMAP מועצות': govmapWMS,
        };

        // Default base layer
        osmStandard.addTo(map);
    }

    function _addLayerControl() {
        L.control.layers(baseLayers, {}, {
            position: 'topleft',
            collapsed: true,
        }).addTo(map);
    }

    function getMap() {
        return map;
    }

    function fitToFeatures(geojsonLayer) {
        if (geojsonLayer && geojsonLayer.getBounds && geojsonLayer.getLayers().length > 0) {
            map.fitBounds(geojsonLayer.getBounds(), { padding: [30, 30] });
        }
    }

    function flyToDistrict(districtBounds) {
        if (districtBounds) {
            map.flyToBounds(districtBounds, { padding: [30, 30], duration: 0.8 });
        } else {
            map.flyTo(COAST_CENTER, 9, { duration: 0.8 });
        }
    }

    return { init, getMap, fitToFeatures, flyToDistrict };
})();
