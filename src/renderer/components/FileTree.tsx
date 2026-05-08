import React, { useEffect } from 'react';
import { useEditorStore, type FileEntry } from '../stores/editor-store';

export function FileTree() {
  const { fileTree, fileTreeLoading, currentDir, loadFileTree, openFile } = useEditorStore();

  useEffect(() => {
    loadFileTree('.');
  }, []);

  const handleClick = (entry: FileEntry) => {
    if (entry.isDir) {
      loadFileTree(entry.path);
    } else {
      openFile(entry.path);
    }
  };

  const goUp = () => {
    if (currentDir === '.' || currentDir === '') return;
    const parent = currentDir.split('/').slice(0, -1).join('/') || '.';
    loadFileTree(parent);
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">Files</span>
        <button className="file-tree-refresh" onClick={() => loadFileTree(currentDir)} title="Refresh">
          &#x21bb;
        </button>
      </div>
      <div className="file-tree-path">
        <button className="file-tree-up" onClick={goUp} title="Go up">
          ..
        </button>
        <span>/ {currentDir}</span>
      </div>
      <div className="file-tree-list">
        {fileTreeLoading && <div className="file-tree-loading">Loading...</div>}
        {fileTree.map(entry => (
          <div
            key={entry.path}
            className={`file-tree-item ${entry.isDir ? 'is-dir' : 'is-file'}`}
            onClick={() => handleClick(entry)}
          >
            <span className="file-icon">{entry.isDir ? '\u{1F4C1}' : '\u{1F4C4}'}</span>
            <span className="file-name">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
