import math

c = 3e8
v_exp = 1.8 * c          # 宇宙膨胀速度 m/s
R0 = 4.4e26              # 当前可观测宇宙半径 m
V_bun = 5.236e-4         # 馒头体积 m³

# 无膨胀时精确解：V_bun * 2^(t/300) = 4/3 * pi * R0^3
# t/300 * ln2 = ln(4/3 * pi * R0^3 / V_bun)
V_uni = 4/3 * math.pi * R0**3
n_exact = math.log2(V_uni / V_bun)
t_exact_noexp = n_exact * 300
print(f"无膨胀精确解: n = {n_exact:.6f} 次翻倍")
print(f"无膨胀精确解: t = {t_exact_noexp:.6f} s = {t_exact_noexp/3600:.10f} 小时")

# 有膨胀：用对数形式避免溢出
# ln(V_bun) + t/300 * ln2 = ln(4pi/3) + 3*ln(R0 + v_exp*t)
def f_log(t):
    lhs = math.log(V_bun) + (t / 300) * math.log(2)
    rhs = math.log(4/3 * math.pi) + 3 * math.log(R0 + v_exp * t)
    return lhs - rhs

# 二分法
a, b = t_exact_noexp * 0.99, t_exact_noexp * 1.01
fa, fb = f_log(a), f_log(b)

# 确保区间内有解
for _ in range(100):
    if fa * fb <= 0:
        break
    if fa < 0:
        b *= 1.1
    else:
        a *= 0.9
    fa, fb = f_log(a), f_log(b)

print(f"\n搜索区间: [{a:.2f}, {b:.2f}]")
print(f"f(a) = {fa:.6e}, f(b) = {fb:.6e}")

for _ in range(200):
    m = (a + b) / 2
    fm = f_log(m)
    if abs(fm) < 1e-12 or (b - a) < 1e-6:
        break
    if fa * fm <= 0:
        b, fb = m, fm
    else:
        a, fa = m, fm

t_sol = m
print(f"\n有膨胀时解: t = {t_sol:.10f} s = {t_sol/3600:.12f} 小时")
print(f"相比无膨胀增加: {(t_sol - t_exact_noexp):.10f} s = {(t_sol - t_exact_noexp)/60:.10f} 分钟")
print(f"相对增量: {(t_sol - t_exact_noexp)/t_exact_noexp:.4e}")

# 验证
R_final = R0 + v_exp * t_sol
print(f"\n宇宙半径膨胀增量: {v_exp * t_sol:.4e} m")
print(f"增量与原半径之比: {v_exp * t_sol / R0:.4e}")

# 最终翻倍次数
n_final = t_sol / 300
print(f"最终翻倍次数: {n_final:.10f}")
print(f"整数翻倍次数: {math.ceil(n_final)}")
print(f"对应时间: {math.ceil(n_final) * 300} s = {math.ceil(n_final) * 300 / 3600} h")
