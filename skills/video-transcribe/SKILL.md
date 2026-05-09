---
name: video-transcribe
description: 视频/音频转文字，音频用 SenseVoiceSmall，视频理解用 Qwen3-Omni
version: 2.1.0
---

# 视频音频转写

ffmpeg 提取音频 → SiliconFlow API 转写，依赖轻量。

## 两种模式

| 模式 | 模型 | 费用 | 适用场景 |
|------|------|------|---------|
| **音频转写**（默认） | FunAudioLLM/SenseVoiceSmall | 免费额度 | 纯语音内容，如面试、会议、录音 |
| **视频理解** | Qwen/Qwen3-Omni-30B-A3B-Instruct | 按 token 计费 | 需要看画面内容，如演示、操作录屏 |

**原则**：纯音频能获取足够信息时，用 SenseVoiceSmall 即可。视频理解模式仅在需要分析画面内容时使用。

## 依赖

- ffmpeg（仅用于音频提取）
- SiliconFlow API key（环境变量 `SILICONFLOW_API_KEY`）

## 音频转写（默认）

```bash
python .claude/skills/video-transcribe/scripts/transcribe.py <文件> [--language <语言>]
```

示例：

```bash
python .claude/skills/video-transcribe/scripts/transcribe.py ~/meeting.mp4
python .claude/skills/video-transcribe/scripts/transcribe.py ~/audio.mp3 --language en
```

## 视频理解（Omni，需画面分析时用）

```bash
python .claude/skills/video-transcribe/scripts/transcribe.py <视频> --mode omni [--prompt "<问题>"]
```

示例：

```bash
# 分析视频画面内容
python .claude/skills/video-transcribe/scripts/transcribe.py ~/demo.mp4 --mode omni

# 问具体问题
python .claude/skills/video-transcribe/scripts/transcribe.py ~/demo.mp4 --mode omni --prompt "这个演示在展示什么功能？"
```

## 支持格式

- 视频: mp4, avi, mov, mkv, flv, webm, m4v
- 音频: mp3, wav, m4a, aac, ogg, flac
