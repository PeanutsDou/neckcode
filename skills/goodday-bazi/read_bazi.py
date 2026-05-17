#!/usr/bin/env python
import json

with open('output.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

natal = data['natal']

print('=== 四柱 ===')
print(json.dumps(natal['pillars'], ensure_ascii=False, indent=2))
print()

print('=== 日主 ===')
print(f'日主: {natal["day_master"]}（{natal["day_master_element"]}）')
print()

print('=== 五行计数 ===')
print(json.dumps(natal['element_counts'], ensure_ascii=False))
print()

print('=== 藏干 ===')
print(json.dumps(natal['hidden_stems_labels'], ensure_ascii=False, indent=2))
print()

print('=== 十神 ===')
print(json.dumps(natal['shi_shen'], ensure_ascii=False, indent=2))
print()

print('=== 十二长生 ===')
print(json.dumps(natal['twelve_stages'], ensure_ascii=False, indent=2))
print()

print('=== 当前大运 ===')
print(json.dumps(natal['current_dayun'], ensure_ascii=False, indent=2))
print()

print('=== 大运列表 ===')
for dy in natal['dayun_ranges']:
    s = dy.get('gan_zhi', '')
    print(f'{s}  {dy["start_age"]}-{dy["end_age"]}岁（{dy["start_year"]}-{dy["end_year"]}）')
print()

print('=== 当前流年 ===')
print(f'流年: {natal["current_liunian"]}')
print()

print('=== 详细柱信息 ===')
for key, detail in natal['pillar_detail'].items():
    print(f'{key}: 天干={detail["stem_yin_yang"]}{detail["stem_element"]} 地支={detail["branch_yin_yang"]}{detail["branch_element"]}')
    print(f'   十神={detail["shi_shen"]} 藏干={detail["hidden_stems_label"]} 长生={detail["twelve_stage"]}')
