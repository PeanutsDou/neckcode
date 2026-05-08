import React from 'react';

interface Props {
  data: { status: string; file: string; line: number; old: string; new: string };
}

export function DiffPreview({ data }: Props) {
  const oldLines = data.old.split('\n');
  const newLines = data.new.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);

  return (
    <div className="diff-preview">
      <div className="diff-header">
        <span className="diff-file">{data.file}</span>
        <span className="diff-line">line {data.line}</span>
      </div>
      <div className="diff-content">
        {Array.from({ length: maxLen }, (_, i) => {
          const oldLine = oldLines[i];
          const newLine = newLines[i];
          const changed = oldLine !== newLine;

          return (
            <div key={i} className={`diff-row ${changed ? 'changed' : ''}`}>
              <span className="diff-gutter diff-gutter-old">{changed ? '-' : ' '}</span>
              <span className="diff-text diff-text-old">
                {oldLine !== undefined ? oldLine : ''}
              </span>
              {changed && (
                <>
                  <span className="diff-gutter diff-gutter-new">+</span>
                  <span className="diff-text diff-text-new">
                    {newLine !== undefined ? newLine : ''}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
