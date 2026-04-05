"""
TSRS (Tsunami Station Risk Score) Calculation Engine.
Formula: TSRS = H*0.35 + V*0.30 + O*0.20 + R_inv*0.10 + I_inv*0.05
All components normalized to 0-100 range via Min-Max normalization.
"""
from typing import Dict, List, Optional
import numpy as np


WEIGHTS = {
    "H": 0.25,  # Hazard — inundation area (reduced: similar exposure across IL coast)
    "V": 0.30,  # Vulnerability — demographics (unchanged: critical differentiator in IL)
    "O": 0.15,  # Operational bottleneck — evacuation difficulty (reduced)
    "R": 0.18,  # Response capacity (increased: huge gaps between stations in IL)
    "I": 0.12,  # Infrastructure (increased: shelters critical in periphery)
}

RISK_TIERS = [
    (80, "CRITICAL", "קריטי"),
    (60, "HIGH", "גבוה"),
    (40, "MEDIUM", "בינוני"),
    (20, "LOW", "נמוך"),
    (0, "MINIMAL", "מינימלי"),
]


def normalize_min_max(value: float, min_val: float, max_val: float) -> float:
    if max_val == min_val:
        return 50.0
    return max(0.0, min(100.0, ((value - min_val) / (max_val - min_val)) * 100))


def compute_tsrs(h: float, v: float, o: float, r_inv: float, i_inv: float) -> float:
    return h * WEIGHTS["H"] + v * WEIGHTS["V"] + o * WEIGHTS["O"] + r_inv * WEIGHTS["R"] + i_inv * WEIGHTS["I"]


def get_risk_tier(score: float) -> Dict[str, str]:
    for threshold, tier_en, tier_he in RISK_TIERS:
        if score >= threshold:
            return {"tier": tier_en, "tier_he": tier_he}
    return {"tier": "MINIMAL", "tier_he": "מינימלי"}


def compute_vulnerability(
    pct_elderly: float,
    pct_children: float,
    economic_cluster: float,
    car_ownership_rate: float = 0.5,
    facility_density: float = 0.5,
) -> float:
    """
    V = weighted average:
      pct_elderly (65+) * 0.30
      pct_children (0-14) * 0.20
      (1 - economic_cluster/10) * 0.25
      (1 - car_ownership_rate) * 0.15
      facility_density * 0.10
    """
    v = (
        pct_elderly * 0.30
        + pct_children * 0.20
        + (1 - economic_cluster / 10) * 0.25
        + (1 - car_ownership_rate) * 0.15
        + facility_density * 0.10
    )
    return max(0.0, min(1.0, v)) * 100


def compute_hazard(pct_flooded: float, max_depth: float, distance_to_coast_km: float) -> float:
    """H based on flooding extent, depth, and proximity to coast."""
    flood_score = min(pct_flooded / 50.0, 1.0)
    depth_score = min(max_depth / 10.0, 1.0)
    proximity_score = max(0, 1 - distance_to_coast_km / 5.0)
    return (flood_score * 0.40 + depth_score * 0.30 + proximity_score * 0.30) * 100


def recommended_backup_units(tsrs_score: float) -> int:
    if tsrs_score >= 80:
        return 5
    elif tsrs_score >= 60:
        return 3
    elif tsrs_score >= 40:
        return 2
    elif tsrs_score >= 20:
        return 1
    return 0


def priority_level(tsrs_score: float) -> int:
    if tsrs_score >= 80:
        return 1
    elif tsrs_score >= 60:
        return 2
    elif tsrs_score >= 40:
        return 3
    elif tsrs_score >= 20:
        return 4
    return 5


def normalize_all_stations(stations: List[Dict]) -> List[Dict]:
    """Apply Min-Max normalization across all stations for each TSRS component."""
    if not stations:
        return stations

    components = ["H", "V", "O", "R", "I"]
    for comp in components:
        raw_values = [s.get(f"{comp}_raw", 50) for s in stations]
        min_val = min(raw_values)
        max_val = max(raw_values)
        for i, s in enumerate(stations):
            s[f"{comp}_score"] = normalize_min_max(raw_values[i], min_val, max_val)

    for s in stations:
        s["tsrs_score"] = compute_tsrs(
            s["H_score"], s["V_score"], s["O_score"], s["R_score"], s["I_score"]
        )
        tier = get_risk_tier(s["tsrs_score"])
        s["risk_tier"] = tier["tier"]
        s["risk_tier_he"] = tier["tier_he"]
        s["backup_units"] = recommended_backup_units(s["tsrs_score"])
        s["priority"] = priority_level(s["tsrs_score"])

    return stations
