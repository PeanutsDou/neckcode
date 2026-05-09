---
name: model_switching
description: When to use deepseek-v4-pro sub-session for complex tasks
type: feedback
---

遇到复杂编程任务、复杂规划任务，或尝试完成某个任务在当前模型下无法完成时，自动通过 `claude --model deepseek-v4-pro --print "..."` 开子会话调用 deepseek-v4-pro 处理，并将结果返回。
**Why:** 用户本地配了两个模型，deepseek-v4-flash 用于日常轻量任务，deepseek-v4-pro 用于复杂场景。当前会话默认用 flash，遇到瓶颈不应硬扛，应主动切 pro。
**How to apply:** 当任务涉及复杂代码生成、架构设计、多步骤规划，或在当前会话中尝试 2-3 次仍无法解决问题时，启动子会话调 pro。
