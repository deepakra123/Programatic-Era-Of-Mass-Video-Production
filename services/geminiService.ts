import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ScriptResponse, Scene } from "../types";


// Helper to get client with current key
const getClient = () => {
  // Always create a new instance to ensure we capture the latest key from aistudio
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// --- WAV Header Helpers ---
// Gemini TTS returns raw PCM (24kHz, 1 channel, 16-bit). We need to wrap it in a WAV header for browser compatibility.
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const addWavHeader = (samples: Uint8Array, sampleRate: number = 24000, numChannels: number = 1) => {
  const buffer = new ArrayBuffer(44 + samples.length);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + samples.length, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 is PCM)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, samples.length, true);

  // write the PCM samples
  const pcmBytes = new Uint8Array(buffer, 44);
  pcmBytes.set(samples);

  return buffer;
};

// --- API Functions ---

export const generateStoryScript = async (topic: string, mood: string, sceneCount: number = 4, language: string = 'Kannada', videoTone: string = 'Storytelling'): Promise<ScriptResponse> => {
  const ai = getClient();
  
  const duration = sceneCount * 6; // approx 6 seconds per scene

  const prompt = `
    You are a world-class cinematographer and screenwriter. 
    Write a short, engaging, cinematic story based on the topic: "${topic}".
    The mood is: ${mood}.
    The video tone/style is: ${videoTone} (e.g., Storytelling, Fact telling, Comedy, Viral).
    
    Target Duration: Approximately ${duration} seconds.
    Structure the story into exactly ${sceneCount} distinct scenes.
    
    For each scene, provide:
    1. 'narration': The spoken voiceover text in ${language} language (${language} script). Keep it punchy, emotional, and human.
    2. 'visual_description': A highly detailed, photorealistic AI image prompt describing the scene in English. Include camera angles (Wide shot, Close up, Low angle), lighting (Golden hour, Neon, Cinematic lighting), and action.
    
    Return the response strictly as JSON.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                narration: { type: Type.STRING },
                visual_description: { type: Type.STRING },
              },
              required: ["narration", "visual_description"]
            }
          }
        },
        required: ["title", "scenes"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No script generated");
  return JSON.parse(text) as ScriptResponse;
};

export const generateNarration = async (text: string, voiceName: string = 'Fenrir', retries = 3): Promise<string> => {
  const ai = getClient();
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: {
          parts: [{ text: text }]
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName }
            }
          }
        }
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) throw new Error("No audio generated");

      // Convert base64 to binary
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // WRAP IN WAV HEADER (Critical fix for "Unable to decode audio data")
      const wavBuffer = addWavHeader(bytes);
      const blob = new Blob([wavBuffer], { type: "audio/wav" });
      
      return URL.createObjectURL(blob);
    } catch (error: any) {
      const errMsg = error.message || JSON.stringify(error);
      if ((errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) && attempt < retries - 1) {
        const delay = Math.pow(2, attempt) * 3000; // 3s, 6s
        console.warn(`Gemini TTS rate limited. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (attempt === retries - 1) {
        throw error;
      }
    }
  }
  throw new Error("Failed to generate audio after retries");
};

export const generateCinematicImage = async (prompt: string, modelType: 'pollinations' | 'gemini' = 'pollinations', imageStyle: string = 'Cinematic', retries = 3): Promise<string> => {
  if (modelType === 'gemini') {
    const ai = getClient();
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                text: `${imageStyle} vertical shot 9:16 aspect ratio ${prompt} high detail 8k photorealistic`,
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio: "9:16"
            }
          }
        });
        
        let base64Image = null;
        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            base64Image = part.inlineData.data;
            break;
          }
        }
        
        if (!base64Image) {
           throw new Error("No image data returned from Gemini");
        }
        
        return `data:image/jpeg;base64,${base64Image}`;
      } catch (error: any) {
        const errMsg = error.message || JSON.stringify(error);
        if ((errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) && attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 3000;
          console.warn(`Gemini Image rate limited. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        if (attempt === retries - 1) {
          throw error;
        }
      }
    }
  }

  // Clean prompt and limit length to ensure URL safety and API limits
  const safePrompt = prompt.replace(/[^\w\s,.-]/g, '').slice(0, 800);
  const enhancedPrompt = encodeURIComponent(`${imageStyle} vertical shot 9:16 aspect ratio ${safePrompt} high detail 8k photorealistic`);
  
  // Use 720x1280 (720p Vertical) instead of 1080x1920
  // Higher resolutions often cause timeouts or errors on the free tier
  const width = 720;
  const height = 1280;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const seed = Math.floor(Math.random() * 10000000);
      const url = `https://image.pollinations.ai/prompt/${enhancedPrompt}?width=${width}&height=${height}&model=flux&seed=${seed}&nologo=true`;
      
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 429 && attempt < retries - 1) {
          // Exponential backoff: 2s, 4s, 8s...
          const delay = Math.pow(2, attempt) * 2000;
          console.warn(`Pollinations API rate limited (429). Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Pollinations API Error: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      if (blob.type.startsWith('text/html')) {
          throw new Error("Received HTML instead of image from Pollinations");
      }
      return URL.createObjectURL(blob);
    } catch (error) {
      if (attempt === retries - 1) {
        console.error("Pollinations Image Generation Failed after retries:", error);
        throw error;
      }
      // If it's a network error or other fetch failure, retry
      const delay = Math.pow(2, attempt) * 2000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Failed to generate image after retries");
};
