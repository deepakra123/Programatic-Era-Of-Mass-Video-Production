
export enum AppState {
  IDLE = 'IDLE',
  SCRIPTING = 'SCRIPTING',
  GENERATING_ASSETS = 'GENERATING_ASSETS',
  PREVIEW = 'PREVIEW',
  EXPORTING = 'EXPORTING',
}


export interface Scene {
  id: number;
  narration: string;
  visualPrompt: string;
  duration: number; // in seconds
  audioUrl?: string; // Blob URL
  visualUrl?: string; // Base64 or Blob URL
  status: 'pending' | 'loading' | 'complete' | 'error';
}

export interface Story {
  title: string;
  scenes: Scene[];
  musicMood: 'dramatic' | 'cheerful' | 'mysterious' | 'energetic';
}

export interface ScriptResponse {
  title: string;
  scenes: {
    narration: string;
    visual_description: string;
  }[];
}

export interface UsageStats {
  scriptsGenerated: number;
  audioGenerated: number;
  imagesGenerated: number;
}
