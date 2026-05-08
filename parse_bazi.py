import json

with open(r'C:\Users\DELL\.claude\tmp_bazi_raw.txt', 'r', encoding='utf-8') as f:
    data = json.load(f)

natal = data['natal']
target = data['target_chart']
rel = data['relation']

lines = []
lines.append('=== NATAL ===')
lines.append('pillars: ' + natal['pillars']['year'] + ' ' + natal['pillars']['month'] + ' ' + natal['pillars']['day'] + ' ' + natal['pillars']['hour'])
lines.append('shi_shen: ' + natal['shi_shen']['year'] + ' ' + natal['shi_shen']['month'] + ' ' + natal['shi_shen']['day'] + ' ' + natal['shi_shen']['hour'])
lines.append('hidden: ' + natal['hidden_stems_labels']['year'] + ' | ' + natal['hidden_stems_labels']['month'] + ' | ' + natal['hidden_stems_labels']['day'] + ' | ' + natal['hidden_stems_labels']['hour'])
lines.append('12stages: ' + natal['twelve_stages']['year'] + ' ' + natal['twelve_stages']['month'] + ' ' + natal['twelve_stages']['day'] + ' ' + natal['twelve_stages']['hour'])
lines.append('elements: ' + json.dumps(natal['element_counts'], ensure_ascii=False))
lines.append('day_master: ' + natal['day_master'] + '(' + natal['day_master_element'] + ')')
lines.append('strength: ' + natal['strength'])
lines.append('fav: ' + json.dumps(natal['favorable_elements'], ensure_ascii=False))
lines.append('dayun: ' + natal['current_dayun']['gan_zhi'] + ' (' + str(natal['current_dayun']['start_year']) + '-' + str(natal['current_dayun']['end_year']) + ')')
lines.append('liunian: ' + natal['current_liunian'])
lines.append('')
lines.append('=== TARGET 2026-05-09 ===')
lines.append('lunar: ' + target['lunar'])
lines.append('pillars: ' + target['pillars']['year'] + ' ' + target['pillars']['month'] + ' ' + target['pillars']['day'] + ' ' + target['pillars']['hour'])
lines.append('elements: ' + json.dumps(target['element_counts'], ensure_ascii=False))
lines.append('shi_shen: ' + target['shi_shen']['year'] + ' ' + target['shi_shen']['month'] + ' ' + target['shi_shen']['day'] + ' ' + target['shi_shen']['hour'])
lines.append('12stages: ' + target['twelve_stages']['year'] + ' ' + target['twelve_stages']['month'] + ' ' + target['twelve_stages']['day'] + ' ' + target['twelve_stages']['hour'])
lines.append('hidden: ' + target['hidden_stems_labels']['year'] + ' | ' + target['hidden_stems_labels']['month'] + ' | ' + target['hidden_stems_labels']['day'] + ' | ' + target['hidden_stems_labels']['hour'])
lines.append('hints: ' + json.dumps(rel['hints'], ensure_ascii=False))

out = '\n'.join(lines)
with open(r'parse_bazi_out.txt', 'w', encoding='utf-8') as f:
    f.write(out)
print('done')
