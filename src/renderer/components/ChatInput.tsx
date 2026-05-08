import React, { useState, useRef, useCallback } from 'react';
import { useChatStore } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';

interface SlashCommand {
  name: string;
  desc: string;
  handler: (args: string) => void;
}

interface ImageAttachment {
  data: string;   // base64 data URI
  name: string;
  size: number;
}

export function ChatInput() {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [showCommands, setShowCommands] = useState(false);
  const [commandIdx, setCommandIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { addEntry, setStreaming, isStreaming, pendingContext, setPendingContext, clear } = useChatStore();
  const { setModel, availableModels } = useAppStore();

  const commands: SlashCommand[] = [
    { name: '/clear', desc: 'Clear conversation history', handler: () => clear() },
    {
      name: '/model', desc: 'Switch model (e.g. /model deepseek-v4-flash)',
      handler: (args) => {
        const m = availableModels.find(x => x.includes(args.trim()) || x === args.trim());
        if (m) setModel(m);
      },
    },
    { name: '/file', desc: 'Read file content into context',
      handler: async (args) => {
        try { setPendingContext(await window.electronAPI.readFile(args.trim())); } catch { /* */ }
      },
    },
    { name: '/commit', desc: 'Generate git commit message', handler: () => setText('Generate a concise git commit message for the staged changes.') },
    { name: '/review', desc: 'Review changes for bugs', handler: () => setText('Review the staged changes for bugs, security issues, and code quality. Be thorough.') },
  ];

  const filteredCommands = text.startsWith('/') && !text.includes(' ')
    ? commands.filter(c => c.name.startsWith(text)) : [];

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

  // Handle image paste
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          setImages(prev => [...prev, {
            data: reader.result as string,
            name: `pasted-${Date.now()}.png`,
            size: blob.size,
          }]);
        };
        reader.readAsDataURL(blob);
      }
    }
  }, []);

  // Handle file/image drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setImages(prev => [...prev, {
            data: reader.result as string,
            name: file.name,
            size: file.size,
          }]);
        };
        reader.readAsDataURL(file);
      } else {
        // Read text files as context
        const reader = new FileReader();
        reader.onload = () => {
          setPendingContext(reader.result as string);
        };
        reader.readAsText(file);
      }
    }
  }, [setPendingContext]);

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || isStreaming) return;

    if (showCommands && filteredCommands.length > 0 && trimmed === filteredCommands[commandIdx]?.name) {
      executeCommand(filteredCommands[commandIdx]);
      return;
    }

    let message = trimmed;
    if (pendingContext) {
      message = `${trimmed}\n\nContext:\n\`\`\`\n${pendingContext}\n\`\`\``;
    }

    // Include images as markdown-like notation
    if (images.length > 0) {
      const imgDesc = images.map((img, i) => `[Image ${i + 1}: ${img.name} (${(img.size / 1024).toFixed(1)}KB)]`).join('\n');
      message = message ? `${message}\n\n${imgDesc}` : imgDesc;
    }

    addEntry({
      id: Date.now().toString(), role: 'user', content: message, timestamp: Date.now(),
    });

    setText('');
    setImages([]);
    setPendingContext(null);
    setStreaming(true);

    try {
      await window.electronAPI.sendMessage(message);
    } catch (err) {
      useChatStore.getState().setError(err instanceof Error ? err.message : String(err));
    }
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
            <span className="pending-context-label">Context:</span>
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
                <button className="pending-context-dismiss" onClick={() => removeImage(i)}>&times;</button>
              </div>
            ))}
          </div>
        )}
        <textarea ref={inputRef} className="chat-input" value={text}
          onChange={handleChange} onKeyDown={handleKeyDown} onPaste={handlePaste}
          placeholder="Enter to send | Paste/drag images | / for commands"
          rows={3} disabled={isStreaming} />
      </div>
      <div className="chat-input-actions">
        {isStreaming ? (
          <button className="btn btn-stop" onClick={() => { window.electronAPI.abort(); useChatStore.getState().setStreaming(false); }}>
            Stop
          </button>
        ) : (
          <button className="btn btn-send" onClick={handleSend} disabled={!text.trim() && images.length === 0}>
            Send
          </button>
        )}
      </div>
    </div>
  );
}
