import React, { useEffect, useRef, useState } from 'react';

interface Props {
  code: string;
}

export function MermaidBlock({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#89b4fa',
            primaryTextColor: '#cdd6f4',
            lineColor: '#a6adc8',
            tertiaryColor: '#313244',
          },
        });

        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="mermaid-block mermaid-error">
        <div className="mermaid-error-msg">Mermaid render error: {error}</div>
        <pre className="mermaid-fallback">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="mermaid-block mermaid-loading">Rendering diagram...</div>;
  }

  return (
    <div className="mermaid-block">
      <div className="mermaid-header">Diagram</div>
      <div
        className="mermaid-svg"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
