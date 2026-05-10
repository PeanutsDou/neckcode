import React, { useCallback, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useEditorStore } from '../stores/editor-store';
import { useChatStore } from '../stores/chat-store';
import { useAppStore } from '../stores/app-store';
import { LIGHT_SCHEMES, type SchemeColorTokens } from '../theme-schemes';

const NIGHT_BLUE_COLORS: SchemeColorTokens = {
  bgPrimary: '#000f22',
  bgSecondary: '#102842',
  bgSurface: '#1b3554',
  bgHover: '#29496b',
  border: '#3f6593',
  textPrimary: '#c0e6fd',
  textSecondary: '#a6cce7',
  textMuted: '#80aad3',
  accent: '#80aad3',
  accentDim: '#5b86b6',
  error: '#d88a8a',
  success: '#8ec4aa',
  warning: '#d1b978',
};

function hex(color: string): string {
  return color.replace(/^#/, '');
}

function defineLightEditorTheme(monaco: typeof import('monaco-editor'), name: string, c: SchemeColorTokens) {
  monaco.editor.defineTheme(name, {
    base: 'vs',
    inherit: false,
    rules: [
      { token: 'comment', foreground: hex(c.textMuted), fontStyle: 'italic' },
      { token: 'keyword', foreground: hex(c.accent) },
      { token: 'string', foreground: hex(c.success) },
      { token: 'number', foreground: hex(c.textPrimary) },
      { token: 'type', foreground: hex(c.accentDim) },
      { token: 'function', foreground: hex(c.textPrimary) },
      { token: 'identifier', foreground: hex(c.textPrimary) },
    ],
    colors: {
      'editor.background': c.bgPrimary,
      'editor.foreground': c.textPrimary,
      'editor.lineHighlightBackground': c.bgSurface,
      'editor.selectionBackground': c.bgHover,
      'editorLineNumber.foreground': c.textMuted,
      'editorLineNumber.activeForeground': c.textPrimary,
      'editorGutter.background': c.bgSecondary,
      'editorCursor.foreground': c.accent,
      'editorBracketMatch.background': c.bgSurface,
      'editorBracketMatch.border': c.border,
      'editorWidget.background': c.bgPrimary,
      'editorWidget.border': c.border,
      'minimap.background': c.bgSecondary,
      'input.background': c.bgPrimary,
      'input.border': c.border,
      'focusBorder': c.accent,
      'scrollbar.shadow': '#00000010',
      'scrollbarSlider.background': '#00000020',
      'scrollbarSlider.hoverBackground': '#00000030',
    },
  });
}

function defineAppTheme(monaco: typeof import('monaco-editor')) {
  for (const scheme of LIGHT_SCHEMES) {
    defineLightEditorTheme(monaco, `app-light-${scheme.id}`, scheme.tokens);
  }

  const d = NIGHT_BLUE_COLORS;
  monaco.editor.defineTheme('app-dark', {
    base: 'vs-dark',
    inherit: false,
    rules: [
      { token: 'comment', foreground: hex(d.textMuted), fontStyle: 'italic' },
      { token: 'keyword', foreground: hex(d.accent) },
      { token: 'string', foreground: hex(d.success) },
      { token: 'number', foreground: hex(d.textPrimary) },
      { token: 'type', foreground: hex(d.accentDim) },
      { token: 'function', foreground: hex(d.textPrimary) },
      { token: 'identifier', foreground: hex(d.textPrimary) },
    ],
    colors: {
      'editor.background': d.bgPrimary,
      'editor.foreground': d.textPrimary,
      'editor.lineHighlightBackground': d.bgSurface,
      'editor.selectionBackground': d.bgHover,
      'editorLineNumber.foreground': d.textMuted,
      'editorLineNumber.activeForeground': d.textPrimary,
      'editorGutter.background': d.bgSecondary,
      'editorCursor.foreground': d.accent,
      'editorBracketMatch.background': d.bgSurface,
      'editorBracketMatch.border': d.border,
      'editorWidget.background': d.bgPrimary,
      'editorWidget.border': d.border,
      'minimap.background': d.bgSecondary,
      'input.background': d.bgPrimary,
      'input.border': d.border,
      'focusBorder': d.accent,
      'scrollbar.shadow': '#00000030',
      'scrollbarSlider.background': '#ffffff15',
      'scrollbarSlider.hoverBackground': '#ffffff25',
    },
  });
}

export function EditorPanel() {
  const { tabs, activeTab, updateContent, saveFile, setSelectedText } = useEditorStore();
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const theme = useAppStore(s => s.theme);
  const lightScheme = useAppStore(s => s.lightScheme);

  const activeTabData = tabs.find(t => t.path === activeTab);

  const handleBeforeMount = useCallback((monaco: typeof import('monaco-editor')) => {
    defineAppTheme(monaco);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;

    editor.addCommand(2048 | 49, () => {
      const current = useEditorStore.getState().activeTab;
      if (current) useEditorStore.getState().saveFile(current);
    });

    editor.onDidChangeCursorSelection(() => {
      const model = editor.getModel();
      const range = editor.getSelection();
      const selection = model && range ? model.getValueInRange(range) : '';
      if (selection) setSelectedText(selection);
    });

    editor.addAction({
      id: 'send-to-chat',
      label: 'Send Selection to Chat',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run(ed) {
        const model = ed.getModel();
        const range = ed.getSelection();
        const sel = model && range ? model.getValueInRange(range) : '';
        if (sel) useChatStore.getState().setPendingContext(sel);
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
        beforeMount={handleBeforeMount}
        theme={theme === 'dark' ? 'app-dark' : `app-light-${lightScheme}`}
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
