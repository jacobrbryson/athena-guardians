import { useEffect, useRef, useState } from 'react';
import { UNITY_ASSET_BASE, wsUrl } from '../config';

/**
 * Unity WebGL Athena player — a React port of the marketing app's
 * UnityPlayerComponent. It loads the same Unity build and speaks the same
 * bridge protocol:
 *
 *   - window event 'athena-unity-ready-for-websocket'  -> we hand Unity a WS
 *     config and tell its AthenaSocketBridge to connect. Auth rides on the
 *     httpOnly cookie, so the WS URL carries no token.
 *   - SendMessage('AthenaBridge', 'SetThinking', bool) -> idle/think animation.
 *
 * The large Unity assets are NOT bundled with this app; they are loaded from
 * UNITY_ASSET_BASE (the shared GCS bucket by default).
 */

const u = (p: string) => `${UNITY_ASSET_BASE}/${p}`;

/**
 * Imperative bridge to the Athena avatar, mirroring the marketing app's
 * UnityBridgeService (same GameObject + method names). Handed to the parent via
 * `onReady` once the Unity instance exists.
 */
export interface AthenaBridge {
  playGesture: (gesture: 'Wave' | 'Happy' | 'Yes' | 'No') => void;
  setThinking: (thinking: boolean) => void;
  sendToGameObject: (gameObject: string, method: string, param?: string) => void;
}

interface Props {
  sessionId: string | null;
  isThinking: boolean;
  /** Called once when the Unity avatar is live and the bridge is usable. */
  onReady?: (bridge: AthenaBridge) => void;
}

export function UnityAthena({ sessionId, isThinking, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<UnityInstanceLike | null>(null);
  const sessionRef = useRef<string | null>(sessionId);
  sessionRef.current = sessionId;

  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // --- Unity -> app: connect Unity's own WebSocket once it signals ready. ---
  useEffect(() => {
    const onUnityWsReady = () => {
      const session = sessionRef.current;
      const instance = instanceRef.current;
      if (!session || !instance) return;

      const url = wsUrl(`/ws?sessionId=${encodeURIComponent(session)}`);
      const payload = JSON.stringify({ wsUrl: url, sessionId: session, token: '' });
      instance.SendMessage('AthenaSocketBridge', 'ConfigureWebSocket', payload);
      instance.SendMessage('AthenaSocketBridge', 'ConnectWebSocket');
    };
    window.addEventListener('athena-unity-ready-for-websocket', onUnityWsReady);
    return () =>
      window.removeEventListener('athena-unity-ready-for-websocket', onUnityWsReady);
  }, []);

  // --- Boot Unity (load loader script, then createUnityInstance). ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    const script = document.createElement('script');
    script.src = u('Build/unity.loader.js');
    script.async = true;

    script.onload = () => {
      if (disposed || !window.createUnityInstance) {
        if (!window.createUnityInstance) {
          setError('Unity is unavailable in this browser.');
          setLoading(false);
        }
        return;
      }
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * pixelRatio;
      canvas.height = canvas.clientHeight * pixelRatio;

      window
        .createUnityInstance(
          canvas,
          {
            dataUrl: u('Build/unity.data'),
            frameworkUrl: u('Build/unity.framework.js'),
            codeUrl: u('Build/unity.wasm'),
            streamingAssetsUrl: 'StreamingAssets',
            companyName: 'Orcwood',
            productName: 'Athena',
            productVersion: '0.1.0',
          },
          (p) => setProgress(Math.round(p * 100))
        )
        .then((instance) => {
          if (disposed) return;
          instanceRef.current = instance;
          window.unityInstance = instance;
          setProgress(100);
          setLoading(false);
          setError(null);

          const bridge: AthenaBridge = {
            playGesture: (gesture) =>
              instance.SendMessage('AthenaBridge', 'PlayGesture', gesture),
            setThinking: (thinking) =>
              instance.SendMessage('AthenaBridge', 'SetThinking', String(thinking)),
            sendToGameObject: (gameObject, method, param) =>
              param === undefined
                ? instance.SendMessage(gameObject, method)
                : instance.SendMessage(gameObject, method, param),
          };
          onReadyRef.current?.(bridge);
        })
        .catch((message) => {
          console.error('Unity init failed:', message);
          setError('Unable to summon Athena right now.');
          setLoading(false);
        });
    };

    script.onerror = () => {
      setError('Unable to summon Athena right now.');
      setLoading(false);
    };

    document.body.appendChild(script);

    return () => {
      disposed = true;
      if (window.unityInstance === instanceRef.current) delete window.unityInstance;
      instanceRef.current?.Quit?.().catch(() => undefined);
      instanceRef.current = null;
      script.remove();
    };
  }, []);

  // --- app -> Unity: reflect thinking state in the avatar animation. ---
  useEffect(() => {
    instanceRef.current?.SendMessage('AthenaBridge', 'SetThinking', String(isThinking));
  }, [isThinking]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black/90">
      <canvas
        ref={canvasRef}
        id="unity-canvas"
        className="w-full h-full block"
        tabIndex={1}
      />

      {loading && !error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 text-emerald-200">
          <div className="text-center font-mono">
            <p className="text-xs uppercase tracking-[0.4em] opacity-60 animate-flicker">
              establishing link
            </p>
            <p className="mt-3 text-2xl tracking-widest gd-glitch" data-text="ATHENA">
              ATHENA
            </p>
            <div className="mt-4 h-px w-48 mx-auto bg-emerald-200/20">
              <div className="h-px bg-emerald-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="mt-2 text-xs opacity-60 tabular-nums">{progress}%</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/85 text-red-300 p-6">
          <p className="font-mono text-center text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
