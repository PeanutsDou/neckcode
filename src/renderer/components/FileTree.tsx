import React, { useEffect, useState, useCallback } from 'react';
import { useEditorStore, type FileEntry } from '../stores/editor-store';

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[] | null; // null = not loaded yet
  loading: boolean;
}

function buildTree(files: FileEntry[], rootPath: string): TreeNode[] {
  return files.map(f => ({
    name: f.name,
    path: f.path,
    isDir: f.isDir,
    children: f.isDir ? null : [],
    loading: false,
  }));
}

export function FileTree() {
  const { fileTree, fileTreeLoading, currentDir, loadFileTree, openFile } = useEditorStore();
  const [nodes, setNodes] = useState<TreeNode[]>([]);

  useEffect(() => {
    loadFileTree('.');
  }, []);

  useEffect(() => {
    if (!fileTreeLoading) {
      setNodes(buildTree(fileTree, currentDir));
    }
  }, [fileTree, fileTreeLoading, currentDir]);

  /** Recursively update a node by path in the tree. */
  function updateNode(nodes: TreeNode[], targetPath: string, updater: (n: TreeNode) => TreeNode): TreeNode[] {
    return nodes.map(n => {
      if (n.path === targetPath) return updater(n);
      if (Array.isArray(n.children)) {
        return { ...n, children: updateNode(n.children, targetPath, updater) };
      }
      return n;
    });
  }

  const loadChildren = useCallback(async (node: TreeNode) => {
    if (node.children !== null || !node.isDir) return;
    setNodes(prev => updateNode(prev, node.path, n => ({ ...n, loading: true })));
    try {
      const entries = await window.electronAPI.listDir(node.path);
      const children: TreeNode[] = entries.map((e: FileEntry) => ({
        name: e.name,
        path: e.path,
        isDir: e.isDir,
        children: e.isDir ? null : [],
        loading: false,
      }));
      setNodes(prev => updateNode(prev, node.path, n => ({ ...n, children, loading: false })));
    } catch {
      setNodes(prev => updateNode(prev, node.path, n => ({ ...n, children: [], loading: false })));
    }
  }, []);

  const handleToggle = useCallback((node: TreeNode) => {
    if (!node.isDir) {
      openFile(node.path);
      return;
    }
    if (Array.isArray(node.children)) {
      setNodes(prev => updateNode(prev, node.path, n => ({ ...n, children: null })));
    } else {
      loadChildren(node);
    }
  }, [loadChildren, openFile]);

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = Array.isArray(node.children);
    const isLeaf = !node.isDir;
    const indent = depth * 14;

    return (
      <React.Fragment key={node.path}>
        <div
          className={`file-tree-item ${node.isDir ? 'is-dir' : 'is-file'} ${isExpanded ? 'expanded' : ''}`}
          style={{ paddingLeft: 10 + indent }}
          onClick={() => handleToggle(node)}
        >
          <span className="file-icon">
            {node.loading ? '⏳' : isLeaf ? '—' : isExpanded ? '▾' : '▸'}
          </span>
          <span className="file-name">{node.name}</span>
        </div>
        {isExpanded && node.children!.map(child => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span className="file-tree-title">Files</span>
        <button className="file-tree-refresh" onClick={() => loadFileTree('.')} title="刷新">
          刷新
        </button>
      </div>
      <div className="file-tree-list">
        {fileTreeLoading && nodes.length === 0 && <div className="file-tree-loading">Loading...</div>}
        {nodes.map(node => renderNode(node, 0))}
      </div>
    </div>
  );
}
