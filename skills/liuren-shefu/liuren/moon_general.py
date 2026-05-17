# liuren/moon_general.py
# 月将计算模块

from datetime import datetime
from lunar_calendar.solar_terms import get_current_zhongqi
from liuren.constants import ZHONGQI_MOON_GENERAL, MOON_GENERAL_NAMES


def get_moon_general(dt: datetime) -> tuple:
    """
    获取月将

    月将根据当前中气确定：
    - 雨水后用亥将（登明）
    - 春分后用戌将（河魁）
    - 谷雨后用酉将（从魁）
    - ...以此类推

    Args:
        dt: datetime对象

    Returns:
        (月将地支, 月将名称) 例如: ('亥', '登明')
    """
    zhongqi = get_current_zhongqi(dt)
    branch = ZHONGQI_MOON_GENERAL[zhongqi]
    name = MOON_GENERAL_NAMES[branch]
    return (branch, name)


def get_moon_general_by_zhongqi(zhongqi: str) -> tuple:
    """
    根据中气名称获取月将

    Args:
        zhongqi: 中气名称（如'春分', '夏至'等）

    Returns:
        (月将地支, 月将名称)
    """
    branch = ZHONGQI_MOON_GENERAL[zhongqi]
    name = MOON_GENERAL_NAMES[branch]
    return (branch, name)
