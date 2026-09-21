import { useState, useRef, useCallback, useEffect } from 'react';

interface UseWebcamReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hiddenCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  isStreaming: boolean;
  error: string | null;
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
  captureFrameBlob: (quality?: number) => Promise<Blob | null>;
  captureFrameBase64: (quality?: number) => string | null;
  dimensions: { width: number; height: number };
}

export function useWebcam(): UseWebcamReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 640, height: 480 });

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    stopCamera();
    setError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Camera API is not supported in this browser environment.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        if (settings.width && settings.height) {
          setDimensions({ width: settings.width, height: settings.height });
        }
      }

      setIsStreaming(true);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not access webcam';
      setError(message);
      setIsStreaming(false);
      return false;
    }
  }, [stopCamera]);

  // Capture frame from video onto offscreen/hidden canvas and export as JPEG Blob
  const captureFrameBlob = useCallback((quality: number = 0.6): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        resolve(null);
        return;
      }

      let canvas = hiddenCanvasRef.current;
      if (!canvas) {
        canvas = document.createElement('canvas');
        hiddenCanvasRef.current = canvas;
      }

      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;

      // Downsample slightly if larger for optimal network transfer
      const targetW = Math.min(w, 640);
      const targetH = Math.round((h / w) * targetW);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(video, 0, 0, targetW, targetH);
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        'image/jpeg',
        quality
      );
    });
  }, []);

  // Alternative: capture as Base64 string
  const captureFrameBase64 = useCallback((quality: number = 0.6): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    let canvas = hiddenCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement('canvas');
      hiddenCanvasRef.current = canvas;
    }

    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const targetW = Math.min(w, 640);
    const targetH = Math.round((h / w) * targetW);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', quality);
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    hiddenCanvasRef,
    isStreaming,
    error,
    startCamera,
    stopCamera,
    captureFrameBlob,
    captureFrameBase64,
    dimensions,
  };
}
