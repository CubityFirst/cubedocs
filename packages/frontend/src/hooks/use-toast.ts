import * as React from "react";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type Action =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "UPDATE_TOAST"; toast: Partial<ToasterToast> & { id: string } }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<Action>) {
  if (toastTimeouts.has(toastId)) return;
  toastTimeouts.set(
    toastId,
    setTimeout(() => {
      toastTimeouts.delete(toastId);
      dispatch({ type: "REMOVE_TOAST", toastId });
    }, TOAST_REMOVE_DELAY),
  );
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TOAST":
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case "UPDATE_TOAST":
      return { toasts: state.toasts.map(t => (t.id === action.toast.id ? { ...t, ...action.toast } : t)) };
    case "DISMISS_TOAST": {
      return { toasts: state.toasts.map(t => (action.toastId === undefined || t.id === action.toastId ? { ...t, open: false } : t)) };
    }
    case "REMOVE_TOAST":
      return { toasts: action.toastId === undefined ? [] : state.toasts.filter(t => t.id !== action.toastId) };
  }
}

// Module-level store so toast() works outside React
let dispatch: React.Dispatch<Action> = () => {};
let state: State = { toasts: [] };
const listeners: Array<(s: State) => void> = [];

function dispatchGlobal(action: Action) {
  state = reducer(state, action);
  listeners.forEach(l => l(state));
  if (action.type === "DISMISS_TOAST") {
    const id = action.toastId;
    if (id) addToRemoveQueue(id, dispatchGlobal);
    else state.toasts.forEach(t => addToRemoveQueue(t.id, dispatchGlobal));
  }
}

function toast(props: Omit<ToasterToast, "id">) {
  const id = Math.random().toString(36).slice(2);
  dispatchGlobal({ type: "ADD_TOAST", toast: { ...props, id, open: true, onOpenChange: open => { if (!open) dispatchGlobal({ type: "DISMISS_TOAST", toastId: id }); } } });
  return { id, dismiss: () => dispatchGlobal({ type: "DISMISS_TOAST", toastId: id }) };
}

function useToast() {
  const [s, setS] = React.useState<State>(state);
  React.useEffect(() => {
    listeners.push(setS);
    dispatch = dispatchGlobal;
    return () => { const i = listeners.indexOf(setS); if (i > -1) listeners.splice(i, 1); };
  }, []);
  return { toasts: s.toasts, toast, dismiss: (id?: string) => dispatchGlobal({ type: "DISMISS_TOAST", toastId: id }) };
}

export { useToast, toast };
