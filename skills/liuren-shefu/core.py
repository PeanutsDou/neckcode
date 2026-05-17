# core.py
import datetime

def get_chinese_hour(dt):
    """ 获取当前时辰的地支索引 (0=子, 1=丑...) """
    h = dt.hour
    # 23:00-01:00 是子时
    if h >= 23 or h < 1: return 0
    return (h + 1) // 2

def get_moon_general(dt):
    """ 获取当前月将索引 (简化版：基于月份) """
    # 真正的排盘需要查万年历看是否过了中气，这里用月份粗略模拟
    # 1月(小寒-大寒) -> 丑月 -> 月将为子(神后, idx 0)
    # 修正映射：1月->子将(0), 2月->亥将(11)... 这是一个循环偏移
    m = dt.month
    idx = (13 - m) % 12 
    return idx