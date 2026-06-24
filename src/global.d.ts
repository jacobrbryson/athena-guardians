/// <reference types="vite/client" />

interface UnityInstanceLike {
  SendMessage: (gameObject: string, methodName: string, parameter?: string) => void;
  Quit?: () => Promise<void>;
}

interface Window {
  unityInstance?: UnityInstanceLike;
  createUnityInstance?: (
    canvas: HTMLCanvasElement,
    config: Record<string, unknown>,
    onProgress: (progress: number) => void
  ) => Promise<UnityInstanceLike>;
}

interface ImportMetaEnv {
  readonly VITE_PROXY_BASE?: string;
  readonly VITE_UNITY_ASSET_BASE?: string;
  readonly VITE_DEV_PROXY_TARGET?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
