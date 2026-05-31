// Apply cost tracking patches to ipc-handlers.ts
const fs = require('fs');
const filePath = 'D:/AR/deepseekcode/src/main/ipc-handlers.ts';
let c = fs.readFileSync(filePath, 'utf8');

// Patch 1: Add cost tracking in onComplete (main session)
const p1Old = `            getWindow()?.webContents.send('agent:turn-done', sessionId, step);
            requestWindowAttention();`;
const p1New = `            // Track cost for this turn
            if (step.usage) {
              const costModel = getSessionModelId(sessionId);
              const turnCost = calculateUSDCost(costModel, step.usage);
              addToTotalSessionCost(turnCost, step.usage, costModel);
              getWindow()?.webContents.send('cost:updated', getCostSummary());
            }
            getWindow()?.webContents.send('agent:turn-done', sessionId, step);
            requestWindowAttention();`;

if (c.includes(p1Old)) {
  c = c.replace(p1Old, p1New);
  console.log('[1/3] Patched onComplete for main session');
}

// Patch 2: Add cost IPC handlers (before terminal:stop)
const p2Old = `  ipcMain.handle('terminal:stop', () => {
    termProcess?.kill();
    termProcess = null;
  });
}`;
const p2New = `  // ---- Cost Tracking ----
  ipcMain.handle('cost:summary', () => getCostSummary());
  ipcMain.handle('cost:reset', () => { resetCostState(); return getCostSummary(); });

  ipcMain.handle('terminal:stop', () => {
    termProcess?.kill();
    termProcess = null;
  });
}`;

if (c.includes(p2Old)) {
  c = c.replace(p2Old, p2New);
  console.log('[2/3] Added cost IPC handlers');
} else {
  console.log('[2/3] WARN: terminal:stop pattern not found');
}

// Patch 3: Persist cost state on session save
const p3Old = `  ipcMain.handle('session:save', async (_event, session: SessionData) => {
    const agent = sessionAgents.get(session.id);
    saveSession({
      ...session,
      agentMessages: agent ? agent.getMessages() : session.agentMessages,
      updatedAt: session.updatedAt || Date.now(),
    });
  });`;
const p3New = `  ipcMain.handle('session:save', async (_event, session: SessionData) => {
    const agent = sessionAgents.get(session.id);
    saveSession({
      ...session,
      agentMessages: agent ? agent.getMessages() : session.agentMessages,
      updatedAt: session.updatedAt || Date.now(),
      costState: getCostStateSnapshot(),
    } as any);
  });`;

if (c.includes(p3Old)) {
  c = c.replace(p3Old, p3New);
  console.log('[3/3] Patched session:save with cost persistence');
}

// Patch 4: Restore cost on session load
const p4Old = `  ipcMain.handle('session:load', async (_event, id: string) => {
    return loadSession(id);
  });`;
const p4New = `  ipcMain.handle('session:load', async (_event, id: string) => {
    const session = loadSession(id);
    if (session && (session as any).costState) {
      restoreCostState((session as any).costState);
    }
    return session;
  });`;

if (c.includes(p4Old)) {
  c = c.replace(p4Old, p4New);
  console.log('[4/3] Patched session:load with cost restore');
}

fs.writeFileSync(filePath, c);
console.log('Done patching ipc-handlers.ts');
