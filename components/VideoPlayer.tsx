import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Scene, AppState } from '../types';
import { Play, Pause, Download, RefreshCw, Loader2 } from 'lucide-react';


interface VideoPlayerProps {
  scenes: Scene[];
  appState: AppState;
  musicMood: string;
  onReset: () => void;
}

const VIDEO_WIDTH = 1080 / 2; // Scaled down for preview, exported at full res logic
const VIDEO_HEIGHT = 1920 / 2;

// Background music placeholder URLs (Royalty Free / CC0 for demo)
const MUSIC_URLS: Record<string, string> = {
  dramatic: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_5b66415712.mp3', // Epic Cinematic
  cheerful: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_547161833d.mp3', // Happy Day
  mysterious: 'https://cdn.pixabay.com/download/audio/2022/02/07/audio_6512133497.mp3', // Investigation
  energetic: 'https://cdn.pixabay.com/download/audio/2023/06/13/audio_496c8104e1.mp3'  // Action
};

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ scenes, appState, musicMood, onReset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Audio Context Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const bgMusicNodeRef = useRef<HTMLAudioElement | null>(null);
  const narrationNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Animation Refs
  const reqIdRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const sceneImagesRef = useRef<Record<number, HTMLImageElement>>({});
  const sceneAudioBuffersRef = useRef<Record<number, AudioBuffer>>({});

  // Preload Assets
  useEffect(() => {
    if (appState !== AppState.PREVIEW) return;

    const loadAssets = async () => {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;

      // Load Images and Audio
      const images: Record<number, HTMLImageElement> = {};
      const buffers: Record<number, AudioBuffer> = {};
      let totalTime = 0;

      for (const scene of scenes) {
        // Image
        if (scene.visualUrl) {
          try {
            const img = new Image();
            img.crossOrigin = "anonymous"; // Safety for cross-origin if needed
            img.src = scene.visualUrl;
            await new Promise((r, j) => {
                img.onload = r;
                img.onerror = j;
            }).catch(e => console.warn(`Failed to load image for scene ${scene.id}`, e));
            images[scene.id] = img;
          } catch (e) {
             console.error("Image load error", e);
          }
        }

        // Audio
        let sceneDur = 5; // Default fallback
        if (scene.audioUrl) {
          try {
            const resp = await fetch(scene.audioUrl);
            const arrayBuffer = await resp.arrayBuffer();
            // Wrap in try-catch as decoding is strict
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            buffers[scene.id] = audioBuffer;
            sceneDur = audioBuffer.duration + 0.5; // add tiny padding
          } catch (e) {
            console.error(`Failed to decode audio for scene ${scene.id}.`, e);
            // Fallback: Estimate based on word count (rough approx)
            sceneDur = Math.max(3, scene.narration.split(' ').length * 0.4);
          }
        } else {
             sceneDur = Math.max(3, scene.narration.split(' ').length * 0.4);
        }
        
        scene.duration = sceneDur;
        totalTime += sceneDur;
      }

      sceneImagesRef.current = images;
      sceneAudioBuffersRef.current = buffers;
      setTotalDuration(totalTime);
    };

    loadAssets();

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [scenes, appState]);

  // Render Loop
  const renderFrame = useCallback((timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = (timestamp - startTimeRef.current) / 1000; // in seconds
    
    // Looping logic or stopping
    if (elapsed >= totalDuration) {
      if (isExporting) {
        // Let the export logic handle stop
      } else {
        setIsPlaying(false);
        setCurrentTime(totalDuration);
        stopAudio();
      }
      return; 
    }

    setCurrentTime(elapsed);

    // Find current scene
    let accumulatedTime = 0;
    let currentScene = scenes[0];
    let sceneStartTime = 0;

    for (const scene of scenes) {
      if (elapsed < accumulatedTime + scene.duration) {
        currentScene = scene;
        sceneStartTime = accumulatedTime;
        break;
      }
      accumulatedTime += scene.duration;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    
    // Use the loaded image or fallback
    const img = sceneImagesRef.current[currentScene.id];

    if (canvas && ctx) {
      // Clear
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (img) {
        // Ken Burns Effect logic
        const sceneProgress = (elapsed - sceneStartTime) / currentScene.duration;
        const scale = 1 + (sceneProgress * 0.15); // Zoom in 15%
        
        // Calculate center position
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        
        // Slight pan based on scene ID (odd/even)
        const panX = (currentScene.id % 2 === 0 ? 1 : -1) * (sceneProgress * 50);
        ctx.translate(-centerX + panX, -centerY);

        // Draw image cover
        const imgRatio = img.width / img.height;
        const canvasRatio = canvas.width / canvas.height;
        let renderW, renderH;

        if (imgRatio > canvasRatio) {
            renderH = canvas.height;
            renderW = img.width * (canvas.height / img.height);
        } else {
            renderW = canvas.width;
            renderH = img.height * (canvas.width / img.width);
        }

        const drawX = (canvas.width - renderW) / 2;
        const drawY = (canvas.height - renderH) / 2;

        ctx.drawImage(img, drawX, drawY, renderW, renderH);
        ctx.restore();
      } else {
        // No Image Placeholder
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#52525b';
        ctx.font = '20px Inter';
        ctx.textAlign = 'center';
        ctx.fillText("Visual Generating or Failed", canvas.width / 2, canvas.height / 2);
      }

      // Draw Subtitles
      // IMPORTANT: Use Noto Sans Kannada for correct rendering
      ctx.font = 'bold 24px "Noto Sans Kannada", Inter, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.textAlign = 'center';
      
      const maxWidth = canvas.width * 0.8;
      const words = currentScene.narration.split(' ');
      let line = '';
      let y = canvas.height - 150;
      
      ctx.fillStyle = 'white';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 4;
      
      for(let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          ctx.fillText(line, canvas.width/2, y);
          line = words[n] + ' ';
          y += 35;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, canvas.width/2, y);
      ctx.shadowBlur = 0;
    }

    if (isPlaying || isExporting) {
        reqIdRef.current = requestAnimationFrame(renderFrame);
    }
  }, [scenes, totalDuration, isPlaying, isExporting]);

  useEffect(() => {
    if (isPlaying && !isExporting) {
       playAudioSequence(currentTime);
       reqIdRef.current = requestAnimationFrame(renderFrame);
    } else if (!isPlaying && !isExporting) {
       cancelAnimationFrame(reqIdRef.current);
       stopAudio();
    }
  }, [isPlaying, renderFrame]);


  const playAudioSequence = async (startOffset: number) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    
    // Stop previous
    stopAudio();

    // 1. Play Background Music
    const musicUrl = MUSIC_URLS[musicMood] || MUSIC_URLS['dramatic'];
    const bgAudio = new Audio(musicUrl);
    bgAudio.loop = true;
    bgAudio.volume = 0.3;
    bgAudio.currentTime = startOffset % 100; // rough seek
    bgAudio.play().catch(e => console.log("Auto-play prevented", e));
    bgMusicNodeRef.current = bgAudio;

    // 2. Schedule Voiceovers
    // We need to figure out which scene we are in and schedule remaining scenes
    let accumulatedTime = 0;
    scenes.forEach((scene) => {
        const buffer = sceneAudioBuffersRef.current[scene.id];
        if (buffer) {
            const playTime = ctx.currentTime + (accumulatedTime - startOffset);
            
            // Only schedule if it's in the future or currently playing
            if (accumulatedTime + scene.duration > startOffset) {
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                
                // If we are mid-scene, we need to offset the start
                let offset = 0;
                let actualStartTime = playTime;

                if (accumulatedTime < startOffset) {
                    offset = startOffset - accumulatedTime;
                    actualStartTime = ctx.currentTime;
                }

                source.start(actualStartTime, offset);
                // Track current playing node (imperfect for multiple, but good enough for stop)
                narrationNodeRef.current = source;
            }
        }
        accumulatedTime += scene.duration;
    });
  };

  const stopAudio = () => {
    if (bgMusicNodeRef.current) {
        bgMusicNodeRef.current.pause();
        bgMusicNodeRef.current = null;
    }
    if (narrationNodeRef.current) {
        try { narrationNodeRef.current.stop(); } catch(e) {}
        narrationNodeRef.current = null;
    }
  };

  const handleExport = async () => {
    if (!canvasRef.current || !audioContextRef.current) return;
    setIsExporting(true);
    setIsPlaying(true);
    setCurrentTime(0);
    startTimeRef.current = 0; // Reset for render loop logic

    const stream = canvasRef.current.captureStream(30); // 30 FPS
    const audioCtx = audioContextRef.current;
    const dest = audioCtx.createMediaStreamDestination();
    destNodeRef.current = dest;

    // Setup Mix for recording
    // 1. Voice Mix
    let accumulatedTime = 0;
    const sources: AudioBufferSourceNode[] = [];
    
    scenes.forEach((scene) => {
        const buffer = sceneAudioBuffersRef.current[scene.id];
        if (buffer) {
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(dest); // Connect to recorder destination
            source.connect(audioCtx.destination); // Also connect to speakers to hear it
            source.start(audioCtx.currentTime + accumulatedTime);
            sources.push(source);
        }
        accumulatedTime += scene.duration;
    });

    // 2. BG Music Mix
    try {
        const musicUrl = MUSIC_URLS[musicMood] || MUSIC_URLS['dramatic'];
        const bgResp = await fetch(musicUrl);
        const bgArr = await bgResp.arrayBuffer();
        const bgBuff = await audioCtx.decodeAudioData(bgArr);
        
        const bgSource = audioCtx.createBufferSource();
        bgSource.buffer = bgBuff;
        bgSource.loop = true;
        const bgGain = audioCtx.createGain();
        bgGain.gain.value = 0.3;
        bgSource.connect(bgGain);
        bgGain.connect(dest);
        bgGain.connect(audioCtx.destination);
        bgSource.start(audioCtx.currentTime);
    } catch (e) {
        console.warn("Background music failed to load for export", e);
    }

    // Add audio track to canvas stream
    if (dest.stream.getAudioTracks().length > 0) {
        stream.addTrack(dest.stream.getAudioTracks()[0]);
    }

    // DETERMINE FORMAT: Prefer MP4, fallback to WebM
    let mimeType = 'video/webm';
    let fileExtension = 'webm';

    if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeType = 'video/mp4';
      fileExtension = 'mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264')) {
       // Chrome/Edge often support this
       mimeType = 'video/webm;codecs=h264';
       fileExtension = 'mp4'; // HACK: Some players treat H264 inside WebM container as MP4 if renamed, or just keep webm.
    }

    console.log(`Exporting using MIME: ${mimeType}`);

    const recorder = new MediaRecorder(stream, { mimeType });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CineGen_${Date.now()}.${fileExtension}`;
        a.click();
        
        // Cleanup
        setIsExporting(false);
        setIsPlaying(false);
        sources.forEach(s => { try { s.stop(); } catch(e){} });
    };

    recorder.start();
    
    // Start Rendering loop
    startTimeRef.current = performance.now();
    reqIdRef.current = requestAnimationFrame(function exportLoop(timestamp) {
         // Custom render loop just for export to ensure we don't depend on React state updates for 'currentTime'
         // We simulate the time
         const exportElapsed = (timestamp - startTimeRef.current) / 1000;
         
         // Update visual state (reuse render logic logic partially or duplicate for safety)
         renderFrame(timestamp);

         if (exportElapsed < totalDuration) {
             reqIdRef.current = requestAnimationFrame(exportLoop);
         } else {
             recorder.stop();
         }
    });
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto bg-zinc-900 rounded-xl overflow-hidden shadow-2xl border border-zinc-800">
      <div className="relative w-full aspect-[9/16] bg-black">
        <canvas
          ref={canvasRef}
          width={540} // Internal resolution (rendering 1080p in canvas is heavy for preview, usually scale down)
          height={960}
          className="w-full h-full object-cover"
        />
        
        {/* Overlays */}
        {!isPlaying && !isExporting && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10">
                <button 
                    onClick={() => { startTimeRef.current = 0; setIsPlaying(true); }}
                    className="p-6 rounded-full bg-white/10 hover:bg-white/20 transition-all backdrop-blur-md border border-white/30 group"
                >
                    <Play className="w-12 h-12 text-white fill-current group-hover:scale-110 transition-transform" />
                </button>
            </div>
        )}
        
        {isExporting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <p className="text-white font-medium">Rendering Video...</p>
                <p className="text-zinc-400 text-sm">Please wait, do not close tab.</p>
            </div>
        )}
      </div>

      <div className="w-full p-4 bg-zinc-900 border-t border-zinc-800">
        <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500 font-mono">
                {Math.floor(currentTime)}s / {Math.floor(totalDuration)}s
            </span>
            <div className="flex gap-2">
                 <button
                    disabled={isExporting} 
                    onClick={onReset}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                >
                    <RefreshCw className="w-3 h-3" />
                    New Story
                </button>
                <button 
                    onClick={handleExport}
                    disabled={isExporting}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-all"
                >
                    {isExporting ? 'Exporting...' : 'Export Video'}
                    {!isExporting && <Download className="w-4 h-4" />}
                </button>
            </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div 
                className="h-full bg-indigo-500 transition-all duration-100 ease-linear"
                style={{ width: `${(currentTime / (totalDuration || 1)) * 100}%` }}
            />
        </div>
      </div>
    </div>
  );
};
