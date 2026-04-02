/**
 * Firebase Configuration for TSRS Application
 * Uses Firebase Realtime Database for storing station data, TSRS scores, and inundation zones.
 */
const FirebaseConfig = (() => {
    // Firebase project configuration
    // TODO: Replace with your actual Firebase project config
    const firebaseConfig = {
        apiKey: "AIzaSyD_PLACEHOLDER_REPLACE_ME",
        authDomain: "tsrs-flood-risk.firebaseapp.com",
        databaseURL: "https://tsrs-flood-risk-default-rtdb.firebaseio.com",
        projectId: "tsrs-flood-risk",
        storageBucket: "tsrs-flood-risk.appspot.com",
        messagingSenderId: "000000000000",
        appId: "1:000000000000:web:placeholder"
    };

    let db = null;
    let isInitialized = false;

    function init() {
        try {
            if (typeof firebase !== 'undefined') {
                firebase.initializeApp(firebaseConfig);
                db = firebase.database();
                isInitialized = true;
                console.log('Firebase initialized successfully');
            } else {
                console.warn('Firebase SDK not loaded — falling back to API mode');
            }
        } catch (err) {
            console.warn('Firebase init error — falling back to API mode:', err.message);
        }
    }

    function getDb() { return db; }
    function isReady() { return isInitialized && db !== null; }

    // --- Data Read Functions ---

    async function getStations(district = 'all') {
        if (!isReady()) return null;
        try {
            const snapshot = await db.ref('stations').once('value');
            const data = snapshot.val();
            if (!data) return null;

            let features = Object.values(data);
            if (district !== 'all') {
                const districtMap = {
                    'north': 'צפון', 'haifa': 'חיפה', 'center': 'מרכז',
                    'tel_aviv': 'תל-אביב', 'south': 'דרום'
                };
                const districtHe = districtMap[district] || district;
                features = features.filter(f => f.properties.district === districtHe);
            }
            return { type: 'FeatureCollection', features };
        } catch (err) {
            console.error('Firebase getStations error:', err);
            return null;
        }
    }

    async function getStationById(stationId) {
        if (!isReady()) return null;
        try {
            const snapshot = await db.ref(`stations/${stationId}`).once('value');
            return snapshot.val();
        } catch (err) {
            console.error('Firebase getStation error:', err);
            return null;
        }
    }

    async function getInundation(waveHeight) {
        if (!isReady()) return null;
        try {
            const key = `wh_${waveHeight.toFixed(1).replace('.', '_')}`;
            const snapshot = await db.ref(`inundation/${key}`).once('value');
            return snapshot.val();
        } catch (err) {
            console.error('Firebase getInundation error:', err);
            return null;
        }
    }

    async function getCoastline() {
        if (!isReady()) return null;
        try {
            const snapshot = await db.ref('coastline').once('value');
            return snapshot.val();
        } catch (err) {
            console.error('Firebase getCoastline error:', err);
            return null;
        }
    }

    async function getOperational(stationId) {
        if (!isReady()) return null;
        try {
            const snapshot = await db.ref(`operational/${stationId}`).once('value');
            return snapshot.val();
        } catch (err) {
            console.error('Firebase getOperational error:', err);
            return null;
        }
    }

    // --- Data Write Functions (for population script) ---

    async function setStations(geojsonFeatures) {
        if (!isReady()) return false;
        const updates = {};
        for (const feature of geojsonFeatures) {
            updates[feature.properties.station_id] = feature;
        }
        await db.ref('stations').set(updates);
        return true;
    }

    async function setInundation(waveHeight, geojson) {
        if (!isReady()) return false;
        const key = `wh_${waveHeight.toFixed(1).replace('.', '_')}`;
        await db.ref(`inundation/${key}`).set(geojson);
        return true;
    }

    async function setCoastline(geojson) {
        if (!isReady()) return false;
        await db.ref('coastline').set(geojson);
        return true;
    }

    async function setDemographics(data) {
        if (!isReady()) return false;
        await db.ref('demographics').set(data);
        return true;
    }

    return {
        init, getDb, isReady,
        getStations, getStationById, getInundation, getCoastline, getOperational,
        setStations, setInundation, setCoastline, setDemographics,
    };
})();
