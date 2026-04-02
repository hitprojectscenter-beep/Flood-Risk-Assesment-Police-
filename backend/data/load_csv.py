"""
Load and process CBS (Central Bureau of Statistics) demographic data.
Handles Windows-1255 encoded Hebrew CSV files.
"""
import os
import pandas as pd
import numpy as np
from typing import Dict, List, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(BASE_DIR)), "Gov.il", "אוכלוסין")


def load_age_demographics(filepath: Optional[str] = None) -> pd.DataFrame:
    if filepath is None:
        filepath = os.path.join(DATA_DIR, "ישובים_גילאים.csv")
    df = pd.read_csv(filepath, encoding="windows-1255")
    df.columns = df.columns.str.strip()
    # Compute percentage columns
    df["סהכ"] = pd.to_numeric(df["סהכ"], errors="coerce")
    for col in ["גיל_0_5", "גיל_6_18", "גיל_19_45", "גיל_46_55", "גיל_56_64", "גיל_65_פלוס"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    total = df["סהכ"].replace(0, np.nan)
    df["pct_children"] = ((df["גיל_0_5"] + df["גיל_6_18"]) / total).fillna(0)
    df["pct_elderly"] = (df["גיל_65_פלוס"] / total).fillna(0)
    df["pct_working_age"] = ((df["גיל_19_45"] + df["גיל_46_55"]) / total).fillna(0)
    return df


def get_district_settlements(df: pd.DataFrame, district_name: str) -> pd.DataFrame:
    return df[df["נפה"].str.strip() == district_name.strip()]


def get_vulnerability_by_settlement(df: pd.DataFrame) -> pd.DataFrame:
    """Compute vulnerability index per settlement from age demographics."""
    result = df[["סמל_ישוב", "שם_ישוב", "נפה", "סהכ", "pct_children", "pct_elderly"]].copy()
    # Simple vulnerability index: weighted combination of elderly and children percentages
    result["vulnerability_raw"] = result["pct_elderly"] * 0.6 + result["pct_children"] * 0.4
    return result


def aggregate_by_nafa(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate demographics by police district (nafa)."""
    grouped = df.groupby("נפה").agg({
        "סהכ": "sum",
        "גיל_0_5": "sum",
        "גיל_6_18": "sum",
        "גיל_19_45": "sum",
        "גיל_46_55": "sum",
        "גיל_56_64": "sum",
        "גיל_65_פלוס": "sum",
    }).reset_index()
    total = grouped["סהכ"].replace(0, np.nan)
    grouped["pct_children"] = ((grouped["גיל_0_5"] + grouped["גיל_6_18"]) / total).fillna(0)
    grouped["pct_elderly"] = (grouped["גיל_65_פלוס"] / total).fillna(0)
    return grouped
