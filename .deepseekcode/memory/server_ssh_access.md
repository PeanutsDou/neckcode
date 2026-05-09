---
name: Server SSH Access
description: SSH + Hermes + migrated skills/memory
type: reference
---

# Server SSH Access

- **Host**: 111.229.84.47 (SSH config alias: `my-server`)
- **User**: ubuntu
- **Port**: 22
- **SSH Key**: local path to peanutsDouAI.pem
- **OS**: Ubuntu 24.04 LTS (x86_64)
- **主要用户**: ubuntu (sudo), agentuser (Hermes)

## SSH Config

```
Host my-server
    HostName 111.229.84.47
    User ubuntu
    Port 22
    IdentityFile /path/to/peanutsDouAI.pem
    StrictHostKeyChecking accept-new
```

## Hermes Agent v0.10.0

Hermes 以 `agentuser` 身份运行，DeepSeek API 驱动。
- Venv: `/home/agentuser/.hermes/hermes-agent/venv/`
- Config: `/home/agentuser/.hermes/config.yaml`
- Skills: `/home/agentuser/.agents/skills/`

### Hermes 操作

```bash
sudo -u agentuser /home/agentuser/.hermes/hermes-agent/venv/bin/hermes skills list
sudo -u agentuser /home/agentuser/.hermes/hermes-agent/venv/bin/hermes gateway status
sudo -u agentuser /home/agentuser/.hermes/hermes-agent/venv/bin/hermes chat
```

### 用户结构

| 用户 | 说明 |
|------|------|
| ubuntu | sudo 用户，日常管理 |
| agentuser | Hermes 专属用户，skills 在 ~/.agents/skills/ |
| lighthouse | 保留用户 |
