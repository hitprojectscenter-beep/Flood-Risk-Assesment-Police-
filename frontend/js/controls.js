/**
 * TSRS Controls Module
 * Manages district selector, wave height slider, and layer toggles.
 */
const TSRSControls = (() => {
    let currentDistrict = 'all';
    let currentWaveHeight = 2.0;

    // Approximate bounds per district for map fly-to
    const DISTRICT_BOUNDS = {
        'all': [[29.5, 34.0], [33.3, 35.5]],
        'north': [[32.7, 34.9], [33.1, 35.2]],
        'haifa': [[32.4, 34.85], [32.9, 35.1]],
        'center': [[31.9, 34.7], [32.45, 34.95]],
        'tel_aviv': [[31.95, 34.7], [32.15, 34.85]],
        'south': [[31.55, 34.45], [31.9, 34.75]],
    };

    function init(map) {
        _initDistrictSelector(map);
        _initWaveSlider(map);
        _initLayerToggles(map);
        _initDateTime();
    }

    function _initDistrictSelector(map) {
        const select = document.getElementById('district-select');
        select.addEventListener('change', async (e) => {
            currentDistrict = e.target.value;
            const bounds = DISTRICT_BOUNDS[currentDistrict];
            TSRSMap.flyToDistrict(bounds ? L.latLngBounds(bounds) : null);
            await TSRSViz.loadStations(map, currentDistrict);
        });
    }

    function _initWaveSlider(map) {
        const slider = document.getElementById('wave-slider');
        const valueDisplay = document.getElementById('wave-value');
        const severityBadge = document.getElementById('wave-severity');

        slider.addEventListener('input', (e) => {
            currentWaveHeight = parseFloat(e.target.value);
            valueDisplay.textContent = `${currentWaveHeight.toFixed(1)} מ'`;

            // Update severity badge
            let severity, cls;
            if (currentWaveHeight >= 5) { severity = 'קיצוני'; cls = 'severity-extreme'; }
            else if (currentWaveHeight >= 3) { severity = 'חזק'; cls = 'severity-high'; }
            else if (currentWaveHeight >= 1.5) { severity = 'בינוני'; cls = 'severity-medium'; }
            else { severity = 'נמוך'; cls = 'severity-low'; }

            severityBadge.textContent = severity;
            severityBadge.className = `severity-badge ${cls}`;

            // Update inundation layer
            if (typeof TSRSInundation !== 'undefined') {
                TSRSInundation.updateLayer(map, currentWaveHeight);
            }
        });
    }

    function _initLayerToggles(map) {
        const toggles = {
            'layer-stations': () => {
                const layer = TSRSViz.getStationsLayer();
                if (layer) {
                    document.getElementById('layer-stations').checked
                        ? map.addLayer(layer)
                        : map.removeLayer(layer);
                }
            },
            'layer-inundation': () => {
                if (typeof TSRSInundation !== 'undefined') {
                    const checked = document.getElementById('layer-inundation').checked;
                    TSRSInundation.setVisible(map, checked);
                }
            },
            'layer-coastline': () => {
                if (typeof TSRSInundation !== 'undefined') {
                    const checked = document.getElementById('layer-coastline').checked;
                    TSRSInundation.setCoastlineVisible(map, checked);
                }
            },
        };

        Object.keys(toggles).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', toggles[id]);
        });
    }

    function _initDateTime() {
        const dtEl = document.getElementById('current-datetime');
        function update() {
            const now = new Date();
            const options = {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
            };
            dtEl.textContent = now.toLocaleDateString('he-IL', options);
        }
        update();
        setInterval(update, 60000);
    }

    function getDistrict() { return currentDistrict; }
    function getWaveHeight() { return currentWaveHeight; }

    return { init, getDistrict, getWaveHeight };
})();
