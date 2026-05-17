# lunar_calendar/ganzhi.py
# 干支推算模块 (使用 cnlunar 库)

from datetime import datetime
from typing import Tuple, Dict
import cnlunar

# 干支表
HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']


def _parse_ganzhi(gz_str: str) -> Tuple[str, str]:
    """解析干支字符串为(干, 支)元组"""
    if len(gz_str) >= 2:
        return (gz_str[0], gz_str[1])
    return ('', '')


def get_day_ganzhi(year: int, month: int, day: int) -> Tuple[str, str]:
    """
    获取日干支

    Args:
        year, month, day: 公历日期

    Returns:
        (日干, 日支) 例如 ('甲', '子')
    """
    lunar = cnlunar.Lunar(datetime(year, month, day))
    return _parse_ganzhi(lunar.day8Char)


def get_hour_branch(hour: int) -> str:
    """
    获取时支

    时辰对应:
    23:00-01:00 子时
    01:00-03:00 丑时
    03:00-05:00 寅时
    ...以此类推

    Args:
        hour: 24小时制的小时数 (0-23)

    Returns:
        时支
    """
    if hour >= 23 or hour < 1:
        return '子'

    # 1-3点是丑时(索引1), 3-5点是寅时(索引2), ...
    idx = (hour + 1) // 2
    return EARTHLY_BRANCHES[idx]


def get_hour_ganzhi(year: int, month: int, day: int, hour: int) -> Tuple[str, str]:
    """
    获取时干支

    时干由日干推算：
    甲己日起甲子时
    乙庚日起丙子时
    丙辛日起戊子时
    丁壬日起庚子时
    戊癸日起壬子时

    Args:
        year, month, day: 公历日期
        hour: 24小时制小时数

    Returns:
        (时干, 时支)
    """
    day_stem, _ = get_day_ganzhi(year, month, day)
    hour_branch = get_hour_branch(hour)

    # 日干决定子时起始天干
    stem_to_zishi = {
        '甲': 0, '己': 0,  # 甲子时起
        '乙': 2, '庚': 2,  # 丙子时起
        '丙': 4, '辛': 4,  # 戊子时起
        '丁': 6, '壬': 6,  # 庚子时起
        '戊': 8, '癸': 8   # 壬子时起
    }

    base_stem_idx = stem_to_zishi[day_stem]
    hour_idx = EARTHLY_BRANCHES.index(hour_branch)
    hour_stem_idx = (base_stem_idx + hour_idx) % 10

    return (HEAVENLY_STEMS[hour_stem_idx], hour_branch)


def get_full_ganzhi(dt: datetime) -> Dict[str, Tuple[str, str]]:
    """
    获取完整四柱

    Args:
        dt: datetime对象

    Returns:
        {'year': (干,支), 'month': (干,支), 'day': (干,支), 'hour': (干,支)}
    """
    lunar = cnlunar.Lunar(dt)

    # 年柱
    year_gz = _parse_ganzhi(lunar.year8Char)

    # 月柱
    month_gz = _parse_ganzhi(lunar.month8Char)

    # 日柱
    day_gz = _parse_ganzhi(lunar.day8Char)

    # 时柱
    hour_gz = get_hour_ganzhi(dt.year, dt.month, dt.day, dt.hour)

    return {
        'year': year_gz,
        'month': month_gz,
        'day': day_gz,
        'hour': hour_gz
    }


def get_branch_index(branch: str) -> int:
    """获取地支索引 (子=0, 丑=1, ..., 亥=11)"""
    return EARTHLY_BRANCHES.index(branch)


def get_branch_by_index(index: int) -> str:
    """根据索引获取地支"""
    return EARTHLY_BRANCHES[index % 12]


def get_stem_index(stem: str) -> int:
    """获取天干索引 (甲=0, 乙=1, ..., 癸=9)"""
    return HEAVENLY_STEMS.index(stem)


def get_stem_by_index(index: int) -> str:
    """根据索引获取天干"""
    return HEAVENLY_STEMS[index % 10]
