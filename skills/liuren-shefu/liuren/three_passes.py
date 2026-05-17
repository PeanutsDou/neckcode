# liuren/three_passes.py
# 三传计算模块

from typing import List, Tuple, Optional, Dict
from config import (
    STEM_WUXING, BRANCH_WUXING, WUXING_KE,
    STEM_YINYANG, BRANCH_YINYANG,
    STEM_JIGONG, BRANCH_CHONG, BRANCH_YIMA
)
from liuren.plate import LiurenPlate, Lesson, Pass, get_heaven_branch
from liuren.generals import get_general_for_heaven_branch

# 地支列表
EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']


# ============================================================
# 辅助函数
# ============================================================

def get_branch_index(branch: str) -> int:
    """获取地支索引"""
    return EARTHLY_BRANCHES.index(branch)


def get_branch_by_index(index: int) -> str:
    """根据索引获取地支"""
    return EARTHLY_BRANCHES[index % 12]


def is_ke(attacker: str, victim: str) -> bool:
    """
    判断是否存在克关系（attacker克victim）

    Args:
        attacker: 施克者地支
        victim: 被克者地支

    Returns:
        是否存在克关系
    """
    attacker_wuxing = BRANCH_WUXING[attacker]
    victim_wuxing = BRANCH_WUXING[victim]
    return WUXING_KE.get(attacker_wuxing) == victim_wuxing


def is_stem_ke_branch(stem: str, branch: str) -> bool:
    """
    判断天干是否克地支

    Args:
        stem: 天干
        branch: 地支

    Returns:
        天干是否克地支
    """
    stem_wuxing = STEM_WUXING[stem]
    branch_wuxing = BRANCH_WUXING[branch]
    return WUXING_KE.get(stem_wuxing) == branch_wuxing


def is_branch_ke_stem(branch: str, stem: str) -> bool:
    """
    判断地支是否克天干

    Args:
        branch: 地支
        stem: 天干

    Returns:
        地支是否克天干
    """
    branch_wuxing = BRANCH_WUXING[branch]
    stem_wuxing = STEM_WUXING[stem]
    return WUXING_KE.get(branch_wuxing) == stem_wuxing


# ============================================================
# 伏吟/返吟判断
# ============================================================

def is_fuyin(plate: LiurenPlate) -> bool:
    """判断是否伏吟（天地盘重合）"""
    return plate.moon_general == plate.hour_branch


def is_fanyin(plate: LiurenPlate) -> bool:
    """判断是否返吟（天地盘对冲）"""
    return BRANCH_CHONG[plate.moon_general] == plate.hour_branch


# ============================================================
# 子项目6：基础课体 - 贼克、比用、涉害
# ============================================================

def find_ke_relations(lessons: List[Lesson]) -> List[Tuple[int, str, str]]:
    """
    找出四课中的下克上关系

    下克上：地盘（earth）克天盘（heaven）

    Args:
        lessons: 四课列表

    Returns:
        [(课index, 被克天盘, 克者地盘), ...]
    """
    ke_list = []
    for lesson in lessons:
        # 下克上：地盘克天盘
        if is_ke(lesson.earth, lesson.heaven):
            ke_list.append((lesson.index, lesson.heaven, lesson.earth))
    return ke_list


def select_by_biyong(candidates: List[Tuple], day_stem: str) -> List[Tuple]:
    """
    比用法：筛选与日干阴阳相同的被克者

    Args:
        candidates: [(课index, 被克天盘, 克者地盘), ...]
        day_stem: 日干

    Returns:
        筛选后的候选列表
    """
    day_yinyang = STEM_YINYANG[day_stem]
    result = []
    for item in candidates:
        heaven_branch = item[1]  # 被克者（天盘）
        if BRANCH_YINYANG[heaven_branch] == day_yinyang:
            result.append(item)
    return result if result else candidates  # 如果没有匹配，返回原列表


def calculate_shehai_depth(branch: str, heaven_plate: dict) -> int:
    """
    计算涉害深度

    涉害深度：从天盘地支所临地盘位置，数到天盘地支本位，途中受克次数

    Args:
        branch: 天盘地支（被克者）
        heaven_plate: 天地盘映射

    Returns:
        涉害深度（受克次数）
    """
    # 找到branch在地盘的位置（即branch作为天盘时，对应的地盘位置）
    # heaven_plate[earth] = heaven, 我们需要反查
    current_pos = None
    for earth, heaven in heaven_plate.items():
        if heaven == branch:
            current_pos = earth
            break

    if current_pos is None:
        return 0

    # 从current_pos数到branch本位
    start_idx = get_branch_index(current_pos)
    end_idx = get_branch_index(branch)

    depth = 0
    idx = start_idx
    while idx != end_idx:
        current_branch = get_branch_by_index(idx)
        # 检查当前位置的天盘是否克branch
        heaven_at_pos = heaven_plate[current_branch]
        if is_ke(heaven_at_pos, branch):
            depth += 1
        idx = (idx + 1) % 12

    return depth


def get_initial_by_shehai(candidates: List[Tuple], heaven_plate: dict) -> Tuple:
    """
    涉害法：取涉害最深者

    Args:
        candidates: [(课index, 被克天盘, 克者地盘), ...]
        heaven_plate: 天地盘映射

    Returns:
        涉害最深的候选
    """
    max_depth = -1
    result = candidates[0]

    for item in candidates:
        heaven_branch = item[1]
        depth = calculate_shehai_depth(heaven_branch, heaven_plate)
        if depth > max_depth:
            max_depth = depth
            result = item

    return result


def get_initial_pass_basic(plate: LiurenPlate, lessons: List[Lesson]) -> Tuple[str, str]:
    """
    基础取初传: 贼克->比用->涉害

    Args:
        plate: 式盘
        lessons: 四课

    Returns:
        (初传地支, 课体名称)
    """
    # 找下克上关系
    ke_relations = find_ke_relations(lessons)

    if len(ke_relations) == 0:
        return None, None  # 无克，需要用其他方法

    if len(ke_relations) == 1:
        # 元首课：仅一个下克上
        return ke_relations[0][1], '元首'

    # 多个下克上，用比用法
    filtered = select_by_biyong(ke_relations, plate.day_stem)

    if len(filtered) == 1:
        # 重审课：比用后唯一
        return filtered[0][1], '重审'

    # 比用后仍有多个，用涉害法
    result = get_initial_by_shehai(filtered, plate.heaven_plate)
    return result[1], '知一'


# ============================================================
# 子项目7：特殊课体 - 遥克、昴星、别责、八专
# ============================================================

def find_yaoke(heaven_plate: dict, day_stem: str) -> List[str]:
    """
    遥克法：找天盘中克日干者

    Args:
        heaven_plate: 天地盘映射
        day_stem: 日干

    Returns:
        能克日干的天盘地支列表
    """
    result = []
    for earth, heaven in heaven_plate.items():
        if is_branch_ke_stem(heaven, day_stem):
            result.append(heaven)
    # 去重
    return list(set(result))


def get_yaoke_pass(plate: LiurenPlate) -> Tuple[str, str]:
    """
    遥克法取初传

    Args:
        plate: 式盘

    Returns:
        (初传地支, 课体名称)
    """
    yaoke_list = find_yaoke(plate.heaven_plate, plate.day_stem)

    if len(yaoke_list) == 0:
        return None, None

    if len(yaoke_list) == 1:
        # 蒿矢课
        return yaoke_list[0], '蒿矢'

    # 多个遥克，用比用法筛选
    day_yinyang = STEM_YINYANG[plate.day_stem]
    filtered = [b for b in yaoke_list if BRANCH_YINYANG[b] == day_yinyang]

    if filtered:
        return filtered[0], '弹射'
    return yaoke_list[0], '弹射'


def get_maoxing_pass(plate: LiurenPlate) -> Tuple[str, str]:
    """
    昴星法取初传

    阳日：取日支前一位（逆时针，index-1）的上神
    阴日：取日支后一位（顺时针，index+1）的上神

    Args:
        plate: 式盘

    Returns:
        (初传地支, 课体名称)
    """
    day_yinyang = STEM_YINYANG[plate.day_stem]
    day_idx = get_branch_index(plate.day_branch)

    if day_yinyang == '阳':
        # 阳日取前一位（逆时针）
        target_idx = (day_idx - 1) % 12
    else:
        # 阴日取后一位（顺时针）
        target_idx = (day_idx + 1) % 12

    target_branch = get_branch_by_index(target_idx)
    initial = get_heaven_branch(plate.heaven_plate, target_branch)

    return initial, '昴星'


def is_bieze_condition(plate: LiurenPlate) -> bool:
    """
    判断是否符合别责课条件

    条件：日干阴阳与时支阴阳相反
    """
    stem_yinyang = STEM_YINYANG[plate.day_stem]
    hour_yinyang = BRANCH_YINYANG[plate.hour_branch]
    return stem_yinyang != hour_yinyang


def get_bieze_pass(plate: LiurenPlate) -> Tuple[str, str]:
    """
    别责法取初传

    取日干寄宫的上神

    Args:
        plate: 式盘

    Returns:
        (初传地支, 课体名称)
    """
    jigong = STEM_JIGONG[plate.day_stem]
    initial = get_heaven_branch(plate.heaven_plate, jigong)
    return initial, '别责'


def is_bazhuan_condition(plate: LiurenPlate) -> bool:
    """
    判断是否符合八专课条件

    条件：日干支同位（甲寅、乙卯、丙巳、丁未、戊巳、己未、庚申、辛戌、壬亥、癸丑）
    实际上就是日干的寄宫等于日支
    """
    jigong = STEM_JIGONG[plate.day_stem]
    return jigong == plate.day_branch


def get_bazhuan_pass(plate: LiurenPlate, lessons: List[Lesson]) -> Tuple[str, str]:
    """
    八专法取初传

    八专课规则较复杂，基本规则：
    - 阳日取第三课上神
    - 阴日取第四课上神

    Args:
        plate: 式盘
        lessons: 四课

    Returns:
        (初传地支, 课体名称)
    """
    day_yinyang = STEM_YINYANG[plate.day_stem]

    if day_yinyang == '阳':
        initial = lessons[2].heaven  # 第三课上神
    else:
        initial = lessons[3].heaven  # 第四课上神

    return initial, '八专'


# ============================================================
# 子项目8：伏吟返吟
# ============================================================

def get_fuyin_pass(plate: LiurenPlate, lessons: List[Lesson]) -> Tuple[str, str]:
    """
    伏吟课取初传

    - 有克：按正常规则取
    - 无克阳日：日支前一位（刑）
    - 无克阴日：日干寄宫上神

    Args:
        plate: 式盘
        lessons: 四课

    Returns:
        (初传地支, 课体名称)
    """
    # 先检查是否有克
    ke_relations = find_ke_relations(lessons)

    if ke_relations:
        # 有克，按正常规则
        initial, _ = get_initial_pass_basic(plate, lessons)
        return initial, '伏吟'

    # 无克
    day_yinyang = STEM_YINYANG[plate.day_stem]

    if day_yinyang == '阳':
        # 阳日取日支前一位
        day_idx = get_branch_index(plate.day_branch)
        target_idx = (day_idx - 1) % 12
        initial = get_branch_by_index(target_idx)
    else:
        # 阴日取寄宫上神（伏吟时上神等于本位）
        jigong = STEM_JIGONG[plate.day_stem]
        initial = jigong  # 伏吟时上神=本位

    return initial, '伏吟'


def get_fanyin_pass(plate: LiurenPlate) -> Tuple[str, str]:
    """
    返吟课取初传

    取日支的驿马

    Args:
        plate: 式盘

    Returns:
        (初传地支, 课体名称)
    """
    initial = BRANCH_YIMA[plate.day_branch]
    return initial, '返吟'


# ============================================================
# 子项目9：中末传计算
# ============================================================

def calculate_standard_passes(initial: str, heaven_plate: dict,
                              generals_plate: Dict[str, str] = None) -> List[Pass]:
    """
    标准三传计算

    中传：初传所临地盘位置的上神
    末传：中传所临地盘位置的上神

    Args:
        initial: 初传地支
        heaven_plate: 天地盘映射
        generals_plate: 天将盘（可选）

    Returns:
        三传列表
    """
    middle = get_heaven_branch(heaven_plate, initial)
    final = get_heaven_branch(heaven_plate, middle)

    def get_general(branch: str) -> str:
        if generals_plate:
            return get_general_for_heaven_branch(generals_plate, branch)
        return ""

    return [
        Pass(branch=initial, index=1, general=get_general(initial)),
        Pass(branch=middle, index=2, general=get_general(middle)),
        Pass(branch=final, index=3, general=get_general(final))
    ]


def calculate_fuyin_passes(plate: LiurenPlate, lessons: List[Lesson]) -> Tuple[List[Pass], str]:
    """
    伏吟课三传计算

    伏吟时上神等于本位，需特殊处理
    """
    initial, lesson_type = get_fuyin_pass(plate, lessons)

    # 伏吟时的中末传规则：
    # 初传的刑为中传，中传的刑为末传
    # 简化处理：使用标准递推（伏吟时会得到相同的值）
    # 实际上伏吟的三传需要特殊处理，这里先用标准方法
    middle = get_heaven_branch(plate.heaven_plate, initial)
    final = get_heaven_branch(plate.heaven_plate, middle)

    def get_general(branch: str) -> str:
        if plate.generals_plate:
            return get_general_for_heaven_branch(plate.generals_plate, branch)
        return ""

    passes = [
        Pass(branch=initial, index=1, general=get_general(initial)),
        Pass(branch=middle, index=2, general=get_general(middle)),
        Pass(branch=final, index=3, general=get_general(final))
    ]

    return passes, lesson_type


def calculate_fanyin_passes(plate: LiurenPlate) -> Tuple[List[Pass], str]:
    """
    返吟课三传计算

    初传：驿马
    中传：初传的冲
    末传：初传（回到原点）
    """
    initial, lesson_type = get_fanyin_pass(plate)
    middle = BRANCH_CHONG[initial]
    final = initial

    def get_general(branch: str) -> str:
        if plate.generals_plate:
            return get_general_for_heaven_branch(plate.generals_plate, branch)
        return ""

    passes = [
        Pass(branch=initial, index=1, general=get_general(initial)),
        Pass(branch=middle, index=2, general=get_general(middle)),
        Pass(branch=final, index=3, general=get_general(final))
    ]

    return passes, lesson_type


# ============================================================
# 主函数：计算完整三传
# ============================================================

def calculate_three_passes(plate: LiurenPlate, lessons: List[Lesson]) -> Tuple[List[Pass], str]:
    """
    计算完整三传

    流程：
    1. 判断伏吟/返吟
    2. 判断特殊课体（八专、别责）
    3. 尝试基础课体（贼克/比用/涉害）
    4. 尝试遥克
    5. 使用昴星

    Args:
        plate: 式盘
        lessons: 四课

    Returns:
        (三传列表, 课体名称)
    """
    # 清空推导日志
    plate.derivation_log = []

    def log(msg: str):
        plate.derivation_log.append(msg)

    log(f"开始计算三传: 日干{plate.day_stem} 日支{plate.day_branch} 时支{plate.hour_branch} 月将{plate.moon_general}")

    # 1. 判断伏吟
    if is_fuyin(plate):
        log("判断伏吟: 月将等于时支，为伏吟课")
        passes, lesson_type = calculate_fuyin_passes(plate, lessons)
        log(f"课体: {lesson_type}")
        log(f"三传: 初传{passes[0].branch} → 中传{passes[1].branch} → 末传{passes[2].branch}")
        return passes, lesson_type

    # 2. 判断返吟
    if is_fanyin(plate):
        log("判断返吟: 月将冲时支，为返吟课")
        passes, lesson_type = calculate_fanyin_passes(plate)
        log(f"课体: {lesson_type}")
        log(f"三传: 初传{passes[0].branch} → 中传{passes[1].branch} → 末传{passes[2].branch}")
        return passes, lesson_type

    # 3. 判断八专
    if is_bazhuan_condition(plate):
        log("判断八专: 日干寄宫等于日支，为八专课")
        initial, lesson_type = get_bazhuan_pass(plate, lessons)
        log(f"初传取: {initial}")
        passes = calculate_standard_passes(initial, plate.heaven_plate, plate.generals_plate)
        log(f"课体: {lesson_type}")
        log(f"三传: 初传{passes[0].branch} → 中传{passes[1].branch} → 末传{passes[2].branch}")
        return passes, lesson_type

    # 4. 尝试基础课体（贼克/比用/涉害）
    ke_relations = find_ke_relations(lessons)
    log(f"查找下克上关系: 共{len(ke_relations)}个")
    for idx, heaven, earth in ke_relations:
        log(f"  第{idx}课: {earth}(地)克{heaven}(天)")

    initial, lesson_type = get_initial_pass_basic(plate, lessons)
    if initial:
        if lesson_type == '元首':
            log("仅一个下克上，取被克者为初传 -> 元首课")
        elif lesson_type == '重审':
            log(f"多个下克上，比用法取与日干{plate.day_stem}({STEM_YINYANG[plate.day_stem]})同阴阳者 -> 重审课")
        elif lesson_type == '知一':
            log("比用后仍有多个，涉害法取涉害最深者 -> 知一课")
        log(f"初传: {initial}")
        passes = calculate_standard_passes(initial, plate.heaven_plate, plate.generals_plate)
        log(f"三传: 初传{passes[0].branch} → 中传{passes[1].branch} → 末传{passes[2].branch}")
        return passes, lesson_type

    log("无下克上关系")

    # 5. 无克，判断别责条件
    if is_bieze_condition(plate):
        log("日干阴阳与时支阴阳相反，用别责法")
        initial, lesson_type = get_bieze_pass(plate)
        log(f"取日干寄宫{STEM_JIGONG[plate.day_stem]}上神为初传: {initial}")
        passes = calculate_standard_passes(initial, plate.heaven_plate, plate.generals_plate)
        log(f"课体: {lesson_type}")
        log(f"三传: 初传{passes[0].branch} → 中传{passes[1].branch} → 末传{passes[2].branch}")
        return passes, lesson_type

    # 6. 尝试遥克
    initial, lesson_type = get_yaoke_pass(plate)
    if initial:
        log(f"遥克法: 找天盘克日干者 -> {lesson_type}课")
        log(f"初传: {initial}")
        passes = calculate_standard_passes(initial, plate.heaven_plate, plate.generals_plate)
        log(f"三传: 初传{passes[0].branch} → 中传{passes[1].branch} → 末传{passes[2].branch}")
        return passes, lesson_type

    # 7. 使用昴星
    log("无遥克，使用昴星法")
    initial, lesson_type = get_maoxing_pass(plate)
    log(f"初传: {initial}")
    passes = calculate_standard_passes(initial, plate.heaven_plate, plate.generals_plate)
    log(f"课体: {lesson_type}")
    log(f"三传: 初传{passes[0].branch} → 中传{passes[1].branch} → 末传{passes[2].branch}")
    return passes, lesson_type


def get_passes_display(passes: List[Pass]) -> str:
    """
    获取三传的显示字符串

    Args:
        passes: 三传列表

    Returns:
        格式化的三传字符串
    """
    if len(passes) >= 3:
        return f"初传:{passes[0].branch} → 中传:{passes[1].branch} → 末传:{passes[2].branch}"
    return ""
