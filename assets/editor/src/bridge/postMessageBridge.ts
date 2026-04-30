import type { IncomingMessage, OutgoingMessage } from './types';

/**
 * Tiny postMessage wrapper for editor ↔ host communication.
 *
 * The host page (wp-admin) and the editor iframe share the same origin,
 * so origin checks are tight and there's no message-id round-tripping.
 *
 * Outgoing messages are tagged `source: 'imgsig-editor'`; incoming
 * ones must declare `source: 'imgsig-host'` or they're dropped. That
 * keeps unrelated postMessage traffic (other plugins, browser
 * extensions injected scripts) from triggering our handlers.
 */
export class PostMessageBridge {
  private listeners = new Map<string, Set<(msg: IncomingMessage) => void>>();
  private parentOrigin: string;

  constructor(parentOrigin: string = window.location.origin) {
    this.parentOrigin = parentOrigin;
    window.addEventListener('message', this.handleMessage);
  }

  /**
   * Sends a typed message to the parent window.
   */
  send(message: OutgoingMessage): void {
    if (window.parent === window) {
      // Not embedded — silently no-op so the editor still works in
      // standalone preview / dev mode.
      return;
    }
    window.parent.postMessage({ source: 'imgsig-editor', ...message }, this.parentOrigin);
  }

  /**
   * Subscribes to a message type. Returns an unsubscribe function.
   */
  on<T extends IncomingMessage['type']>(
    type: T,
    callback: (msg: IncomingMessage) => void,
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
    return () => this.listeners.get(type)?.delete(callback);
  }

  /**
   * Cleans up the global listener — call from React effect cleanup.
   */
  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.listeners.clear();
  }

  private handleMessage = (event: MessageEvent): void => {
    if (event.origin !== this.parentOrigin) return;
    const data = event.data as { source?: string; type?: string } | null;
    if (!data || data.source !== 'imgsig-host' || typeof data.type !== 'string') return;

    const callbacks = this.listeners.get(data.type);
    callbacks?.forEach((cb) => cb(data as IncomingMessage));
  };
}
