import os
import sys
sys.stdout.reconfigure(encoding='utf-8')

path = r'D:\窦中君\实习\产出\TA_260403_测试_米哈游原神测试\米哈游2026校招-Varsapura-特效TA笔试\Varsapura-特效TA笔试-视频展示'
print(f"目录存在: {os.path.exists(path)}")
if os.path.exists(path):
    for f in os.listdir(path):
        full = os.path.join(path, f)
        size = os.path.getsize(full)
        print(f"  {f}  ({size / 1024 / 1024:.1f} MB)")
