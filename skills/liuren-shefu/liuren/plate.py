# liuren/plate.py
# 式盘状态类

from dataclasses import dataclass, field
from typing import List, Dict

# 地支列表（用于索引转换）
EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']


@dataclass
class Lesson:
    """一课数据"""
    heaven: str  # 天盘（上神）
    earth: str   # 地盘
    index: int   # 第几课 (1-4)
    general: str = ""  # 天将


@dataclass
class Pass:
    """一传数据"""
    branch: str  # 地支
    index: int   # 第几传 (1=初传, 2=中传, 3=末传)
    general: str = ""  # 天将


@dataclass
class LiurenPlate:
    """六壬式盘完整状态"""
    day_stem: str                    # 日干
    day_branch: str                  # 日支
    hour_branch: str                 # 时支
    moon_general: str                # 月将地支
    moon_general_name: str           # 月将名称
    heaven_plate: Dict[str, str]     # 地盘位置 -> 天盘地支
    generals_plate: Dict[str, str] = field(default_factory=dict)  # 地支 -> 天将
    guiren_branch: str = ""          # 贵人所临地支
    lessons: List[Lesson] = field(default_factory=list)      # 四课
    passes: List[Pass] = field(default_factory=list)         # 三传
    lesson_type: str = ""            # 课体名称
    derivation_log: List[str] = field(default_factory=list)  # 推导过程记录


def build_heaven_plate(moon_general: str, hour_branch: str) -> Dict[str, str]:
    """
    构建天地盘映射

    月将加临时支：月将地支落在时支位置
    例如：亥将加临午时，意味着天盘的亥在地盘的午位

    计算方法：
    - offset = moon_general_index - hour_branch_index
    - 对于每个地盘位置，天盘地支 = (地盘索引 + offset) % 12

    Args:
        moon_general: 月将地支
        hour_branch: 时支

    Returns:
        Dict[str, str]: {地盘地支: 天盘地支}
    """
    moon_idx = EARTHLY_BRANCHES.index(moon_general)
    hour_idx = EARTHLY_BRANCHES.index(hour_branch)

    # 偏移量：月将需要移动到时支位置
    offset = moon_idx - hour_idx

    heaven_plate = {}
    for i, earth_branch in enumerate(EARTHLY_BRANCHES):
        heaven_idx = (i + offset) % 12
        heaven_plate[earth_branch] = EARTHLY_BRANCHES[heaven_idx]

    return heaven_plate


def get_heaven_branch(heaven_plate: Dict[str, str], earth_branch: str) -> str:
    """
    获取某地盘位置上的天盘地支（上神）

    Args:
        heaven_plate: 天地盘映射
        earth_branch: 地盘地支

    Returns:
        该位置的天盘地支
    """
    return heaven_plate[earth_branch]


def is_fuyin(moon_general: str, hour_branch: str) -> bool:
    """
    判断是否伏吟（天地盘重合）

    伏吟条件：月将等于时支

    Args:
        moon_general: 月将地支
        hour_branch: 时支

    Returns:
        是否伏吟
    """
    return moon_general == hour_branch


def is_fanyin(moon_general: str, hour_branch: str) -> bool:
    """
    判断是否返吟（天地盘对冲）

    返吟条件：月将与时支相冲

    Args:
        moon_general: 月将地支
        hour_branch: 时支

    Returns:
        是否返吟
    """
    from config import BRANCH_CHONG
    return BRANCH_CHONG[moon_general] == hour_branch
