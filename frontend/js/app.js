/**
 * TSRS Application — Main Controller
 * Initializes all modules: Firebase → Map → Data Layers → Controls
 * Falls back to FastAPI if Firebase is unavailable.
 */
(async function() {
    'use strict';

    // 1. Initialize Firebase (optional — falls back to API)
    FirebaseConfig.init();

    // 2. Initialize map (Leaflet + GOVMAP)
    const map = TSRSMap.init();

    // 3. Initialize controls (district, wave slider, layer toggles)
    TSRSControls.init(map);

    // 3b. Initialize OSM overlays (roads/buildings with zoom-dependent visibility)
    if (typeof TSRSOverlays !== 'undefined') {
        TSRSOverlays.init(map);
    }

    // 4. Load initial data layers
    try {
        // Load coastline
        await TSRSInundation.loadCoastline(map);

        // Load stations (tries Firebase first, then API)
        await TSRSViz.loadStations(map, 'all');

        // Load initial inundation (2.0m default)
        await TSRSInundation.loadInundation(map, 2.0);

        // Fit map to coastal stations
        const stationsLayer = TSRSViz.getStationsLayer();
        if (stationsLayer) {
            TSRSMap.fitToFeatures(stationsLayer);
        }

        console.log('TSRS Application initialized successfully');
        console.log('Firebase status:', FirebaseConfig.isReady() ? 'Connected' : 'Fallback to API');
    } catch (err) {
        console.error('Error initializing TSRS app:', err);
    }
})();
