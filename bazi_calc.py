import datetime

candidates = []
for year in range(1900, 2101):
    if year % 10 == 9 and year % 12 == 7:
        candidates.append(year)
print(f"己卯年候选: {candidates}")

def get_day_pillar(year, month, day):
    base = datetime.date(2000, 1, 1)
    target = datetime.date(year, month, day)
    delta = (target - base).days
    h = (4 + delta) % 10  # 戊=4
    e = (6 + delta) % 12  # 午=6
    stems = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
    branches = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
    return stems[h] + branches[e]

def get_month_pillar(year, month):
    stems = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
    branches = ['寅','卯','辰','巳','午','未','申','酉','戌','亥','子','丑']
    year_gan = (year - 4) % 10
    offset_map = {0:2, 5:2, 1:4, 6:4, 2:6, 7:6, 3:8, 8:8, 4:0, 9:0}
    first_month_gan = offset_map[year_gan]
    month_gan = (first_month_gan + month - 1) % 10
    month_zhi = (month - 1) % 12
    return stems[month_gan] + branches[month_zhi]

# 验证已知日期
print(f"2024-01-01 日柱 = {get_day_pillar(2024, 1, 1)}")
print(f"2024-09-17 日柱 = {get_day_pillar(2024, 9, 17)}")
print(f"2000-01-01 日柱 = {get_day_pillar(2000, 1, 1)}")

# 搜索符合条件的日期
print("\n搜索己卯年 + 丁卯月 + 甲戌日:")
for year in candidates:
    for month in [2]:
        mp = get_month_pillar(year, month)
        if mp == "丁卯":
            if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0):
                dim = 29
            else:
                dim = 28
            for day in range(1, dim + 1):
                dp = get_day_pillar(year, month, day)
                if dp == "甲戌":
                    print(f"  {year}年{month}月{day}日 -> 八字: 己卯 丁卯 甲戌 丁卯")

# 也查一下1999年己卯年
print("\n\n验证1999年各月月柱:")
for m in range(1, 13):
    print(f"  1999年{m}月: {get_month_pillar(1999, m)}")

print("\n验证1939年各月月柱:")
for m in range(1, 13):
    print(f"  1939年{m}月: {get_month_pillar(1939, m)}")
