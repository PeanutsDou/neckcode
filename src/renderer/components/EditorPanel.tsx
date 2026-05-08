import React, { useCallback, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useEditorStore } from '../stores/editor-store';
import { useChatStore } from '../stores/chat-store';

export function EditorPanel() {
  const { tabs, activeTab, updateContent, saveFile, setSelectedText } = useEditorStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const activeTabData = tabs.find(t => t.path === activeTab);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;

    // Ctrl+S to save
    editor.addCommand(
      // Monaco KeyMod.CtrlCmd | Monaco KeyCode.KeyS
      2048 | 49, // CtrlCmd (2048) + KeyS (49)
      () => {
        const current = useEditorStore.getState().activeTab;
        if (current) {
          useEditorStore.getState().saveFile(current);
        }
      }
    );

    // Track selection
    editor.onDidChangeCursorSelection(() => {
      const selection = editor.getModel()?.getValueInRange(editor.getSelection() || undefined);
      if (selection) {
        setSelectedText(selection);
      }
    });

    // Context menu: Send selection to chat
    editor.addAction({
      id: 'send-to-chat',
      label: 'Send Selection to Chat',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run(ed) {
        const sel = ed.getModel()?.getValueInRange(ed.getSelection() || undefined);
        if (sel) {
          useChatStore.getState().setPendingContext(sel);
        }
      },
    });
  }, []);

  const handleChange = useCallback((value: string | undefined) => {
    if (activeTab && value !== undefined) {
      updateContent(activeTab, value);
    }
  }, [activeTab, updateContent]);

  if (!activeTabData) {
    return (
      <div className="editor-empty">
        <div className="editor-empty-text">
          <h3>DeepSeek Code</h3>
          <p>Open a file from the left panel to start editing</p>
          <p className="hint">Ctrl+S to save | Select text → right-click → Send to Chat</p>
        </div>
      </div>
    );
  }

  const language = (() => {
    const ext = activeTabData.name.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rs: 'rust', go: 'go', java: 'java',
      html: 'html', css: 'css', json: 'json', md: 'markdown',
      yml: 'yaml', yaml: 'yaml', xml: 'xml', sql: 'sql',
      sh: 'shell', bash: 'shell', ps1: 'powershell',
      c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    };
    return map[ext || ''] || 'plaintext';
  })();

  return (
    <div className="editor-panel">
      <Editor
        height="100%"
        language={language}
        value={activeTabData.content}
        onChange={handleChange}
        onMount={handleEditorMount}
        theme="vs-dark"
        options={{
          fontSize: 14,
          fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
          minimap: { enabled: true },
          lineNumbers: 'on',
          wordWrap: 'off',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  );
}
