# liuren/derivation.py
# 详细推导过程生成器（完整决策树版）

from typing import List
from config import (
    STEM_JIGONG, STEM_WUXING, BRANCH_WUXING, WUXING_KE,
    STEM_YINYANG, BRANCH_YINYANG, EARTHLY_BRANCHES,
    BRANCH_CHONG, MOON_GENERALS, BRANCH_YIMA
)
from liuren.plate import LiurenPlate, Lesson, Pass, get_heaven_branch
from liuren.constants import (
    MOON_GENERAL_NAMES, ZHONGQI_MOON_GENERAL,
    STEM_GUIREN, GENERAL_ORDER
)
from liuren.three_passes import (
    find_ke_relations, select_by_biyong, calculate_shehai_depth,
    get_initial_by_shehai, is_ke, is_branch_ke_stem,
    get_branch_index, get_branch_by_index,
    find_yaoke
)


def generate_detailed_derivation(plate: LiurenPlate,
                                  lessons: List[Lesson],
                                  passes: List[Pass],
                                  lesson_type: str) -> List[str]:
    """
    Generate comprehensive step-by-step derivation of the 四课三传.
    Includes full decision tree with all branches checked and rejected.
    """
    lines = []

    def add(text):
        lines.append(text)

    def blank():
        lines.append("")

    # ===== Header =====
    add(f"日干支：{plate.day_stem}{plate.day_branch}")
    add(f"时  支：{plate.hour_branch}")
    blank()

    # ===== 1. 月将确定 =====
    add("━━━━━ 一、月将确定 ━━━━━")
    moon_name = MOON_GENERAL_NAMES.get(plate.moon_general, "")
    add(f"月将：{plate.moon_general}（{moon_name}）")
    for zq, br in ZHONGQI_MOON_GENERAL.items():
        if br == plate.moon_general:
            add(f"  中气「{zq}」后用{br}将")
            break
    add(f"  中气月将对照表：")
    for zq, br in ZHONGQI_MOON_GENERAL.items():
        name = MOON_GENERAL_NAMES.get(br, "")
        marker = " ←当前" if br == plate.moon_general else ""
        add(f"    {zq} → {br}（{name}）{marker}")
    blank()

    # ===== 2. 天盘旋转 =====
    add("━━━━━ 二、天盘旋转 ━━━━━")
    add(f"原理：将月将{plate.moon_general}放置于时支{plate.hour_branch}位，")
    add(f"      整个天盘随之旋转")
    moon_idx = EARTHLY_BRANCHES.index(plate.moon_general)
    hour_idx = EARTHLY_BRANCHES.index(plate.hour_branch)
    offset = moon_idx - hour_idx
    add(f"偏移量：{plate.moon_general}({moon_idx}) - {plate.hour_branch}({hour_idx}) = {offset}")
    blank()
    add("天地盘对应表：")
    earth_row = "  地盘：" + " ".join(EARTHLY_BRANCHES)
    add(earth_row)
    heaven_list = [plate.heaven_plate[b] for b in EARTHLY_BRANCHES]
    heaven_row = "  天盘：" + " ".join(heaven_list)
    add(heaven_row)
    blank()
    # Verification
    verify_heaven = plate.heaven_plate[plate.hour_branch]
    if verify_heaven == plate.moon_general:
        add(f"  验证：时支{plate.hour_branch}位上天盘确实为月将{plate.moon_general} ✓")
    else:
        add(f"  验证：时支{plate.hour_branch}位上天盘为{verify_heaven}（预期{plate.moon_general}）")
    blank()

    # ===== 3. 四课推导 =====
    add("━━━━━ 三、四课推导 ━━━━━")
    jigong = STEM_JIGONG[plate.day_stem]
    add(f"日干{plate.day_stem}的寄宫：{jigong}")
    add(f"  口诀：甲寅乙辰丙巳丁未戊巳己未庚申辛戌壬亥癸丑")
    blank()

    if len(lessons) >= 4:
        # Lesson 1
        add(f"一课：日干寄宫{jigong}为地盘")
        add(f"  查天地盘表 → {jigong}位上天盘为{lessons[0].heaven}")
        add(f"  一课：{lessons[0].heaven}/{lessons[0].earth}")
        if lessons[0].general:
            add(f"  天将：{lessons[0].general}")
        blank()

        # Lesson 2
        add(f"二课：以一课天盘{lessons[0].heaven}为地盘")
        add(f"  查天地盘表 → {lessons[0].heaven}位上天盘为{lessons[1].heaven}")
        add(f"  二课：{lessons[1].heaven}/{lessons[1].earth}")
        if lessons[1].general:
            add(f"  天将：{lessons[1].general}")
        blank()

        # Lesson 3
        add(f"三课：日支{plate.day_branch}为地盘")
        add(f"  查天地盘表 → {plate.day_branch}位上天盘为{lessons[2].heaven}")
        add(f"  三课：{lessons[2].heaven}/{lessons[2].earth}")
        if lessons[2].general:
            add(f"  天将：{lessons[2].general}")
        blank()

        # Lesson 4
        add(f"四课：以三课天盘{lessons[2].heaven}为地盘")
        add(f"  查天地盘表 → {lessons[2].heaven}位上天盘为{lessons[3].heaven}")
        add(f"  四课：{lessons[3].heaven}/{lessons[3].earth}")
        if lessons[3].general:
            add(f"  天将：{lessons[3].general}")
        blank()

        # Summary table
        add("四课总表：")
        add("        一课  二课  三课  四课")
        generals = [l.general[:2] if l.general else "  " for l in lessons[:4]]
        add(f"  将：  {generals[0]}  {generals[1]}  {generals[2]}  {generals[3]}")
        add(f"  天：  {lessons[0].heaven}    {lessons[1].heaven}    {lessons[2].heaven}    {lessons[3].heaven}")
        add(f"  地：  {lessons[0].earth}    {lessons[1].earth}    {lessons[2].earth}    {lessons[3].earth}")
        blank()

    # ===== 4. 三传推导（完整决策树）=====
    add("━━━━━ 四、三传推导 ━━━━━")
    blank()

    is_fuyin = plate.moon_general == plate.hour_branch
    chong_of_moon = BRANCH_CHONG.get(plate.moon_general)
    is_fanyin = chong_of_moon == plate.hour_branch
    bazhuan_jigong = STEM_JIGONG[plate.day_stem]
    is_bazhuan = bazhuan_jigong == plate.day_branch

    # ---- Step 1: Check 伏吟 ----
    add("【Step 1】检查伏吟")
    add(f"  月将{plate.moon_general} ≟ 时支{plate.hour_branch}")
    if is_fuyin:
        add(f"  → 相等 → 伏吟课 ✓")
        blank()
        add("伏吟：天地盘完全重合，上下一体不动")
        blank()
        # Check if there are ke relations in fuyin
        ke_relations = find_ke_relations(lessons)
        add(f"  检查四课中是否有克关系：")
        _show_ke_check(add, lessons)
        blank()
        if ke_relations:
            add(f"  有{len(ke_relations)}个下克上 → 按正常规则取初传")
            _show_basic_initial(add, plate, lessons, ke_relations)
        else:
            day_yy = STEM_YINYANG[plate.day_stem]
            add(f"  无下克上")
            add(f"  日干{plate.day_stem}为{day_yy}日")
            if day_yy == '阳':
                day_idx = get_branch_index(plate.day_branch)
                target_idx = (day_idx - 1) % 12
                target = get_branch_by_index(target_idx)
                add(f"  阳日无克 → 取日支刑（日支{plate.day_branch}前一位）")
                add(f"  {plate.day_branch}(idx {day_idx}) 前一位 → {target}")
                add(f"  初传：{target}")
            else:
                add(f"  阴日无克 → 取日干寄宫上神")
                add(f"  寄宫{jigong}，伏吟时上神=本位 → {jigong}")
                add(f"  初传：{jigong}")
        blank()
        # 伏吟中末传
        if len(passes) >= 3:
            add("伏吟三传递推：")
            add(f"  初传{passes[0].branch} → 查天地盘表：")
            add(f"    {passes[0].branch}位上天盘为{passes[1].branch} → 中传{passes[1].branch}")
            add(f"  中传{passes[1].branch} → 查天地盘表：")
            add(f"    {passes[1].branch}位上天盘为{passes[2].branch} → 末传{passes[2].branch}")
    else:
        add(f"  → 不等 → 非伏吟 ✗")
    blank()

    # ---- Step 2: Check 返吟 ----
    if not is_fuyin:
        add("【Step 2】检查返吟")
        add(f"  月将{plate.moon_general}的六冲为{chong_of_moon}")
        add(f"  {chong_of_moon} ≟ 时支{plate.hour_branch}")
        if is_fanyin:
            add(f"  → 相等 → 返吟课 ✓")
            blank()
            add("返吟：天地盘六冲对照，阴阳相对")
            yima = BRANCH_YIMA[plate.day_branch]
            add(f"  取日支{plate.day_branch}的驿马")
            # Show yima lookup
            add(f"  驿马表查询：{plate.day_branch} → {yima}")
            add(f"  初传：{yima}")
            blank()
            add("返吟中末传规则：初传→冲→回")
            if len(passes) >= 3:
                chong_of_initial = BRANCH_CHONG[passes[0].branch]
                add(f"  初传{passes[0].branch}的六冲为{chong_of_initial} → 中传{passes[1].branch}")
                add(f"  中传冲回 → 末传{passes[2].branch}（=初传）")
        else:
            add(f"  → 不等 → 非返吟 ✗")
        blank()

    # ---- Step 3: Check 八专 ----
    if not is_fuyin and not is_fanyin:
        add("【Step 3】检查八专")
        add(f"  日干{plate.day_stem}寄宫{bazhuan_jigong} ≟ 日支{plate.day_branch}")
        if is_bazhuan:
            add(f"  → 相等 → 八专课 ✓")
            day_yy = STEM_YINYANG[plate.day_stem]
            add(f"  日干{plate.day_stem}为{day_yy}日")
            if day_yy == '阳':
                add(f"  阳日取第三课上神 → {lessons[2].heaven}")
            else:
                add(f"  阴日取第四课上神 → {lessons[3].heaven}")
            add(f"  初传：{passes[0].branch}")
            blank()
            _show_standard_mid_end(add, passes)
        else:
            add(f"  → 不等 → 非八专 ✗")
        blank()

    # ---- Step 4: Check 下克上 ----
    if not is_fuyin and not is_fanyin and not is_bazhuan:
        add("【Step 4】检查四课下克上关系")
        add(f"  逐课检查：地盘五行是否克天盘五行")
        blank()
        _show_ke_check(add, lessons)
        blank()

        ke_relations = find_ke_relations(lessons)

        if len(ke_relations) == 0:
            add(f"  结果：无下克上（0个）→ 跳至Step 5")
            blank()
        elif len(ke_relations) == 1:
            idx, heaven, earth = ke_relations[0]
            add(f"  结果：仅第{idx}课有下克上 → 元首课")
            add(f"  取被克者（天盘上神）{heaven}为初传")
            add(f"  初传：{passes[0].branch}")
            blank()
            _show_standard_mid_end(add, passes)
        else:
            add(f"  结果：有{len(ke_relations)}个下克上 → 需比用法")
            blank()
            # Biyong
            add("  【比用法】取被克者阴阳与日干相同者")
            day_yy = STEM_YINYANG[plate.day_stem]
            add(f"  日干{plate.day_stem}为{day_yy}")
            for idx, heaven, earth in ke_relations:
                h_yy = BRANCH_YINYANG[heaven]
                match = "匹配 ✓" if h_yy == day_yy else "不匹配 ✗"
                add(f"    第{idx}课被克者{heaven}为{h_yy} → {match}")

            filtered = select_by_biyong(ke_relations, plate.day_stem)
            blank()

            if len(filtered) == 1:
                add(f"  比用后唯一：第{filtered[0][0]}课 → 重审课")
                add(f"  初传：{passes[0].branch}")
                blank()
                _show_standard_mid_end(add, passes)
            else:
                add(f"  比用后仍有{len(filtered)}个 → 需涉害法")
                blank()
                # Shehai
                add("  【涉害法】计算各候选涉害深度")
                add("  涉害深度：从天盘地支所临地盘位置，数到本位，途中受克次数")
                blank()
                for idx, heaven, earth in filtered:
                    depth = calculate_shehai_depth(heaven, plate.heaven_plate)
                    add(f"  第{idx}课 被克者{heaven}：")
                    # Show the detailed counting
                    _show_shehai_detail(add, heaven, plate.heaven_plate)
                    add(f"    涉害深度 = {depth}")
                    blank()

                result = get_initial_by_shehai(filtered, plate.heaven_plate)
                add(f"  取涉害最深者：第{result[0]}课 → 知一课（涉害课）")
                add(f"  初传：{passes[0].branch}")
                blank()
                _show_standard_mid_end(add, passes)

    # ---- Step 5: Check 别责 ----
    if not is_fuyin and not is_fanyin and not is_bazhuan:
        ke_relations = find_ke_relations(lessons)
        if len(ke_relations) == 0:
            stem_yy = STEM_YINYANG[plate.day_stem]
            hour_yy = BRANCH_YINYANG[plate.hour_branch]
            add("【Step 5】检查别责")
            add(f"  日干{plate.day_stem}为{stem_yy}，时支{plate.hour_branch}为{hour_yy}")
            is_bieze = stem_yy != hour_yy
            add(f"  阴阳{'相反' if is_bieze else '相同'}")
            if is_bieze:
                add(f"  → 别责课 ✓")
                add(f"  取日干寄宫{jigong}的上神")
                upper = get_heaven_branch(plate.heaven_plate, jigong)
                add(f"  查天地盘表：{jigong}位上天盘为{upper}")
                add(f"  初传：{passes[0].branch}")
                blank()
                _show_standard_mid_end(add, passes)
            else:
                add(f"  → 阴阳相同，非别责 ✗ → 跳至Step 6")
            blank()

            # ---- Step 6: Check 遥克 ----
            if not is_bieze:
                add("【Step 6】检查遥克")
                add(f"  遍历天盘，找克日干{plate.day_stem}({STEM_WUXING[plate.day_stem]})者：")
                stem_wx = STEM_WUXING[plate.day_stem]
                found_any = False
                for earth_b in EARTHLY_BRANCHES:
                    heaven_b = plate.heaven_plate[earth_b]
                    h_wx = BRANCH_WUXING[heaven_b]
                    if WUXING_KE.get(h_wx) == stem_wx:
                        add(f"    天盘{heaven_b}({h_wx}) 克 日干{plate.day_stem}({stem_wx}) ✓")
                        found_any = True
                    # Only show non-matches briefly

                yaoke_list = find_yaoke(plate.heaven_plate, plate.day_stem)
                blank()

                if yaoke_list:
                    if len(yaoke_list) == 1:
                        add(f"  仅1个遥克 → 蒿矢课")
                    else:
                        add(f"  有{len(yaoke_list)}个遥克")
                        day_yy = STEM_YINYANG[plate.day_stem]
                        add(f"  日干{plate.day_stem}为{day_yy}，取阴阳匹配者 → 弹射课")
                    add(f"  初传：{passes[0].branch}")
                    blank()
                    _show_standard_mid_end(add, passes)
                else:
                    add("  无遥克 → 跳至Step 7")
                blank()

                # ---- Step 7: 昴星 ----
                if not yaoke_list:
                    add("【Step 7】昴星法（最终兜底）")
                    day_yy = STEM_YINYANG[plate.day_stem]
                    day_idx = get_branch_index(plate.day_branch)
                    add(f"  日干{plate.day_stem}为{day_yy}日")
                    if day_yy == '阳':
                        target_idx = (day_idx - 1) % 12
                        target = get_branch_by_index(target_idx)
                        add(f"  阳日取日支{plate.day_branch}前一位（逆时针）")
                        add(f"  {plate.day_branch}(idx {day_idx}) 前一位 → {target}")
                    else:
                        target_idx = (day_idx + 1) % 12
                        target = get_branch_by_index(target_idx)
                        add(f"  阴日取日支{plate.day_branch}后一位（顺时针）")
                        add(f"  {plate.day_branch}(idx {day_idx}) 后一位 → {target}")
                    upper = get_heaven_branch(plate.heaven_plate, target)
                    add(f"  查天地盘表：{target}位上天盘为{upper}")
                    add(f"  初传：{passes[0].branch}")
                    blank()
                    _show_standard_mid_end(add, passes)

    blank()
    # Final summary
    add(f"课体：{lesson_type}")
    if len(passes) >= 3:
        add(f"三传：{passes[0].branch} → {passes[1].branch} → {passes[2].branch}")
    blank()

    # ===== 5. 天将推导 =====
    add("━━━━━ 五、天将推导 ━━━━━")
    if plate.guiren_branch:
        yang_gui, yin_gui = STEM_GUIREN.get(plate.day_stem, ("", ""))
        add(f"日干{plate.day_stem}的贵人：")
        add(f"  阳贵人：{yang_gui}  阴贵人：{yin_gui}")
        add(f"  口诀：甲戊庚牛羊，乙己鼠猴乡，")
        add(f"        丙丁猪鸡位，壬癸兔蛇藏，六辛逢马虎")
        blank()

        from liuren.generals import DAY_BRANCHES
        is_day = plate.hour_branch in DAY_BRANCHES
        add(f"昼夜判断：")
        add(f"  时支{plate.hour_branch}{'∈' if is_day else '∉'}昼时（卯辰巳午未申）")
        add(f"  → {'昼' if is_day else '夜'}时 → 取{'阳' if is_day else '阴'}贵人")
        add(f"  贵人起点：{plate.guiren_branch}")
        blank()

        # Shun/Ni
        SHUN = {'亥', '子', '丑', '寅', '卯', '辰'}
        is_shun = plate.guiren_branch in SHUN
        add(f"顺逆布：")
        add(f"  贵人临{plate.guiren_branch}")
        add(f"  {'亥子丑寅卯辰为顺布' if is_shun else '巳午未申酉戌为逆布'}")
        add(f"  → {'顺' if is_shun else '逆'}布天将")
        blank()

        # Show sequential placement
        add("天将逐位布置：")
        guiren_idx = EARTHLY_BRANCHES.index(plate.guiren_branch)
        for i, general in enumerate(GENERAL_ORDER):
            if is_shun:
                branch_idx = (guiren_idx + i) % 12
            else:
                branch_idx = (guiren_idx - i) % 12
            branch = EARTHLY_BRANCHES[branch_idx]
            add(f"  {general} → {branch}位")

    return lines


def _show_ke_check(add, lessons):
    """Show ke relation check for all 4 lessons."""
    for lesson in lessons[:4]:
        h_wx = BRANCH_WUXING.get(lesson.heaven, "")
        e_wx = BRANCH_WUXING.get(lesson.earth, "")
        is_ke_rel = WUXING_KE.get(e_wx) == h_wx
        if is_ke_rel:
            add(f"  第{lesson.index}课：地盘{lesson.earth}({e_wx}) 克 天盘{lesson.heaven}({h_wx}) → 下克上 ✓")
        else:
            add(f"  第{lesson.index}课：地盘{lesson.earth}({e_wx}) vs 天盘{lesson.heaven}({h_wx}) → 无克 ✗")


def _show_standard_mid_end(add, passes):
    """Show standard middle and final pass lookups."""
    if len(passes) >= 3:
        add("中传/末传递推：")
        add(f"  初传{passes[0].branch} → 查天地盘表：")
        add(f"    {passes[0].branch}位上天盘为{passes[1].branch} → 中传{passes[1].branch}")
        add(f"  中传{passes[1].branch} → 查天地盘表：")
        add(f"    {passes[1].branch}位上天盘为{passes[2].branch} → 末传{passes[2].branch}")


def _show_basic_initial(add, plate, lessons, ke_relations):
    """Show basic initial pass derivation (for fuyin with ke)."""
    if len(ke_relations) == 1:
        idx, heaven, earth = ke_relations[0]
        add(f"  仅第{idx}课有下克上 → 取被克者{heaven}为初传")
    else:
        add(f"  有{len(ke_relations)}个下克上 → 比用法")
        day_yy = STEM_YINYANG[plate.day_stem]
        add(f"  日干{plate.day_stem}为{day_yy}")
        for idx, heaven, earth in ke_relations:
            h_yy = BRANCH_YINYANG[heaven]
            match = "匹配" if h_yy == day_yy else "不匹配"
            add(f"    第{idx}课被克者{heaven}为{h_yy} → {match}")

        filtered = select_by_biyong(ke_relations, plate.day_stem)
        if len(filtered) == 1:
            add(f"  比用后唯一：取{filtered[0][1]}为初传")
        else:
            result = get_initial_by_shehai(filtered, plate.heaven_plate)
            add(f"  涉害法取第{result[0]}课 被克者{result[1]}为初传")


def _show_shehai_detail(add, branch, heaven_plate):
    """Show step-by-step shehai depth calculation."""
    # Find where branch sits on the earth plate
    current_pos = None
    for earth, heaven in heaven_plate.items():
        if heaven == branch:
            current_pos = earth
            break

    if current_pos is None:
        add(f"    （未找到{branch}在天盘中的位置）")
        return

    start_idx = get_branch_index(current_pos)
    end_idx = get_branch_index(branch)

    add(f"    {branch}作为天盘，临地盘{current_pos}位")
    add(f"    从{current_pos}(idx {start_idx})数到{branch}本位(idx {end_idx})：")

    idx = start_idx
    step = 0
    depth = 0
    while idx != end_idx:
        current_branch = get_branch_by_index(idx)
        heaven_at_pos = heaven_plate[current_branch]
        h_wx = BRANCH_WUXING[heaven_at_pos]
        b_wx = BRANCH_WUXING[branch]
        is_ke_here = WUXING_KE.get(h_wx) == b_wx
        if is_ke_here:
            depth += 1
            add(f"      {current_branch}位天盘{heaven_at_pos}({h_wx})克{branch}({b_wx}) → +1")
        else:
            add(f"      {current_branch}位天盘{heaven_at_pos}({h_wx})vs{branch}({b_wx}) → 无克")
        idx = (idx + 1) % 12
        step += 1
        if step > 12:
            break
