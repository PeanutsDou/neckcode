import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechInputOptions {
  /** 收到转写结果后的回调，delta 是增量文本 */
  onResult: (delta: string) => void;
  /** 是否启用（窗口可见时才激活） */
  enabled?: boolean;
}

interface UseSpeechInputReturn {
  /** 是否正在录音 */
  listening: boolean;
  /** 录音中转为 final 的文本 */
  finalText: string;
}

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function useSpeechInput({ onResult, enabled = true }: UseSpeechInputOptions): UseSpeechInputReturn {
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState('');
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // 初始化 recognition 实例（单例，复用）
  const getRecognition = useCallback(() => {
    if (!recognitionRef.current && SpeechRecognitionAPI) {
      const rec = new SpeechRecognitionAPI() as any;
      rec.lang = 'zh-CN';
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;

      let interim = '';
      rec.onresult = (event: any) => {
        let i = '';
        let f = '';
        for (let j = event.resultIndex; j < event.results.length; j++) {
          const t = event.results[j][0].transcript;
          if (event.results[j].isFinal) {
            f += t;
          } else {
            i += t;
          }
        }
        if (f) {
          setFinalText(prev => prev + f);
          onResultRef.current(f);
        }
        interim = i;
      };

      rec.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // 正常情况，忽略
        } else {
          console.warn('[Speech]', event.error);
        }
      };

      rec.onend = () => {
        setListening(false);
        listeningRef.current = false;
        if (interim) {
          onResultRef.current(interim);
          interim = '';
        }
      };

      recognitionRef.current = rec;
    }
    return recognitionRef.current;
  }, []);

  const start = useCallback(() => {
    if (!enabled || !SpeechRecognitionAPI) return;
    if (listeningRef.current) return;
    const rec = getRecognition();
    if (!rec) return;
    try {
      rec.start();
      listeningRef.current = true;
      setListening(true);
      setFinalText('');
    } catch {
      // 可能已经在录音中
    }
  }, [enabled, getRecognition]);

  const stop = useCallback(() => {
    if (!listeningRef.current) return;
    const rec = recognitionRef.current;
    if (rec) {
      try { rec.stop(); } catch {}
    }
    listeningRef.current = false;
    setListening(false);
  }, []);

  // Q 键按下开始，松开停止
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'q' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.repeat) {
        // 仅当不在输入框内打字时触发（不在 textarea/input 中，或按住不放）
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'TEXTAREA' || tag === 'INPUT') {
          // 输入框内：Q 键正常输入，只有当长按（>300ms）时才录音
          // 长按判断较复杂，这里简单地：如果 Q 键按下时输入框没有焦点或内容为空，也录音
          const el = e.target as HTMLTextAreaElement | HTMLInputElement;
          if (el.value.length > 0) return; // 有内容时不抢 Q 键
        }
        e.preventDefault();
        start();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'q' && listeningRef.current) {
        e.preventDefault();
        stop();
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
  }, [enabled, start, stop]);

  // 清理
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
    };
  }, []);

  return { listening, finalText };
}
