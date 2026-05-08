import React, { useCallback, useRef } from 'react';

interface Props {
  direction: 'left' | 'right';
  onResize: (delta: number) => void;
}

export function ResizeHandle({ direction, onResize }: Props) {
  const dragging = useRef(false);
  const startX = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientX - startX.current;
      startX.current = ev.clientX;
      onResize(delta * (direction === 'left' ? 1 : -1));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [direction, onResize]);

  return (
    <div
      className={`resize-handle resize-handle-${direction}`}
      onMouseDown={onMouseDown}
    />
  );
}
