import { promises as fs } from 'fs';
import { resolve } from 'path';

interface NotebookCell {
  cell_type: 'code' | 'markdown';
  id?: string;
  source: string | string[];
  metadata?: Record<string, unknown>;
  outputs?: unknown[];
}

interface Notebook {
  cells: NotebookCell[];
  metadata?: Record<string, unknown>;
  nbformat?: number;
  nbformat_minor?: number;
  [key: string]: unknown;
}

function isNotebook(obj: unknown): obj is Notebook {
  if (!obj || typeof obj !== 'object') return false;
  const n = obj as Record<string, unknown>;
  return Array.isArray(n.cells) && typeof n.nbformat === 'number';
}

function normalizeSource(source: string | string[]): string {
  if (Array.isArray(source)) return source.join('');
  return source;
}

function stringToSource(content: string): string[] {
  // Split into lines, preserve trailing newline
  if (!content) return [''];
  const lines = content.split('\n');
  return lines.map((l, i) => i < lines.length - 1 ? l + '\n' : l);
}

export async function notebookEdit(
  workspaceRoot: string,
  args: Record<string, unknown>,
): Promise<string> {
  const notebookPath = String(args.notebook_path || '');
  if (!notebookPath) return 'ERROR: "notebook_path" is required.';

  const p = resolve(workspaceRoot, notebookPath);
  const normalizedRoot = resolve(workspaceRoot);
  if (p !== normalizedRoot && !p.startsWith(normalizedRoot + '\\') && !p.startsWith(normalizedRoot + '/')) {
    return `ERROR: Path escapes workspace root: ${notebookPath}`;
  }

  let raw: string;
  try {
    raw = await fs.readFile(p, 'utf8');
  } catch {
    return `ERROR: Cannot read "${notebookPath}"`;
  }

  let notebook: Notebook;
  try {
    notebook = JSON.parse(raw);
  } catch {
    return `ERROR: "${notebookPath}" is not valid JSON.`;
  }

  if (!isNotebook(notebook)) {
    return `ERROR: "${notebookPath}" is not a valid Jupyter notebook (missing "cells" or "nbformat").`;
  }

  const editMode = (typeof args.edit_mode === 'string' ? args.edit_mode : 'replace') as string;
  const newSource = String(args.new_source || '');
  const cellType = (typeof args.cell_type === 'string' ? args.cell_type : undefined) as NotebookCell['cell_type'] | undefined;
  const cellId = typeof args.cell_id === 'string' ? args.cell_id : undefined;

  let cellIndex: number;

  if (cellId) {
    cellIndex = notebook.cells.findIndex(c => c.id === cellId);
    if (cellIndex === -1) {
      return `ERROR: Cell with id "${cellId}" not found in notebook.`;
    }
  } else {
    cellIndex = 0;
    if (editMode !== 'insert' && notebook.cells.length === 0) {
      return 'ERROR: Notebook has no cells. Use insert mode to add cells.';
    }
  }

  if (editMode === 'replace') {
    const cell = notebook.cells[cellIndex];
    cell.source = stringToSource(newSource);
    if (cellType) cell.cell_type = cellType;
    const displayId = cell.id ? `"${cell.id}"` : `#${cellIndex}`;
    return `Replaced source in cell ${displayId} of "${notebookPath}".`;
  }

  if (editMode === 'insert') {
    const newCell: NotebookCell = {
      cell_type: cellType || 'code',
      source: stringToSource(newSource),
    };
    // Insert after the specified cell (or at beginning if no cellId)
    const insertAt = cellId !== undefined ? cellIndex + 1 : 0;
    notebook.cells.splice(insertAt, 0, newCell);
    return `Inserted new ${newCell.cell_type} cell at position ${insertAt} in "${notebookPath}".`;
  }

  if (editMode === 'delete') {
    const cell = notebook.cells[cellIndex];
    notebook.cells.splice(cellIndex, 1);
    const displayId = cell.id ? `"${cell.id}"` : `#${cellIndex}`;
    return `Deleted cell ${displayId} from "${notebookPath}".`;
  }

  return `ERROR: Unknown edit_mode "${editMode}". Use "replace", "insert", or "delete".`;
}
