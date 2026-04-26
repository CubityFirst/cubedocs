import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

interface UserAvatarProps {
  userId: string;
  name: string;
  className?: string;
  cacheBust?: number;
}

export function UserAvatar({ userId, name, className, cacheBust }: UserAvatarProps) {
  const src = cacheBust !== undefined
    ? `/api/avatar/${userId}?v=${cacheBust}`
    : `/api/avatar/${userId}`;
  return (
    <Avatar className={className}>
      <AvatarImage src={src} alt={name} />
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
