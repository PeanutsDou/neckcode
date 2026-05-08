import React, { useState, useRef, useCallback } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';
import { CustomSelect } from './CustomSelect';

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
  const { addEntry, setStreaming, isStreaming, pendingContext, setPendingContext, clear } = useChatStore();
  const { setModel, availableModels, currentModel } = useAppStore();

  const commands: SlashCommand[] = [
    { name: '/clear', desc: '清空对话', handler: () => clear() },
    { name: '/model', desc: '切换模型', handler: (args) => {
        const m = availableModels.find(x => x.includes(args.trim()));
        if (m) setModel(m);
    }},
    { name: '/file', desc: '读文件到上下文', handler: async (args) => {
        try { setPendingContext(await window.electronAPI.readFile(args.trim())); } catch { /* */ }
    }},
    { name: '/commit', desc: '生成 commit 信息', handler: () => setText('为暂存的改动生成一条简洁的 git commit') },
    { name: '/review', desc: '代码审查', handler: () => setText('审查暂存的改动，检查问题') },
  ];

  const filteredCommands = text.startsWith('/') && !text.includes(' ')
    ? commands.filter(c => c.name.startsWith(text)) : [];
  const canSend = text.trim().length > 0 || images.length > 0;

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
    if (!canSend || isStreaming) return;
    if (showCommands && filteredCommands.length > 0 && text.trim() === filteredCommands[commandIdx]?.name) {
      executeCommand(filteredCommands[commandIdx]);
      return;
    }

    let message = text.trim();
    if (pendingContext) message = `${message}\n\n\`\`\`\n${pendingContext}\n\`\`\``;

    const attachments = images.map(img => ({ type: 'image' as const, data: img.data, mimeType: 'image/png', name: img.name, size: img.size }));
    addEntry({ id: Date.now().toString(), role: 'user', content: message, attachments, timestamp: Date.now() });

    setText('');
    setImages([]);
    setPendingContext(null);
    setStreaming(true);

    try {
      const apiAttachments = images.map(img => ({
        type: 'image' as const,
        data: img.data,
        mimeType: img.data.startsWith('data:image/png') ? 'image/png' : img.data.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png',
      }));
      await window.electronAPI.sendMessage(message, apiAttachments);
    } catch (err) {
      useChatStore.getState().setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStop = () => {
    window.electronAPI.abort();
    useChatStore.getState().setStreaming(false);
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
          <div className="slash-commands">
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
          disabled={isStreaming}
          style={{ height: inputHeight }} />

        <div className="input-controls">
          <CustomSelect
            value={currentModel}
            options={availableModels}
            onChange={setModel}
          />

          {isStreaming ? (
            <button className="send-btn sending" onClick={handleStop} title="停止">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="8" height="8" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button className="send-btn" onClick={handleSend} disabled={!canSend} title="发送">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="11" x2="7" y2="3" />
                <polyline points="4,6 7,3 10,6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
