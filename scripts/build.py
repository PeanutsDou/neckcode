#!/usr/bin/env python3
"""DeepSeek Code 打包脚本 — 自动设置国内镜像"""
import subprocess, os, sys

os.chdir(r'D:\AR\deepseekcode')
env = os.environ.copy()
env['ELECTRON_MIRROR'] = 'https://npmmirror.com/mirrors/electron/'
env['ELECTRON_BUILDER_BINARIES_MIRROR'] = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

cmd = ['npm', 'run', 'pack']
if '--dist' in sys.argv:
    cmd = ['npm', 'run', 'dist']

print(f'Running: {" ".join(cmd)}')
subprocess.run(cmd, env=env, shell=True)
