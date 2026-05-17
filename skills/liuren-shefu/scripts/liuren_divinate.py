"""
六壬排盘 CLI — 输入时间，输出四课三传
"""
import sys
import os
import argparse
import datetime

# 确保能找到上级目录的模块
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__))))

from liuren.plate import build_heaven_plate, EARTHLY_BRANCHES, LiurenPlate
from lunar_calendar.ganzhi import get_day_ganzhi, get_hour_branch
from liuren.moon_general import get_moon_general
from liuren.four_lessons import calculate_four_lessons
from liuren.three_passes import calculate_three_passes
from liuren.generals import build_generals_plate
from config import (
    EARTHLY_BRANCHES as EB, HEAVENLY_STEMS as HS,
    STEM_WUXING, BRANCH_WUXING, MOON_GENERALS
)


def divinate(dt: datetime.datetime) -> dict:
    """给定时间返回六壬盘结果"""
    day_stem, day_branch = get_day_ganzhi(dt.year, dt.month, dt.day)
    hour_branch = get_hour_branch(dt.hour)
    mg_branch, mg_name = get_moon_general(dt)

    heaven = build_heaven_plate(mg_branch, hour_branch)
    generals, guiren_branch = build_generals_plate(day_stem, hour_branch)

    plate = LiurenPlate(
        day_stem=day_stem, day_branch=day_branch, hour_branch=hour_branch,
        moon_general=mg_branch, moon_general_name=mg_name,
        heaven_plate=heaven, generals_plate=generals,
        guiren_branch=guiren_branch
    )

    lessons = calculate_four_lessons(plate)
    passes, lesson_type = calculate_three_passes(plate, lessons)

    return {
        'time': dt,
        'day_stem': day_stem,
        'day_branch': day_branch,
        'hour_branch': hour_branch,
        'moon_general': mg_name,
        'moon_general_branch': mg_branch,
        'heaven_plate': heaven,
        'generals_plate': generals,
        'guiren_branch': guiren_branch,
        'lessons': lessons,
        'passes': passes,
        'lesson_type': lesson_type,
    }


def format_output(result: dict) -> str:
    """格式化输出"""
    lines = []
    dt = result['time']
    lines.append(f"时间: {dt.strftime('%Y年%m月%d日 %H:%M')}")
    lines.append(f"日柱: {result['day_stem']}{result['day_branch']}")
    lines.append(f"时支: {result['hour_branch']}")
    lines.append(f"月将: {result['moon_general']} ({result['moon_general_branch']})")
    lines.append(f"贵人: {result['guiren_branch']}")

    lines.append("\n【四课】")
    ls = result['lessons']
    lines.append(f"  一课  二课  三课  四课")
    lines.append(f"  {ls[0].heaven}    {ls[1].heaven}    {ls[2].heaven}    {ls[3].heaven}")
    lines.append(f"  {ls[0].earth}    {ls[1].earth}    {ls[2].earth}    {ls[3].earth}")

    lines.append(f"\n【课体】{result['lesson_type']}")
    lines.append(f"\n【三传】")
    for p in result['passes']:
        labels = {1: '初传', 2: '中传', 3: '末传'}
        lines.append(f"  {labels[p.index]}: {p.branch} ({p.general})")

    lines.append(f"\n【天将盘】")
    for eb in EB:
        g = result['generals_plate'].get(eb, '')
        h = result['heaven_plate'].get(eb, '')
        if g:
            lines.append(f"  {eb} → 天盘{h} → {g}")

    return '\n'.join(lines)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='六壬排盘')
    parser.add_argument('--year', type=int, default=None)
    parser.add_argument('--month', type=int, default=None)
    parser.add_argument('--day', type=int, default=None)
    parser.add_argument('--hour', type=int, default=None)
    parser.add_argument('--minute', type=int, default=0)
    args = parser.parse_args()

    now = datetime.datetime.now()
    year = args.year if args.year is not None else now.year
    month = args.month if args.month is not None else now.month
    day = args.day if args.day is not None else now.day
    hour = args.hour if args.hour is not None else now.hour
    minute = args.minute

    dt = datetime.datetime(year, month, day, hour, minute)
    result = divinate(dt)
    output = format_output(result)
    print(output)
