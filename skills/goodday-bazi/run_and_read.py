#!/usr/bin/env python
"""Run the bazi script and capture output properly."""
import subprocess
import json
import sys

result = subprocess.run(
    [sys.executable, 'scripts/goodday_bazi.py', 'analyze',
     '--name', 'bazi_manual',
     '--gender', '男',
     '--birth', '2000-01-01 12:00',
     '--pillars', '己卯 丁卯 甲戌 丁卯',
     '--target', '2026-05-05 12:00'],
    capture_output=True, text=False,
    cwd=r'D:\窦中君\实习\产出\skills\goodday-bazi'
)

# Decode with gbk (cp936) since Windows uses that
stdout_text = result.stdout.decode('gbk', errors='replace')
data = json.loads(stdout_text)
natal = data['natal']

print('=== 四柱表 ===')
for k, v in natal['pillars'].items():
    print(f'  {k}: {v}')
print()

print(f'日主: {natal["day_master"]}（{natal["day_master_element"]}）')
print()

print('=== 五行计数 ===')
print(json.dumps(natal['element_counts'], ensure_ascii=False))
print()

print('=== 藏干 ===')
print(json.dumps(natal['hidden_stems_labels'], ensure_ascii=False))
print()

print('=== 十神 ===')
print(json.dumps(natal['shi_shen'], ensure_ascii=False))
print()

print('=== 十二长生 ===')
print(json.dumps(natal['twelve_stages'], ensure_ascii=False))
print()

print('=== 当前大运 ===')
print(f'大运: {natal["current_dayun"]["gan_zhi"]}  {natal["current_dayun"]["start_age"]}-{natal["current_dayun"]["end_age"]}岁')
print()

print('=== 大运列表 ===')
for dy in natal['dayun_ranges']:
    s = dy.get('gan_zhi', '')
    print(f'  {s}  {dy["start_age"]}-{dy["end_age"]}岁（{dy["start_year"]}-{dy["end_year"]}）')
print()

print('=== 当前流年 ===')
print(f'流年: {natal["current_liunian"]}')
print()

print('=== 柱详细信息 ===')
for key in ['year', 'month', 'day', 'hour']:
    det = natal['pillar_detail'][key]
    stem = natal['pillars'][key][0]
    branch = natal['pillars'][key][1]
    print(f'  {key}: {stem}{branch}')
    print(f'    天干: {det["stem_yin_yang"]}{det["stem_element"]} 地支: {det["branch_yin_yang"]}{det["branch_element"]}')
    print(f'    十神: {det["shi_shen"]}  藏干: {det["hidden_stems_label"]}  长生: {det["twelve_stage"]}')
