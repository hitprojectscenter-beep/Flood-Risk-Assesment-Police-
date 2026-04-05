/**
 * TSRS Application — Main Controller
 * Init order: I18n → Firebase → Map → Overlays → Controls → Data
 */
(async function() {
    'use strict';

    // 1. Initialize i18n (language system)
    if (typeof I18n !== 'undefined') I18n.init();

    // 2. Initialize Firebase (optional)
    FirebaseConfig.init();

    // 3. Initialize map
    const map = TSRSMap.init();

    // 4. Initialize OSM overlays (must be before controls)
    if (typeof TSRSOverlays !== 'undefined') {
        TSRSOverlays.init(map);
    }

    // 5. Initialize controls
    TSRSControls.init(map);

    // 6. Load socioeconomic data from CBS
    try {
        const resp = await fetch('data/socioeconomic.json');
        if (resp.ok) {
            window._cbsSocioData = await resp.json();
            console.log(`CBS socioeconomic data loaded: ${Object.keys(window._cbsSocioData).length} cities`);
        }
    } catch(e) { console.warn('Could not load CBS data:', e); }

    // 7. Initialize weight sliders display
    if (typeof updateWeightSliders === 'function') {
        updateWeightSliders();
    }

    // 8. Load initial data layers
    try {
        await TSRSViz.loadStations(map, 'all');
        await TSRSInundation.loadInundation(map, 2.0);

        const stationsLayer = TSRSViz.getStationsLayer();
        if (stationsLayer) {
            TSRSMap.fitToFeatures(stationsLayer);
        }

        // Close mobile sidebar when clicking the map
        map.on('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('sidebar-open');
        });

        console.log('TSRS Application initialized successfully');
    } catch (err) {
        console.error('Error initializing TSRS app:', err);
    }
})();
