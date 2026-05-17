# lunar_calendar/solar_terms.py
# 节气计算模块 (使用 cnlunar 库)

from datetime import datetime, date
from typing import Optional
import cnlunar

# 节气名称列表 (按年历顺序)
JIEQI_NAMES = [
    '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
    '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
    '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
    '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
]

# 中气列表（用于月将计算，奇数索引的节气）
# 大寒(1), 雨水(3), 春分(5), 谷雨(7), 小满(9), 夏至(11)
# 大暑(13), 处暑(15), 秋分(17), 霜降(19), 小雪(21), 冬至(23)
ZHONGQI_NAMES = [
    '大寒', '雨水', '春分', '谷雨', '小满', '夏至',
    '大暑', '处暑', '秋分', '霜降', '小雪', '冬至'
]


def get_solar_terms_dict(year: int) -> dict:
    """
    获取指定年份所有节气的日期

    Args:
        year: 年份

    Returns:
        dict: {节气名: datetime对象}
    """
    # 使用该年某一天获取节气字典
    lunar = cnlunar.Lunar(datetime(year, 6, 15))
    terms_dict = lunar.thisYearSolarTermsDic

    result = {}
    for name, (month, day) in terms_dict.items():
        result[name] = datetime(year, month, day)

    return result


def get_current_zhongqi(dt: datetime) -> str:
    """
    获取当前生效的中气（用于月将计算）

    月将以中气为界，过中气后使用新的月将。
    例如：春分后用戌将，谷雨后用酉将。

    Args:
        dt: 日期时间

    Returns:
        当前生效的中气名称
    """
    year = dt.year
    current_date = dt.date() if isinstance(dt, datetime) else dt

    # 获取当年和上一年的节气
    this_year_terms = get_solar_terms_dict(year)
    last_year_terms = get_solar_terms_dict(year - 1)

    # 构建中气时间列表（包括上一年的冬至和当年的所有中气）
    zhongqi_dates = []

    # 上一年冬至
    if '冬至' in last_year_terms:
        zhongqi_dates.append(('冬至', last_year_terms['冬至'].date()))

    # 当年所有中气
    for name in ZHONGQI_NAMES:
        if name in this_year_terms:
            zhongqi_dates.append((name, this_year_terms[name].date()))

    # 按日期排序
    zhongqi_dates.sort(key=lambda x: x[1])

    # 找到当前日期之前最近的中气
    current_zhongqi = zhongqi_dates[0][0]  # 默认第一个
    for name, term_date in zhongqi_dates:
        if term_date <= current_date:
            current_zhongqi = name
        else:
            break

    return current_zhongqi


def get_solar_term_of_day(dt: datetime) -> Optional[str]:
    """
    检查指定日期是否是节气日

    Args:
        dt: datetime对象

    Returns:
        节气名称，如果当天不是节气则返回None
    """
    lunar = cnlunar.Lunar(dt)
    term = lunar.todaySolarTerms

    if term == '无':
        return None
    return term


def get_next_solar_term(dt: datetime) -> tuple:
    """
    获取下一个节气

    Args:
        dt: datetime对象

    Returns:
        (节气名称, 节气日期)
    """
    lunar = cnlunar.Lunar(dt)
    name = lunar.nextSolarTerm
    term_date = lunar.nextSolarTermDate

    return (name, term_date)
