export function userColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) & 0xffffffff;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 70% 50%)`;
}

export function userColorLight(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) & 0xffffffff;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 70% 80%)`;
}
