import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

export type PersonalPlan = "free" | "ink";

interface UserAvatarProps {
  userId: string;
  name: string;
  className?: string;
  cacheBust?: number;
  // Annex Ink supporters get an animated conic-gradient ring. Other
  // values (or undefined) render with no extra decoration.
  personalPlan?: PersonalPlan;
}

export function UserAvatar({ userId, name, className, cacheBust, personalPlan }: UserAvatarProps) {
  const src = cacheBust !== undefined
    ? `/api/avatar/${userId}?v=${cacheBust}`
    : `/api/avatar/${userId}`;
  const inner = (
    <Avatar className={className}>
      <AvatarImage src={src} alt={name} />
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
  if (personalPlan === "ink") {
    return <span className="ink-border inline-block">{inner}</span>;
  }
  return inner;
}
