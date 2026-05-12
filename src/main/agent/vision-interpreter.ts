import { nativeImage } from 'electron';
import type { Provider } from './runtime';
import type { Attachment, Message } from './types';

interface ParsedTarget {
  bbox: [number, number, number, number];
  label: string;
}

const FULL_IMAGE_PROMPT = `You are a vision parser for a text-only coding agent.
你必须使用中文输出，除非图片中的原文、文件名、代码、控件文字本身是英文。章节标题也使用中文。
Do not answer the user directly. Convert the image into a strict visual context document.
Use the user's question as the attention signal. If they mention a region, UI element, color, overlap, readability, red box, left/right/top/bottom, progress bar, button, toolbar, or text, identify the relevant region first.

Return Markdown with exactly these Chinese sections:
[Visual Context]
图片尺寸: unknown until inferred from pixels if visible.
坐标系: 左上角为原点，单位为像素。
网格: 3x3

## 用户问题
<repeat the user question>

## 关注区域
- target: <short Chinese label>
  bbox: [x1,y1,x2,y2]
  grid: <A1-C3>
  confidence: <0-1>
  reason: <Chinese explanation why this region matters to the question>

## 全图概览
<concise Chinese summary>

## 重点区域分析
<for the user-mentioned target, describe visual elements, OCR, colors, contrast, overlap/occlusion, and layout in Chinese>

## UI Issue Diagnosis
- affected region: <bbox/grid>
- observed issue: <Chinese concrete UI problem if any>
- visual evidence: <Chinese evidence with coordinates, text, colors, overlap, contrast>
- likely fix direction: <Chinese layout/style direction useful to a coding agent>

## 网格观察
- A1 [左上]: ...
- A2 [上中]: ...
- A3 [右上]: ...
- B1 [左中]: ...
- B2 [中心]: ...
- B3 [右中]: ...
- C1 [左下]: ...
- C2 [下中]: ...
- C3 [右下]: ...

## 不确定项
<anything unclear, in Chinese>
[/Visual Context]`;

const FOCUSED_PROMPT = `You are refining a focused crop for a text-only coding agent.
你必须使用中文输出，除非图片中的原文、文件名、代码、控件文字本身是英文。
Describe only the crop. Be precise about visible text, colors, overlap, contrast, alignment, and UI defects.
Return Markdown:
## 局部裁剪复查
- crop id:
- 可见元素:
- OCR/文字:
- 颜色/对比度:
- 重叠/遮挡:
- UI 问题诊断:
- 可能修复方向:
- 不确定项:`;

function dataUriToNativeImage(dataUri: string) {
  try {
    const image = nativeImage.createFromDataURL(dataUri);
    return image.isEmpty() ? null : image;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseTargets(markdown: string, imageWidth: number, imageHeight: number): ParsedTarget[] {
  const targets: ParsedTarget[] = [];
  const regex = /target:\s*(.+?)[\r\n]+(?:\s+.*[\r\n]+)*?\s*bbox:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/gi;
  for (const match of markdown.matchAll(regex)) {
    const x1 = clamp(Number(match[2]), 0, imageWidth);
    const y1 = clamp(Number(match[3]), 0, imageHeight);
    const x2 = clamp(Number(match[4]), 0, imageWidth);
    const y2 = clamp(Number(match[5]), 0, imageHeight);
    if (x2 - x1 < 16 || y2 - y1 < 16) continue;
    targets.push({ label: match[1].trim().slice(0, 80), bbox: [x1, y1, x2, y2] });
    if (targets.length >= 3) break;
  }
  return targets;
}

function cropAttachment(attachment: Attachment, target: ParsedTarget, index: number): Attachment | null {
  const image = dataUriToNativeImage(attachment.data);
  if (!image) return null;
  const size = image.getSize();
  const [x1, y1, x2, y2] = target.bbox;
  const padX = Math.round((x2 - x1) * 0.15);
  const padY = Math.round((y2 - y1) * 0.15);
  const x = clamp(x1 - padX, 0, size.width);
  const y = clamp(y1 - padY, 0, size.height);
  const right = clamp(x2 + padX, 0, size.width);
  const bottom = clamp(y2 + padY, 0, size.height);
  if (right <= x || bottom <= y) return null;
  const crop = image.crop({ x, y, width: right - x, height: bottom - y });
  return {
    type: 'image',
    mimeType: 'image/png',
    data: crop.toDataURL(),
  };
}

export class VisionInterpreter {
  constructor(private readonly provider: Provider, private readonly parserModel: string) {}

  async interpret(userQuestion: string, attachments: Attachment[], signal?: AbortSignal): Promise<string> {
    const imageAttachments = attachments.filter(att => att.type === 'image');
    if (imageAttachments.length === 0) return '';
    const docs: string[] = [];

    for (let i = 0; i < imageAttachments.length; i++) {
      const attachment = imageAttachments[i];
      const image = dataUriToNativeImage(attachment.data);
      const size = image?.getSize();
      const sizeLine = size ? `Actual image size: ${size.width}x${size.height}.` : 'Actual image size: unknown.';

      const fullMessages: Message[] = [
        { role: 'system', content: FULL_IMAGE_PROMPT },
        {
          role: 'user',
          content: `${sizeLine}\nImage index: ${i + 1}\nUser question: ${userQuestion}`,
          attachments: [attachment],
        },
      ];
      const full = await this.provider.runStep({
        messages: fullMessages,
        tools: [],
        model: this.parserModel,
        signal,
      });
      if (!full.text.trim()) {
        throw new Error(`Image parser model "${this.parserModel}" returned an empty response. Check that this model actually supports vision/image input, or choose another multimodal parser model in Settings.`);
      }

      const refinements: string[] = [];
      if (image && size) {
        const targets = parseTargets(full.text, size.width, size.height);
        for (let t = 0; t < targets.length; t++) {
          const crop = cropAttachment(attachment, targets[t], t);
          if (!crop) continue;
          const focused = await this.provider.runStep({
            messages: [
              { role: 'system', content: FOCUSED_PROMPT },
              {
                role: 'user',
                content: `Original image index: ${i + 1}\nCrop id: ${t + 1}\nTarget: ${targets[t].label}\nOriginal bbox: [${targets[t].bbox.join(',')}]\nUser question: ${userQuestion}`,
                attachments: [crop],
              },
            ],
            tools: [],
            model: this.parserModel,
            signal,
          });
          if (focused.text.trim()) refinements.push(focused.text.trim());
        }
      }

      docs.push([
        `<!-- image ${i + 1} -->`,
        full.text.trim(),
        refinements.length > 0 ? `\n## 程序化局部裁剪复查\n${refinements.join('\n\n')}` : '',
      ].join('\n'));
    }

    return docs.join('\n\n');
  }
}
