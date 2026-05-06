import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { UserAvatar } from "@/components/UserAvatar";

interface Editor {
  userId: string;
  name: string;
  color: string;
}

interface Props {
  editors: Editor[];
}

function PresenceAvatar({ editor }: { editor: Editor }) {
  return (
    <div className="group relative flex items-center" title={editor.name}>
      <div
        className="relative rounded-full shrink-0"
        style={{ boxShadow: `0 0 0 2px ${editor.color}` }}
      >
        <UserAvatar userId={editor.userId} name={editor.name} className="h-6 w-6 text-[10px]" />
      </div>
      {/* Sliding name label */}
      <span
        className="overflow-hidden whitespace-nowrap text-xs font-medium transition-[max-width,opacity] duration-200 max-w-0 opacity-0 group-hover:max-w-[120px] group-hover:opacity-100 ml-1.5"
        style={{ color: editor.color }}
      >
        {editor.name}
      </span>
    </div>
  );
}

export function EditorPresence({ editors }: Props) {
  if (editors.length === 0) return null;

  const visible = editors.slice(0, 3);
  const overflow = editors.slice(3);

  return (
    <div className="flex items-center gap-1">
      {visible.map((editor) => (
        <PresenceAvatar key={editor.userId} editor={editor} />
      ))}

      {overflow.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-6 items-center rounded-full border border-border bg-muted px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="end">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Also editing
            </p>
            <div className="flex flex-col gap-2">
              {overflow.map((editor) => (
                <div key={editor.userId} className="flex items-center gap-2">
                  <div
                    className="rounded-full shrink-0"
                    style={{ boxShadow: `0 0 0 2px ${editor.color}` }}
                  >
                    <UserAvatar userId={editor.userId} name={editor.name} className="h-6 w-6 text-[10px]" />
                  </div>
                  <span className="truncate text-sm">{editor.name}</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
