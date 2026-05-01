import { useEffect, useRef, useState } from 'react';
import type { CameraView } from '../api/types.js';

/**
 * Live video popup for a fixed camera. Tries WebRTC first via go2rtc's
 * `/api/ws?src=<id>` SDP exchange — this is the low-latency path. If WebRTC
 * fails to negotiate (no public TURN, browser restriction, etc.) we fall
 * back to HLS which any browser can play over plain `<video>`.
 *
 * The popup is a dumb `<div>` portaled at the page root so the map handles
 * its own DOM untouched. App-level state (which camera is active) lives in
 * MapCanvas.
 */
export interface CameraPopupProps {
  camera: CameraView;
  onClose: () => void;
}

export function CameraPopup({ camera, onClose }: CameraPopupProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [mode, setMode] = useState<'connecting' | 'webrtc' | 'hls' | 'error'>(
    'connecting',
  );
  const [err, setErr] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    async function tryWebrtc(): Promise<void> {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (ev) => {
        if (cancelled) return;
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        video!.srcObject = stream;
        void video!.play().catch(() => {
          /* autoplay policy may block — user can click to play */
        });
        setMode('webrtc');
      };

      const ws = new WebSocket(camera.webrtcUrl);
      ws.binaryType = 'arraybuffer';

      ws.addEventListener('open', async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'webrtc/offer', value: offer.sdp }));
      });
      ws.addEventListener('message', async (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            type: string;
            value: string;
          };
          if (msg.type === 'webrtc/answer') {
            await pc.setRemoteDescription({ type: 'answer', sdp: msg.value });
          } else if (msg.type === 'webrtc/candidate') {
            await pc.addIceCandidate(JSON.parse(msg.value) as RTCIceCandidateInit);
          }
        } catch (e) {
          if (!cancelled) handleFallback(e);
        }
      });
      ws.addEventListener('error', () => handleFallback(new Error('ws error')));
      ws.addEventListener('close', () => {
        // Connection might close after negotiation — only fall back if we
        // never got a track.
        if (!cancelled && mode === 'connecting') handleFallback(new Error('ws closed early'));
      });
    }

    function handleFallback(e: unknown): void {
      if (cancelled) return;
      pcRef.current?.close();
      pcRef.current = null;
      // Best-effort HLS fallback — works in Safari natively, plus Chrome via
      // the browser's MSE auto-detection of `.m3u8` extension.
      try {
        video!.src = camera.hlsUrl;
        void video!.play().catch(() => {
          /* autoplay may block */
        });
        setMode('hls');
      } catch {
        setMode('error');
        setErr(e instanceof Error ? e.message : String(e));
      }
    }

    void tryWebrtc().catch((e) => handleFallback(e));

    return () => {
      cancelled = true;
      pcRef.current?.close();
      pcRef.current = null;
      if (video) {
        video.srcObject = null;
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [camera]);

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        top: 16,
        zIndex: 10,
        width: 480,
        background: 'rgba(11,13,16,0.95)',
        color: '#e6e9ef',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <strong>{camera.name}</strong>
        <span
          style={{
            color: statusColor(camera.status),
            fontSize: 12,
            marginLeft: 8,
          }}
        >
          ● {camera.status}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            border: 'none',
            color: '#e6e9ef',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', borderRadius: 4, background: '#000' }}
      />
      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
        {mode === 'connecting' && 'connecting…'}
        {mode === 'webrtc' && `WebRTC · ${camera.streamId}`}
        {mode === 'hls' && `HLS fallback · ${camera.streamId}`}
        {mode === 'error' && `error: ${err ?? 'unknown'}`}
      </div>
    </div>
  );
}

function statusColor(status: CameraView['status']): string {
  switch (status) {
    case 'online':
      return '#3ddc84';
    case 'degraded':
      return '#ffb020';
    case 'offline':
      return '#ff4d4d';
    default:
      return '#999999';
  }
}
