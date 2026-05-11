import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useChatStore, getSessionId, useActiveIsStreaming, useActivePendingContext } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';
import { CustomSelect } from './CustomSelect';
import { PermissionToggle } from './PermissionToggle';

interface SlashCommand {
  name: string;
  desc: string;
  handler: (args: string) => void;
}

interface ImageAttachment {
  data: string;
  name: string;
  size: number;
}

interface SkillInfo {
  name: string;
  description: string;
  whenToUse?: string;
  argumentHint?: string;
  userInvocable: boolean;
}

export function ChatInput() {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [inputHeight, setInputHeight] = useState(80);
  const dragRef = useRef(false);
  const startY = useRef(0);
  const startH = useRef(80);
  const [showCommands, setShowCommands] = useState(false);
  const [commandIdx, setCommandIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cmdListRef = useRef<HTMLDivElement>(null);
  const { addEntryTo, setStreamingTo, setPendingContext, focusVersion } = useChatStore();
  const isStreaming = useActiveIsStreaming();
  const pendingContext = useActivePendingContext();

  // Auto-focus after response completes
  useEffect(() => {
    inputRef.current?.focus();
  }, [focusVersion]);
  const { setModel, setAvailableModels, availableModels, currentModel } = useAppStore();
  const [skillCommands, setSkillCommands] = useState<SlashCommand[]>([]);

  const refreshModels = useCallback(async () => {
    try {
      const cfg = await window.electronAPI?.getConfig();
      if (!cfg) return;
      setAvailableModels(cfg.models || []);
      if (cfg.model) setModel(cfg.model);
    } catch {
      // Keep the current cached list if config refresh fails.
    }
  }, [setAvailableModels, setModel]);

  useEffect(() => {
    window.electronAPI?.listSkills().then(skills => {
      const cmds: SlashCommand[] = (skills as SkillInfo[])
        .filter(s => s.userInvocable)
        .map(s => ({
          name: `/${s.name}`,
          desc: s.argumentHint || s.description.slice(0, 60),
          handler: async (args: string) => {
            try {
              const content = await window.electronAPI.invokeSkill(s.name);
              setPendingContext(content);
            } catch { /* skill load failed */ }
          },
        }));
      setSkillCommands(cmds);
    }).catch(() => {});
  }, []);

  const commands: SlashCommand[] = skillCommands;

  const filteredCommands = text.startsWith('/') && !text.includes(' ')
    ? commands.filter(c => c.name.startsWith(text)) : [];
  const canSend = text.trim().length > 0 || images.length > 0;

  // Scroll active command into view
  useEffect(() => {
    if (!cmdListRef.current) return;
    const active = cmdListRef.current.querySelector('.slash-command-item.active');
    active?.scrollIntoView({ block: 'nearest' });
  }, [commandIdx]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setText(v);
    setShowCommands(v.startsWith('/') && !v.includes(' '));
    setCommandIdx(0);
  }, []);

  const executeCommand = (cmd: SlashCommand) => {
    cmd.handler(text.split(' ').slice(1).join(' '));
    setText('');
    setShowCommands(false);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => setImages(prev => [...prev, { data: reader.result as string, name: `paste-${Date.now()}.png`, size: blob.size }]);
        reader.readAsDataURL(blob);
      }
    }
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    startY.current = e.clientY;
    startH.current = inputHeight;

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = startY.current - ev.clientY;
      setInputHeight(Math.max(80, Math.min(400, startH.current + delta)));
    };
    const onUp = () => {
      dragRef.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [inputHeight]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => setImages(prev => [...prev, { data: reader.result as string, name: file.name, size: file.size }]);
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => setPendingContext(reader.result as string);
        reader.readAsText(file);
      }
    }
  }, [setPendingContext]);

  const handleSend = async () => {
    if (!canSend) return;
    if (showCommands && filteredCommands.length > 0 && text.trim() === filteredCommands[commandIdx]?.name) {
      executeCommand(filteredCommands[commandIdx]);
      return;
    }

    let message = text.trim();
    if (pendingContext) message = `${message}\n\n\`\`\`\n${pendingContext}\n\`\`\``;

    const sid = useChatStore.getState().ensureActiveSession();
    const attachments = images.map(img => ({ type: 'image' as const, data: img.data, mimeType: 'image/png', name: img.name, size: img.size }));
    addEntryTo(sid, { id: Date.now().toString(), role: 'user', content: message, attachments, timestamp: Date.now() });

    setText('');
    setImages([]);
    setPendingContext(null);
    setStreamingTo(sid, true);

    try {
      const apiAttachments = images.map(img => ({
        type: 'image' as const,
        data: img.data,
        mimeType: img.data.startsWith('data:image/png') ? 'image/png' : img.data.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png',
      }));
      await window.electronAPI.sendMessage(sid, message, apiAttachments);
    } catch (err) {
      useChatStore.getState().setErrorTo(sid, err instanceof Error ? err.message : String(err));
    }
  };

  const handleStop = () => {
    const sid = getSessionId() || '';
    window.electronAPI.abort(sid);
    if (sid) useChatStore.getState().setStreamingTo(sid, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCommandIdx((commandIdx + 1) % filteredCommands.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setCommandIdx((commandIdx - 1 + filteredCommands.length) % filteredCommands.length); return; }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); setText(filteredCommands[commandIdx].name + ' '); setShowCommands(false); return; }
      if (e.key === 'Escape') { setShowCommands(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="chat-input-area" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      <div className="input-resize-handle" onMouseDown={handleResizeStart} />
      <div className="chat-input-wrapper">
        {showCommands && filteredCommands.length > 0 && (
          <div className="slash-commands" ref={cmdListRef}>
            {filteredCommands.map((cmd, i) => (
              <div key={cmd.name} className={`slash-command-item ${i === commandIdx ? 'active' : ''}`}
                onClick={() => executeCommand(cmd)}>
                <span className="slash-command-name">{cmd.name}</span>
                <span className="slash-command-desc">{cmd.desc}</span>
              </div>
            ))}
          </div>
        )}
        {pendingContext && (
          <div className="pending-context">
            <span className="pending-context-label">上下文</span>
            <span className="pending-context-preview">{pendingContext.slice(0, 80)}{pendingContext.length > 80 ? '...' : ''}</span>
            <button className="pending-context-dismiss" onClick={() => setPendingContext(null)}>&times;</button>
          </div>
        )}
        {images.length > 0 && (
          <div className="image-previews">
            {images.map((img, i) => (
              <div key={i} className="image-preview-item">
                <img src={img.data} alt={img.name} className="image-preview-thumb" />
                <span className="image-preview-name">{img.name}</span>
                <button className="pending-context-dismiss" onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}>&times;</button>
              </div>
            ))}
          </div>
        )}
        <textarea ref={inputRef} className="chat-input" value={text}
          onChange={handleChange} onKeyDown={handleKeyDown} onPaste={handlePaste}
          placeholder="输入消息，Enter 发送，/ 命令"
          style={{ height: inputHeight }} />

        <div className="input-controls">
          <PermissionToggle />
          <CustomSelect
            value={currentModel}
            options={availableModels}
            onOpen={refreshModels}
            onChange={(m) => { setModel(m); window.electronAPI?.setConfig('model', m); const sid = getSessionId(); if (sid) window.electronAPI?.setSessionModel?.(sid, m); }}
          />

          {isStreaming && (
            <button className="send-btn sending" onClick={handleStop} title="停止">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="8" height="8" rx="1.5" />
              </svg>
            </button>
          )}
          <button className="send-btn" onClick={handleSend} disabled={!canSend} title={isStreaming ? '发送补充消息（先中断当前任务）' : '发送'}>
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="11" x2="7" y2="3" />
              <polyline points="4,6 7,3 10,6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
