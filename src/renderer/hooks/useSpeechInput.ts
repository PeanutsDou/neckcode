import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechInputOptions {
  onResult: (delta: string) => void;
  enabled?: boolean;
}

interface UseSpeechInputReturn {
  listening: boolean;
  finalText: string;
}

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

const HOLD_THRESHOLD = 300; // ms，按住超过此时间才触发录音

export function useSpeechInput({ onResult, enabled = true }: UseSpeechInputOptions): UseSpeechInputReturn {
  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState('');
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

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
          // 正常
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
      // 可能已在录音中
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

  // Q 键：按下开始计时，300ms 后触发录音；松开 <300ms 则正常输入 Q
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'q' || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag !== 'TEXTAREA' && tag !== 'INPUT') return;

      // 阻止浏览器默认输入 Q
      e.preventDefault();

      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);

      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        start();
      }, HOLD_THRESHOLD);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'q') return;

      const tag = (e.target as HTMLElement)?.tagName;
      if (tag !== 'TEXTAREA' && tag !== 'INPUT') return;

      if (holdTimerRef.current) {
        // 短按（<300ms）：手动插入 q
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
        const el = e.target as HTMLTextAreaElement | HTMLInputElement;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const newVal = el.value.slice(0, start) + 'q' + el.value.slice(end);
        // 触发 React onChange
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set ?? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, newVal);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
        el.setSelectionRange(start + 1, start + 1);
      } else if (listeningRef.current) {
        stop();
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
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
