const fs = require('fs');
const fp = 'D:/AR/deepseekcode/src/renderer/components/ChatPanel.tsx';
let c = fs.readFileSync(fp, 'utf8');

// Add useMemo and ChatEntry import
c = c.replace(
  "import React from 'react';",
  "import React, { useMemo } from 'react';"
);
c = c.replace(
  "} from '../stores/chat-store';",
  "} from '../stores/chat-store';\nimport type { ChatEntry } from '../stores/chat-store';"
);

// Add filter function before the ChatPanel component
const filterFn = `
/** Hide individual tool entries that are grouped under a tool summary. */
function filterToolEntries(entries: ChatEntry[]): ChatEntry[] {
  const result: ChatEntry[] = [];
  let skipUntilSummary = false;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.role === 'system' && entry.toolSummary) {
      // Remove preceding tool entries back to the last non-tool entry
      while (result.length > 0) {
        const last = result[result.length - 1];
        if (last.role === 'tool') {
          result.pop();
        } else {
          break;
        }
      }
    }
    result.push(entry);
  }
  return result;
}
`;

// Insert filterFn before "export function ChatPanel"
c = c.replace("export function ChatPanel() {", filterFn + "\nexport function ChatPanel() {");

// Add useMemo filter
c = c.replace(
  "  const entries = useActiveEntries();",
  "  const rawEntries = useActiveEntries();\n  const entries = useMemo(() => filterToolEntries(rawEntries), [rawEntries]);"
);

fs.writeFileSync(fp, c);
console.log('OK');
