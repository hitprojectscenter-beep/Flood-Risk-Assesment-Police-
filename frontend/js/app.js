/**
 * TSRS Application — Main Controller
 * Initializes all modules: Firebase → Map → Overlays → Controls → Data
 */
(async function() {
    'use strict';

    // 1. Initialize Firebase (optional — falls back to API)
    FirebaseConfig.init();

    // 2. Initialize map (Leaflet + GOVMAP + Hillshade)
    const map = TSRSMap.init();

    // 3. Initialize OSM overlays FIRST (sets _map, creates panes, attaches zoom listeners)
    if (typeof TSRSOverlays !== 'undefined') {
        TSRSOverlays.init(map);
    }

    // 4. Initialize controls (district, wave slider, layer toggles)
    // Must come AFTER TSRSOverlays.init so _map is set when toggle handlers fire
    TSRSControls.init(map);

    // 5. Load initial data layers
    try {
        // Coastline removed (data was inaccurate)
        await TSRSViz.loadStations(map, 'all');
        await TSRSInundation.loadInundation(map, 2.0);

        const stationsLayer = TSRSViz.getStationsLayer();
        if (stationsLayer) {
            TSRSMap.fitToFeatures(stationsLayer);
        }

        console.log('TSRS Application initialized successfully');
    } catch (err) {
        console.error('Error initializing TSRS app:', err);
    }
})();
