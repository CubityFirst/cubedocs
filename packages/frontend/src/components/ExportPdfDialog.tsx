import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { runPdfExport, type PdfPageSize, type PdfTheme } from "@/lib/pdf-export";

interface Props {
  trigger: ReactNode;
  documentName?: string;
}

export function ExportPdfDialog({ trigger, documentName }: Props) {
  const [open, setOpen] = useState(false);
  const [pageSize, setPageSize] = useState<PdfPageSize>("A4");
  const [margins, setMargins] = useState(true);
  const [theme, setTheme] = useState<PdfTheme>("light");
  const [includeTitle, setIncludeTitle] = useState(true);
  const [hideAiSummary, setHideAiSummary] = useState(false);
  const [hideLastUpdated, setHideLastUpdated] = useState(false);

  function handleExport() {
    setOpen(false);
    // Let the dialog finish closing before the print pass snapshots the DOM.
    requestAnimationFrame(() => {
      runPdfExport({ pageSize, margins, theme, includeTitle, hideAiSummary, hideLastUpdated, documentName });
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export as PDF</DialogTitle>
          <DialogDescription>
            Opens your browser's print dialog. Choose <strong>Save as PDF</strong> as the destination to download a file with selectable text and working links.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pdf-page-size" className="text-sm font-medium">Page size</Label>
              <p className="text-xs text-muted-foreground">A4 is the default.</p>
            </div>
            <Select value={pageSize} onValueChange={v => setPageSize(v as PdfPageSize)}>
              <SelectTrigger id="pdf-page-size" className="h-8 w-[90px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A3">A3</SelectItem>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="A5">A5</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pdf-margins" className="text-sm font-medium cursor-pointer">Include margins</Label>
              <p className="text-xs text-muted-foreground">Adds 15&nbsp;mm of whitespace around the page.</p>
            </div>
            <Switch id="pdf-margins" checked={margins} onCheckedChange={setMargins} />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pdf-theme" className="text-sm font-medium">Theme</Label>
              <p className="text-xs text-muted-foreground">Light is recommended for printing.</p>
            </div>
            <Select value={theme} onValueChange={v => setTheme(v as PdfTheme)}>
              <SelectTrigger id="pdf-theme" className="h-8 w-[90px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pdf-include-title" className="text-sm font-medium cursor-pointer">Include document name at top of page</Label>
              <p className="text-xs text-muted-foreground">Renders the document title as a heading on the first page.</p>
            </div>
            <Switch id="pdf-include-title" checked={includeTitle} onCheckedChange={setIncludeTitle} />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pdf-hide-ai-summary" className="text-sm font-medium cursor-pointer">Hide AI summary</Label>
              <p className="text-xs text-muted-foreground">Omits the AI-generated summary block from the PDF.</p>
            </div>
            <Switch id="pdf-hide-ai-summary" checked={hideAiSummary} onCheckedChange={setHideAiSummary} />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="pdf-hide-last-updated" className="text-sm font-medium cursor-pointer">Hide last updated &amp; reading time</Label>
              <p className="text-xs text-muted-foreground">Omits the &ldquo;Last updated&hellip; · X min read&rdquo; line.</p>
            </div>
            <Switch id="pdf-hide-last-updated" checked={hideLastUpdated} onCheckedChange={setHideLastUpdated} />
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: scale and other layout adjustments are available in the browser's print dialog.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleExport}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
