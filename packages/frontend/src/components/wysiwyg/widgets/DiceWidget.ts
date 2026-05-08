import { createElement, type ReactElement } from "react";
import { WidgetType } from "@codemirror/view";
import { ReactWidget } from "./ReactWidget";
import { DiceRoll } from "@/components/DiceRoll";

export class DiceWidget extends ReactWidget {
  protected tag: "span" = "span";

  constructor(private readonly notation: string) {
    super();
  }

  protected render(): ReactElement {
    return createElement(DiceRoll, { notation: this.notation });
  }

  eq(other: WidgetType): boolean {
    return other instanceof DiceWidget && other.notation === this.notation;
  }
}
