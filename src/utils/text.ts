const readAsText = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') resolve(reader.result);
    else reject(new Error('Unable to read text'));
  };
  reader.onerror = () => reject(reader.error ?? new Error('Unable to read text'));
  reader.onabort = () => reject(new Error('Text reading was cancelled'));
  reader.readAsText(blob, 'UTF-8');
});

export const readFileAsText = (file: Blob): Promise<string> => readAsText(file);

export const decodeUtf8 = async (buffer: ArrayBuffer): Promise<string> => {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  }

  let text = await readAsText(new Blob([buffer]));
  const bytes = new Uint8Array(buffer);
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hasBom && text.charCodeAt(0) !== 0xfeff) text = `\uFEFF${text}`;

  // FileReader replaces malformed UTF-8. Round-trip when TextEncoder is
  // available so invalid byte sequences are still rejected like TextDecoder.
  if (typeof TextEncoder !== 'undefined') {
    const encoded = new TextEncoder().encode(text);
    if (encoded.length !== bytes.length || encoded.some((byte, index) => byte !== bytes[index])) {
      throw new TypeError('Invalid UTF-8');
    }
  }
  return text;
};
