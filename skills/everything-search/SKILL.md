---
name: everything-search
description: 全盘文件/目录即时搜索。基于 Everything SDK（NTFS MFT 索引），百万文件 < 50ms 查询。TRIGGER when: 用户需要查找某个文件或目录、搜索特定文件、定位文件位置。SKIP: 内容搜索（用 grep）、非 NTFS 分区。
version: 0.1.0
---

# Everything Search — 全盘文件即时搜索

基于 Everything SDK 的全盘文件搜索工具。通过 NTFS MFT 直接索引，覆盖所有 NTFS 卷。

## 工作流程

1. 收到搜索请求 → 提取关键词
2. 调用 `everything_search` 工具，传入空格分隔的关键词
3. 工具返回匹配的文件/目录列表（名称 + 完整路径 + 大小 + 修改时间）
4. 如需确认内容，用 `read_file` 打开候选文件验证

## 注意事项

- 仅搜索 NTFS 卷（Windows 默认文件系统格式即为 NTFS）
- 关键词用空格分隔，支持中英文
- 返回结果为 CSV 格式解析，包含 Size、Date Modified、Attributes、Filename
- 不搜索网络驱动器、FAT32/exFAT 卷、ReFS 卷
- 首次运行需要 Everything 后台服务就绪（应用启动时已自动初始化）

## 工具注册

工具 `everything_search` 已注册到全局工具注册表，所有 Agent 可直接调用。
