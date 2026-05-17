# liuren/generals.py
# 天将计算模块

from typing import Dict
from config import STEM_YINYANG, EARTHLY_BRANCHES
from liuren.constants import STEM_GUIREN, GENERAL_ORDER

# 昼时地支（卯-申为昼，用阳贵人）
DAY_BRANCHES = ['卯', '辰', '巳', '午', '未', '申']


def is_daytime(hour_branch: str) -> bool:
    """
    判断是否为白天（昼夜贵人法）
    卯-申时为昼（用阳贵人）
    酉-寅时为夜（用阴贵人）

    Args:
        hour_branch: 时支

    Returns:
        是否为白天
    """
    return hour_branch in DAY_BRANCHES


def get_guiren_branch(day_stem: str, hour_branch: str) -> str:
    """
    获取贵人起点地支（昼夜贵人法）

    口诀：
    - 甲戊庚牛羊（阳贵丑，阴贵未）
    - 乙己鼠猴乡（阳贵子，阴贵申）
    - 丙丁猪鸡位（阳贵亥，阴贵酉）
    - 壬癸兔蛇藏（阳贵卯，阴贵巳）
    - 六辛逢马虎（阳贵午，阴贵寅）

    Args:
        day_stem: 日干
        hour_branch: 时支

    Returns:
        贵人所在的地支
    """
    yang_guiren, yin_guiren = STEM_GUIREN[day_stem]
    return yang_guiren if is_daytime(hour_branch) else yin_guiren


def build_generals_plate(day_stem: str, hour_branch: str) -> tuple:
    """
    构建天将盘

    规则：
    1. 确定贵人起点地支（根据日干和昼夜）
    2. 贵人落在该地支位置
    3. 顺逆根据贵人所临地盘位置决定：
       - 贵人临亥子丑寅卯辰 → 顺布
       - 贵人临巳午未申酉戌 → 逆布

    Args:
        day_stem: 日干
        hour_branch: 时支

    Returns:
        tuple: (天将盘Dict[str, str], 贵人所临地支str)
    """
    # 获取贵人所在地支
    guiren_branch = get_guiren_branch(day_stem, hour_branch)
    guiren_idx = EARTHLY_BRANCHES.index(guiren_branch)

    # 顺逆根据贵人所临地盘位置决定
    SHUN_BRANCHES = {'亥', '子', '丑', '寅', '卯', '辰'}  # 贵人临此六宫顺布
    is_shun = guiren_branch in SHUN_BRANCHES

    # 构建天将盘
    generals_plate = {}

    for i, general in enumerate(GENERAL_ORDER):
        if is_shun:
            # 顺布（顺时针）
            branch_idx = (guiren_idx + i) % 12
        else:
            # 逆布（逆时针）
            branch_idx = (guiren_idx - i) % 12

        branch = EARTHLY_BRANCHES[branch_idx]
        generals_plate[branch] = general

    return generals_plate, guiren_branch


def get_general_for_heaven_branch(generals_plate: Dict[str, str], heaven_branch: str) -> str:
    """
    获取天盘地支对应的天将

    天将跟着天盘走，所以要看天盘地支对应的天将

    Args:
        generals_plate: 天将盘 {地支: 天将}
        heaven_branch: 天盘地支

    Returns:
        天将名称
    """
    return generals_plate.get(heaven_branch, '')
