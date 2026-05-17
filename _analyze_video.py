import os, sys
os.environ["SILICONFLOW_API_KEY"] = "sk-kipocdcxdzibscqphlmqxpppsufnqbdfoevasksxlpyptzfj"

sys.argv = [
    "transcribe.py",
    r"D:\窦中君\实习\产出\TA_260403_测试_米哈游原神测试\米哈游2026校招-Varsapura-特效TA笔试\Varsapura-特效TA笔试-视频展示\Varsapura-特效TA笔试-视频展示.mp4",
    "--mode", "omni",
    "--prompt", "请详细描述这个视频中展示了什么内容。具体说明：1. 是否展示了天气切换（晴天→太阳雨→阴天→雨天）？2. 是完整场景展示还是参数调试界面？3. 展示了哪些效果（雨滴、水坑、碰撞、屏幕效果）？4. 整体画面风格（写实/卡通）和画质如何？5. 有没有旁白或解说？"
]

exec(open(r"C:\Users\DELL\.deepseekcode\skills\video-transcribe\scripts\transcribe.py", encoding="utf-8").read())
