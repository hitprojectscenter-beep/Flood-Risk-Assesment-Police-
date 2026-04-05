/**
 * TSRS Weight Configuration Module
 * Israel-calibrated defaults with user-adjustable sliders.
 *
 * Original (international):  H=35%, V=30%, O=20%, R=10%, I=5%
 * Israel 2026 calibrated:    H=25%, V=30%, O=15%, R=18%, I=12%
 *
 * Rationale for Israel calibration:
 * - H reduced (35→25%): Narrow coastline, similar exposure across coastal cities
 * - V unchanged (30%): Demographic vulnerability is critical differentiator
 * - O reduced (20→15%): Operational bottleneck partly moved to Infrastructure
 * - R increased (10→18%): Huge resource gaps between central/peripheral stations
 * - I increased (5→12%): Shelters & alt routes critical in periphery
 */
const TSRSWeights = (() => {
    // Israel 2026 calibrated defaults
    const ISRAEL_DEFAULTS = { H: 0.25, V: 0.30, O: 0.15, R: 0.18, I: 0.12 };
    // International defaults (Wood & Jones 2015)
    const INTERNATIONAL_DEFAULTS = { H: 0.35, V: 0.30, O: 0.20, R: 0.10, I: 0.05 };

    let current = { ...ISRAEL_DEFAULTS };
    let onChangeCallbacks = [];

    function get() { return { ...current }; }
    function getDefault() { return { ...ISRAEL_DEFAULTS }; }
    function getInternational() { return { ...INTERNATIONAL_DEFAULTS }; }

    function set(key, value) {
        if (current[key] === undefined) return;
        current[key] = Math.round(value * 100) / 100;
        _normalize();
        _notifyChange();
    }

    function setAll(weights) {
        Object.keys(weights).forEach(k => {
            if (current[k] !== undefined) current[k] = weights[k];
        });
        _normalize();
        _notifyChange();
    }

    function resetToIsrael() {
        current = { ...ISRAEL_DEFAULTS };
        _notifyChange();
    }

    function resetToInternational() {
        current = { ...INTERNATIONAL_DEFAULTS };
        _notifyChange();
    }

    // Normalize so weights sum to 1.0
    function _normalize() {
        const sum = Object.values(current).reduce((a, b) => a + b, 0);
        if (sum > 0 && Math.abs(sum - 1.0) > 0.001) {
            Object.keys(current).forEach(k => {
                current[k] = Math.round((current[k] / sum) * 100) / 100;
            });
            // Fix rounding to exactly 1.0
            const diff = 1.0 - Object.values(current).reduce((a, b) => a + b, 0);
            current.H = Math.round((current.H + diff) * 100) / 100;
        }
    }

    // Calculate TSRS score from component scores
    function calculate(H, V, O, R, I) {
        return Math.round((H * current.H + V * current.V + O * current.O + R * current.R + I * current.I) * 10) / 10;
    }

    // Get risk tier from score
    function getTier(score) {
        if (score >= 80) return { tier: 'CRITICAL', he: 'קריטי' };
        if (score >= 60) return { tier: 'HIGH', he: 'גבוה' };
        if (score >= 40) return { tier: 'MEDIUM', he: 'בינוני' };
        if (score >= 20) return { tier: 'LOW', he: 'נמוך' };
        return { tier: 'MINIMAL', he: 'מינימלי' };
    }

    function onChange(callback) {
        onChangeCallbacks.push(callback);
    }

    function _notifyChange() {
        onChangeCallbacks.forEach(cb => cb(current));
    }

    // Format formula string
    function getFormulaString() {
        const w = current;
        return `TSRS = (H × ${w.H.toFixed(2)}) + (V × ${w.V.toFixed(2)}) + (O × ${w.O.toFixed(2)}) + (R⁻¹ × ${w.R.toFixed(2)}) + (I⁻¹ × ${w.I.toFixed(2)})`;
    }

    return {
        get, getDefault, getInternational, set, setAll,
        resetToIsrael, resetToInternational,
        calculate, getTier, onChange, getFormulaString,
    };
})();
