export function inferImageMimeType(data: string, fallback = 'image/png'): string {
  if (data.startsWith('data:image/png')) return 'image/png';
  if (data.startsWith('data:image/jpeg')) return 'image/jpeg';
  if (data.startsWith('data:image/jpg')) return 'image/jpeg';
  if (data.startsWith('data:image/webp')) return 'image/webp';
  if (data.startsWith('data:image/gif')) return 'image/gif';
  return fallback;
}
