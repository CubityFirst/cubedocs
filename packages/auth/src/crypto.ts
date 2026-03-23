export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  if (buffer instanceof ArrayBuffer) {
    return buffer.slice(byteOffset, byteOffset + byteLength);
  }

  const copy = new Uint8Array(byteLength);
  copy.set(bytes);
  return copy.buffer;
}
