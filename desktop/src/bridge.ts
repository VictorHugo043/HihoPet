export type Settings = { muted: boolean; scale: number };
export type PointerSample = { x: number; y: number; localX: number; localY: number; vx: number; vy: number; moved: boolean };
export type MenuAction = { type: 'dance' | 'sleep' } | { type: 'settings'; settings: Settings };
export interface PetBridge {
  ready(): Promise<Settings>;
  hit(opaque: boolean): void;
  prepareDrag(): void;
  startDrag(): void;
  endDrag(): void;
  contextMenu(): void;
  mood(sleeping: boolean): void;
  fatal(): void;
  onPointer(callback: (sample: PointerSample) => void): void;
  onAction(callback: (action: MenuAction) => void): void;
}
declare global { interface Window { hiho: PetBridge } }
