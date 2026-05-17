#!/usr/bin/env python
import subprocess
import json
import sys

result = subprocess.run(
    [sys.executable, 'scripts/goodday_bazi.py', 'analyze',
     '--gender', '男',
     '--birth', '1999-03-23 05:18',
     '--target', '2026-05-05 12:00'],
    capture_output=True, text=False,
    cwd=r'D:\窦中君\实习\产出\skills\goodday-bazi'
)

stdout_text = result.stdout.decode('gbk', errors='replace')
data = json.loads(stdout_text)
natal = data['natal']

print('=== 出生信息 ===')
print(f'公历: {natal["birth_solar"]}')
print(f'农历: {natal["birth_lunar"]}')
print(f'性别: {natal["gender"]}')
print()

print('=== 四柱 ===')
print(json.dumps(natal['pillars'], ensure_ascii=False))
print()

print(f'日主: {natal["day_master"]}（{natal["day_master_element"]}）')
print(f'年干: {natal["year_stem"]}（{natal["year_yin_yang"]}年）')
print()

print('=== 五行计数 ===')
print(json.dumps(natal['element_counts'], ensure_ascii=False))
print()

print('=== 十神 ===')
print(json.dumps(natal['shi_shen'], ensure_ascii=False))
print()

print('=== 十二长生 ===')
print(json.dumps(natal['twelve_stages'], ensure_ascii=False))
print()

print('=== 藏干 ===')
print(json.dumps(natal['hidden_stems_labels'], ensure_ascii=False))
print()

print('=== 当前大运 ===')
print(json.dumps(natal['current_dayun'], ensure_ascii=False))
print()

print('=== 大运列表 ===')
for dy in natal['dayun_ranges']:
    s = dy.get('gan_zhi', '')
    print(f'{s}  {dy["start_age"]}-{dy["end_age"]}岁  （{dy["start_year"]}-{dy["end_year"]}）')
print()

print('=== 当前流年 ===')
print(f'流年: {natal["current_liunian"]}')
