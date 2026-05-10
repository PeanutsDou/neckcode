import React, { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  src: string;
  onClose: () => void;
}

export function ImageViewer({ open, src, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const rmbDragging = useRef(false);
  const rmbStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

  useEffect(() => {
    if (open) { setScale(1); setPos({ x: 0, y: 0 }); }
  }, [open, src]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(prev => Math.max(0.1, Math.min(10, prev - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 2) return; // right-click only
    e.preventDefault();
    rmbDragging.current = true;
    rmbStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!rmbDragging.current) return;
      setPos({
        x: rmbStart.current.px + ev.clientX - rmbStart.current.x,
        y: rmbStart.current.py + ev.clientY - rmbStart.current.y,
      });
    };
    const onUp = () => {
      rmbDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [pos]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="image-viewer-overlay" onClick={onClose}>
      <div className="image-viewer-close" onClick={onClose}>&times;</div>
      <div className="image-viewer-hint">滚轮缩放 · 右键拖动 · ESC 关闭</div>
      <img
        src={src}
        className="image-viewer-img"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
        draggable={false}
        onClick={e => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        alt=""
      />
    </div>
  );
}
