#!/usr/bin/env python
"""GoodDay-style BaZi calculation helpers without any LLM API calls.

The calculation core is adapted from the original GoodDay `bazi_utils.py`.
This script only returns deterministic calendar, DaYun/LiuNian, and Wu Xing
data. Interpretive prose should be written by the calling agent.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

try:
    from lunar_python import Solar
except Exception as exc:  # pragma: no cover - environment hint
    Solar = None
    IMPORT_ERROR = exc
else:
    IMPORT_ERROR = None


SCRIPT_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPT_DIR.parent / "data"
PROFILE_PATH = DATA_DIR / "profiles.json"

# ── Basic element / stem / branch mappings ──────────────────────────────

STEM_ELEMENT = {
    "甲": "木", "乙": "木",
    "丙": "火", "丁": "火",
    "戊": "土", "己": "土",
    "庚": "金", "辛": "金",
    "壬": "水", "癸": "水",
}

BRANCH_ELEMENT = {
    "子": "水", "丑": "土", "寅": "木", "卯": "木",
    "辰": "土", "巳": "火", "午": "火", "未": "土",
    "申": "金", "酉": "金", "戌": "土", "亥": "水",
}

ELEMENTS = ["木", "火", "土", "金", "水"]

GENERATES = {"木": "火", "火": "土", "土": "金", "金": "水", "水": "木"}
CONTROLS = {"木": "土", "土": "水", "水": "火", "火": "金", "金": "木"}

# ── New: 地支藏干 (Hidden Stems) ──────────────────────────────────────

HIDDEN_STEMS = {
    "子": ["癸"],
    "丑": ["己", "癸", "辛"],
    "寅": ["甲", "丙", "戊"],
    "卯": ["乙"],
    "辰": ["戊", "乙", "癸"],
    "巳": ["丙", "庚", "戊"],
    "午": ["丁", "己"],
    "未": ["己", "丁", "乙"],
    "申": ["庚", "壬", "戊"],
    "酉": ["辛"],
    "戌": ["戊", "辛", "丁"],
    "亥": ["壬", "甲"],
}

HIDDEN_STEMS_LABEL = {
    "子": "癸",
    "丑": "己癸辛",
    "寅": "甲丙戊",
    "卯": "乙",
    "辰": "戊乙癸",
    "巳": "丙庚戊",
    "午": "丁己",
    "未": "己丁乙",
    "申": "庚壬戊",
    "酉": "辛",
    "戌": "戊辛丁",
    "亥": "壬甲",
}

# ── New: 天干阴阳 ──────────────────────────────────────────────────────

YANG_STEMS = {"甲", "丙", "戊", "庚", "壬"}
YIN_STEMS = {"乙", "丁", "己", "辛", "癸"}

def stem_yin_yang(stem: str) -> str:
    return "阳" if stem in YANG_STEMS else "阴"

# ── New: 十神推导 (Ten Gods / Shi Shen) ──────────────────────────────

def get_shi_shen(day_stem: str, other_stem: str) -> str:
    """Determine the Shi Shen relationship of other_stem relative to day_stem."""
    day_el = STEM_ELEMENT[day_stem]
    other_el = STEM_ELEMENT[other_stem]
    day_yang = day_stem in YANG_STEMS
    other_yang = other_stem in YANG_STEMS
    same_yang = day_yang == other_yang

    if day_el == other_el:
        return "比肩" if same_yang else "劫财"

    # 我生 (I generate)
    if GENERATES[day_el] == other_el:
        return "食神" if same_yang else "伤官"
    # 我克 (I control)
    if CONTROLS[day_el] == other_el:
        return "偏财" if same_yang else "正财"
    # 克我 (controls me)
    if CONTROLS[other_el] == day_el:
        return "七杀" if same_yang else "正官"
    # 生我 (generates me)
    if GENERATES[other_el] == day_el:
        return "偏印" if same_yang else "正印"

    return "未知"

def get_pillar_shi_shen(day_stem: str, pillars: Dict[str, str]) -> Dict[str, str]:
    """Get Shi Shen for each pillar's stem relative to day_stem."""
    return {
        key: get_shi_shen(day_stem, pillar[0])
        for key, pillar in pillars.items()
        if pillar
    }

# ── New: 十二长生 (Twelve Growth Stages) ──────────────────────────────

TWELVE_STAGES = {
    ("甲", "亥"): "长生", ("甲", "子"): "沐浴", ("甲", "丑"): "冠带",
    ("甲", "寅"): "临官", ("甲", "卯"): "帝旺", ("甲", "辰"): "衰",
    ("甲", "巳"): "病",   ("甲", "午"): "死",   ("甲", "未"): "墓",
    ("甲", "申"): "绝",   ("甲", "酉"): "胎",   ("甲", "戌"): "养",
    ("乙", "午"): "长生", ("乙", "巳"): "沐浴", ("乙", "辰"): "冠带",
    ("乙", "卯"): "临官", ("乙", "寅"): "帝旺", ("乙", "丑"): "衰",
    ("乙", "子"): "病",   ("乙", "亥"): "死",   ("乙", "戌"): "墓",
    ("乙", "酉"): "绝",   ("乙", "申"): "胎",   ("乙", "未"): "养",
    ("丙", "寅"): "长生", ("丙", "卯"): "沐浴", ("丙", "辰"): "冠带",
    ("丙", "巳"): "临官", ("丙", "午"): "帝旺", ("丙", "未"): "衰",
    ("丙", "申"): "病",   ("丙", "酉"): "死",   ("丙", "戌"): "墓",
    ("丙", "亥"): "绝",   ("丙", "子"): "胎",   ("丙", "丑"): "养",
    ("丁", "酉"): "长生", ("丁", "申"): "沐浴", ("丁", "未"): "冠带",
    ("丁", "午"): "临官", ("丁", "巳"): "帝旺", ("丁", "辰"): "衰",
    ("丁", "卯"): "病",   ("丁", "寅"): "死",   ("丁", "丑"): "墓",
    ("丁", "子"): "绝",   ("丁", "亥"): "胎",   ("丁", "戌"): "养",
    ("戊", "寅"): "长生", ("戊", "卯"): "沐浴", ("戊", "辰"): "冠带",
    ("戊", "巳"): "临官", ("戊", "午"): "帝旺", ("戊", "未"): "衰",
    ("戊", "申"): "病",   ("戊", "酉"): "死",   ("戊", "戌"): "墓",
    ("戊", "亥"): "绝",   ("戊", "子"): "胎",   ("戊", "丑"): "养",
    ("己", "酉"): "长生", ("己", "申"): "沐浴", ("己", "未"): "冠带",
    ("己", "午"): "临官", ("己", "巳"): "帝旺", ("己", "辰"): "衰",
    ("己", "卯"): "病",   ("己", "寅"): "死",   ("己", "丑"): "墓",
    ("己", "子"): "绝",   ("己", "亥"): "胎",   ("己", "戌"): "养",
    ("庚", "巳"): "长生", ("庚", "午"): "沐浴", ("庚", "未"): "冠带",
    ("庚", "申"): "临官", ("庚", "酉"): "帝旺", ("庚", "戌"): "衰",
    ("庚", "亥"): "病",   ("庚", "子"): "死",   ("庚", "丑"): "墓",
    ("庚", "寅"): "绝",   ("庚", "卯"): "胎",   ("庚", "辰"): "养",
    ("辛", "子"): "长生", ("辛", "亥"): "沐浴", ("辛", "戌"): "冠带",
    ("辛", "酉"): "临官", ("辛", "申"): "帝旺", ("辛", "未"): "衰",
    ("辛", "午"): "病",   ("辛", "巳"): "死",   ("辛", "辰"): "墓",
    ("辛", "卯"): "绝",   ("辛", "寅"): "胎",   ("辛", "丑"): "养",
    ("壬", "申"): "长生", ("壬", "酉"): "沐浴", ("壬", "戌"): "冠带",
    ("壬", "亥"): "临官", ("壬", "子"): "帝旺", ("壬", "丑"): "衰",
    ("壬", "寅"): "病",   ("壬", "卯"): "死",   ("壬", "辰"): "墓",
    ("壬", "巳"): "绝",   ("壬", "午"): "胎",   ("壬", "未"): "养",
    ("癸", "卯"): "长生", ("癸", "寅"): "沐浴", ("癸", "丑"): "冠带",
    ("癸", "子"): "临官", ("癸", "亥"): "帝旺", ("癸", "戌"): "衰",
    ("癸", "酉"): "病",   ("癸", "申"): "死",   ("癸", "未"): "墓",
    ("癸", "午"): "绝",   ("癸", "巳"): "胎",   ("癸", "辰"): "养",
}

def get_twelve_stage(stem: str, branch: str) -> str:
    """Get the twelve growth stage of a stem at a given branch."""
    return TWELVE_STAGES.get((stem, branch), "未知")


# ── Existing helpers ───────────────────────────────────────────────────

def require_lunar() -> None:
    if Solar is None:
        raise RuntimeError(
            "Missing dependency lunar_python. Install with: python -m pip install lunar-python"
        ) from IMPORT_ERROR


def parse_datetime(value: str) -> datetime:
    value = value.strip()
    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%Y%m%d%H%M%S",
        "%Y%m%d%H%M",
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%Y%m%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            if "%H" not in fmt:
                dt = dt.replace(hour=12, minute=0, second=0)
            return dt
        except ValueError:
            continue
    raise ValueError(f"Unsupported datetime format: {value}")


def parse_pillars(value: str) -> Dict[str, str]:
    parts = [part.strip() for part in value.replace(",", " ").replace("，", " ").split() if part.strip()]
    if len(parts) != 4:
        raise ValueError('--pillars must contain four pillars, e.g. "己卯 辛未 丁卯 辛亥"')
    for part in parts:
        if len(part) != 2 or part[0] not in STEM_ELEMENT or part[1] not in BRANCH_ELEMENT:
            raise ValueError(f"Invalid pillar: {part}")
    return {"year": parts[0], "month": parts[1], "day": parts[2], "hour": parts[3]}


def parse_elements(value: str) -> list[str]:
    if not value:
        return []
    cleaned = value.replace(",", " ").replace("，", " ").replace("、", " ")
    result = []
    for item in cleaned.split():
        item = item.strip()
        if item:
            if item not in ELEMENTS:
                raise ValueError(f"Invalid element: {item}")
            result.append(item)
    return result


def pillar_elements(pillars: Dict[str, str]) -> Dict[str, list[str]]:
    result: Dict[str, list[str]] = {}
    for key, pillar in pillars.items():
        if not pillar:
            result[key] = []
            continue
        stem = pillar[0]
        branch = pillar[1] if len(pillar) > 1 else ""
        result[key] = [
            STEM_ELEMENT.get(stem, "未知"),
            BRANCH_ELEMENT.get(branch, "未知"),
        ]
    return result


def count_elements(pillars: Dict[str, str]) -> Dict[str, int]:
    counts = Counter()
    for values in pillar_elements(pillars).values():
        for item in values:
            if item in ELEMENTS:
                counts[item] += 1
    return {element: int(counts.get(element, 0)) for element in ELEMENTS}


# ── New: 藏干 / 十神 / 长生  for a set of pillars ──────────────────────

def enrich_pillars(pillars: Dict[str, str], day_master: str) -> Dict[str, Any]:
    """Add hidden stems, shi shen, twelve stages for each pillar."""
    result: Dict[str, Any] = {}
    for key, pillar in pillars.items():
        if not pillar or len(pillar) < 2:
            result[key] = {"hidden_stems": [], "shi_shen": "", "twelve_stage": ""}
            continue
        stem, branch = pillar[0], pillar[1]
        result[key] = {
            "hidden_stems": HIDDEN_STEMS.get(branch, []),
            "hidden_stems_label": HIDDEN_STEMS_LABEL.get(branch, ""),
            "shi_shen": get_shi_shen(day_master, stem),
            "shi_shen_stem": get_shi_shen(day_master, stem),
            "twelve_stage": get_twelve_stage(day_master, branch),
            "stem_yin_yang": stem_yin_yang(stem),
            "branch_yin_yang": stem_yin_yang(branch),
            "stem_element": STEM_ELEMENT.get(stem, "未知"),
            "branch_element": BRANCH_ELEMENT.get(branch, "未知"),
        }
    return result


# ── Existing relation helper ────────────────────────────────────────────

def relation_to_day_master(day_master_element: str, target_counts: Dict[str, int]) -> Dict[str, Any]:
    generated_by = next(k for k, v in GENERATES.items() if v == day_master_element)
    controlled_by = next(k for k, v in CONTROLS.items() if v == day_master_element)
    supports = day_master_element
    expression = GENERATES[day_master_element]
    wealth = CONTROLS[day_master_element]
    pressure = controlled_by
    resource = generated_by
    return {
        "day_master_element": day_master_element,
        "supporting_elements": [supports, resource],
        "output_element": expression,
        "wealth_element": wealth,
        "pressure_element": pressure,
        "target_counts": target_counts,
        "hints": [
            f"{supports}与{resource}偏多时，通常更利于承托日主、恢复状态。",
            f"{expression}偏多时，通常表现为表达、输出、行动欲增强。",
            f"{wealth}偏多时，通常关联资源、事务推进和现实压力。",
            f"{pressure}偏多时，通常需要注意约束、规则、阻力或外部要求。",
        ],
    }


# ── Core calculation functions ──────────────────────────────────────────

def chart_for_datetime(dt: datetime) -> Dict[str, Any]:
    require_lunar()
    solar = Solar.fromYmdHms(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)
    lunar = solar.getLunar()
    pillars = {
        "year": lunar.getYearInGanZhi(),
        "month": lunar.getMonthInGanZhi(),
        "day": lunar.getDayInGanZhi(),
        "hour": lunar.getTimeInGanZhi(),
    }
    day_master = pillars["day"][0] if pillars["day"] else ""
    enriched = enrich_pillars(pillars, day_master)
    return {
        "solar": dt.strftime("%Y-%m-%d %H:%M:%S"),
        "lunar": lunar.toString(),
        "pillars": pillars,
        "pillar_elements": pillar_elements(pillars),
        "element_counts": count_elements(pillars),
        "day_master": day_master,
        "day_master_element": STEM_ELEMENT.get(day_master, "未知"),
        "day_master_yin_yang": stem_yin_yang(day_master),
        "hidden_stems": {k: v["hidden_stems"] for k, v in enriched.items()},
        "hidden_stems_labels": {k: v["hidden_stems_label"] for k, v in enriched.items()},
        "shi_shen": {k: v["shi_shen"] for k, v in enriched.items()},
        "twelve_stages": {k: v["twelve_stage"] for k, v in enriched.items()},
        "pillar_detail": enriched,
    }


def calculate_detailed_bazi(birth: datetime, gender: str, target: Optional[datetime] = None) -> Dict[str, Any]:
    require_lunar()
    target = target or datetime.now()
    solar = Solar.fromYmdHms(
        birth.year, birth.month, birth.day, birth.hour, birth.minute, birth.second
    )
    lunar = solar.getLunar()
    eight_char = lunar.getEightChar()
    gender_code = 1 if gender == "男" else 0
    yun = eight_char.getYun(gender_code)
    target_solar = Solar.fromYmdHms(
        target.year, target.month, target.day, target.hour, target.minute, target.second
    )
    target_year = target_solar.getYear()

    current_dayun = None
    dayun_ranges = []
    for dy in yun.getDaYun():
        item = {
            "gan_zhi": dy.getGanZhi(),
            "start_year": dy.getStartYear(),
            "end_year": dy.getEndYear(),
            "start_age": dy.getStartAge(),
            "end_age": dy.getEndAge(),
        }
        dayun_ranges.append(item)
        if item["start_year"] <= target_year <= item["end_year"]:
            current_dayun = item

    target_lunar = target_solar.getLunar()
    pillars = {
        "year": eight_char.getYear(),
        "month": eight_char.getMonth(),
        "day": eight_char.getDay(),
        "hour": eight_char.getTime(),
    }
    day_master = pillars["day"][0] if pillars["day"] else ""
    day_master_element = STEM_ELEMENT.get(day_master, "未知")
    enriched = enrich_pillars(pillars, day_master)

    # Get yin-yang of year stem for 阳年/阴年 determination
    year_stem = pillars["year"][0] if pillars["year"] else ""
    year_yin_yang = stem_yin_yang(year_stem)

    return {
        "gender": gender,
        "birth_solar": birth.strftime("%Y-%m-%d %H:%M:%S"),
        "birth_lunar": lunar.toString(),
        "pillars": pillars,
        "pillar_elements": pillar_elements(pillars),
        "element_counts": count_elements(pillars),
        "day_master": day_master,
        "day_master_element": day_master_element,
        "day_master_yin_yang": stem_yin_yang(day_master),
        "year_stem": year_stem,
        "year_yin_yang": year_yin_yang,
        "hidden_stems": {k: v["hidden_stems"] for k, v in enriched.items()},
        "hidden_stems_labels": {k: v["hidden_stems_label"] for k, v in enriched.items()},
        "shi_shen": {k: v["shi_shen"] for k, v in enriched.items()},
        "twelve_stages": {k: v["twelve_stage"] for k, v in enriched.items()},
        "pillar_detail": enriched,
        "current_dayun": current_dayun or {"gan_zhi": "未匹配", "start_year": "", "end_year": ""},
        "current_liunian": target_lunar.getYearInGanZhi(),
        "dayun_ranges": dayun_ranges[:12],
    }


# ── Profile persistence ────────────────────────────────────────────────

def load_profiles() -> Dict[str, Any]:
    if not PROFILE_PATH.exists():
        return {}
    return json.loads(PROFILE_PATH.read_text(encoding="utf-8"))


def save_profiles(data: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROFILE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_profile(args: argparse.Namespace) -> Dict[str, Any]:
    if args.birth:
        profile = {"gender": args.gender or "男", "birth": parse_datetime(args.birth).strftime("%Y-%m-%d %H:%M:%S")}
        if getattr(args, "pillars", None):
            profile["manual_pillars"] = parse_pillars(args.pillars)
        if getattr(args, "strength", None):
            profile["strength"] = args.strength
        if getattr(args, "favorable_elements", None):
            profile["favorable_elements"] = parse_elements(args.favorable_elements)
        return profile
    profiles = load_profiles()
    if not args.name:
        raise ValueError("Provide --name for a saved profile, or provide --birth directly.")
    if args.name not in profiles:
        raise ValueError(f"Profile not found: {args.name}")
    return profiles[args.name]


# ── CLI commands ───────────────────────────────────────────────────────

def cmd_save_profile(args: argparse.Namespace) -> Dict[str, Any]:
    birth = parse_datetime(args.birth)
    gender = args.gender or "男"
    if gender not in {"男", "女"}:
        raise ValueError("--gender must be 男 or 女")
    name = args.name or "default"
    profiles = load_profiles()
    profiles[name] = {
        "gender": gender,
        "birth": birth.strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    if args.pillars:
        profiles[name]["manual_pillars"] = parse_pillars(args.pillars)
    if args.strength:
        profiles[name]["strength"] = args.strength
    if args.favorable_elements:
        profiles[name]["favorable_elements"] = parse_elements(args.favorable_elements)
    if args.notes:
        profiles[name]["notes"] = args.notes
    save_profiles(profiles)
    return {"ok": True, "profile": name, "data": profiles[name], "profile_path": str(PROFILE_PATH)}


def cmd_list_profiles(_: argparse.Namespace) -> Dict[str, Any]:
    return {"profile_path": str(PROFILE_PATH), "profiles": load_profiles()}


def cmd_chart(args: argparse.Namespace) -> Dict[str, Any]:
    target = parse_datetime(args.target) if args.target else datetime.now()
    return chart_for_datetime(target)


def cmd_analyze(args: argparse.Namespace) -> Dict[str, Any]:
    profile = get_profile(args)
    birth = parse_datetime(profile["birth"])
    gender = profile.get("gender", args.gender or "男")
    target = parse_datetime(args.target) if args.target else datetime.now()
    natal = calculate_detailed_bazi(birth, gender, target)
    if profile.get("manual_pillars"):
        manual_pillars = profile["manual_pillars"]
        natal["computed_pillars"] = natal["pillars"]
        natal["pillars"] = manual_pillars
        natal["pillar_elements"] = pillar_elements(manual_pillars)
        natal["element_counts"] = count_elements(manual_pillars)
        natal["day_master"] = manual_pillars["day"][0]
        natal["day_master_element"] = STEM_ELEMENT.get(natal["day_master"], "未知")
        natal["day_master_yin_yang"] = stem_yin_yang(natal["day_master"])
        natal["manual_pillars_source"] = "profile"
        # Re-enrich with manual pillars
        enriched = enrich_pillars(manual_pillars, natal["day_master"])
        natal["hidden_stems"] = {k: v["hidden_stems"] for k, v in enriched.items()}
        natal["hidden_stems_labels"] = {k: v["hidden_stems_label"] for k, v in enriched.items()}
        natal["shi_shen"] = {k: v["shi_shen"] for k, v in enriched.items()}
        natal["twelve_stages"] = {k: v["twelve_stage"] for k, v in enriched.items()}
        natal["pillar_detail"] = enriched
        natal["year_stem"] = manual_pillars["year"][0] if manual_pillars["year"] else ""
        natal["year_yin_yang"] = stem_yin_yang(natal["year_stem"])

    if profile.get("strength"):
        natal["strength"] = profile["strength"]
    if profile.get("favorable_elements"):
        natal["favorable_elements"] = profile["favorable_elements"]
    if profile.get("notes"):
        natal["notes"] = profile["notes"]
    target_chart = chart_for_datetime(target)
    relation = relation_to_day_master(natal["day_master_element"], target_chart["element_counts"])
    return {
        "ok": True,
        "profile_name": args.name if args.name else None,
        "question": args.question or "",
        "natal": natal,
        "target_chart": target_chart,
        "relation": relation,
        "analysis_instruction": (
            "Use this JSON as deterministic context. Write the fortune explanation yourself; "
            "do not call an LLM API from the script."
        ),
    }


def emit(data: Dict[str, Any]) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="GoodDay BaZi deterministic helper")
    sub = parser.add_subparsers(dest="command", required=True)

    save = sub.add_parser("save-profile", help="Save or update a birth profile")
    save.add_argument("--name", default="default")
    save.add_argument("--gender", required=True, choices=["男", "女"])
    save.add_argument("--birth", required=True, help='Solar datetime, e.g. "1998-05-12 09:30"')
    save.add_argument("--pillars", help='Manually confirmed four pillars, e.g. "己卯 辛未 丁卯 辛亥"')
    save.add_argument("--strength", help='Body strength note, e.g. "身偏弱"')
    save.add_argument("--favorable-elements", help='Favorable elements, e.g. "木,火"')
    save.add_argument("--notes", help="Additional profile notes")
    save.set_defaults(func=cmd_save_profile)

    list_profiles = sub.add_parser("list-profiles", help="List saved profiles")
    list_profiles.set_defaults(func=cmd_list_profiles)

    chart = sub.add_parser("chart", help="Calculate target date GanZhi and Wu Xing")
    chart.add_argument("--target", help='Target datetime, default now, e.g. "2026-04-10 09:00"')
    chart.set_defaults(func=cmd_chart)

    analyze = sub.add_parser("analyze", help="Build deterministic context for a fortune answer")
    analyze.add_argument("--name", help="Saved profile name")
    analyze.add_argument("--gender", choices=["男", "女"], help="Gender for direct --birth mode")
    analyze.add_argument("--birth", help='Solar birth datetime, e.g. "1998-05-12 09:30"')
    analyze.add_argument("--pillars", help='Manually confirmed four pillars for direct --birth mode')
    analyze.add_argument("--strength", help="Body strength note for direct --birth mode")
    analyze.add_argument("--favorable-elements", help='Favorable elements for direct --birth mode, e.g. "木,火"')
    analyze.add_argument("--target", help="Target datetime, default now")
    analyze.add_argument("--question", default="", help="User question to include in output context")
    analyze.set_defaults(func=cmd_analyze)
    return parser


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        emit(args.func(args))
        return 0
    except Exception as exc:
        emit({"ok": False, "error": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
