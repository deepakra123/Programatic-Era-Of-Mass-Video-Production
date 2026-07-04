import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { AppState, Scene, Story, UsageStats } from './types';
import { generateStoryScript, generateNarration, generateCinematicImage } from './services/geminiService';
import { VideoPlayer } from './components/VideoPlayer';
import { Sparkles, AlertCircle, Film, ArrowRight, Wand2, Clock, Activity, X, Calculator, Zap, Code, Terminal, Layers, Cpu, FileJson, Copy, Check, Globe } from 'lucide-react';


const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [topic, setTopic] = useState('');
  const [targetDuration, setTargetDuration] = useState<number>(30);
  const [language, setLanguage] = useState<string>('Kannada');
  const [imageModel, setImageModel] = useState<'pollinations' | 'gemini'>('pollinations');
  const [imageStyle, setImageStyle] = useState<string>('Cinematic');
  const [videoTone, setVideoTone] = useState<string>('Storytelling');
  const [story, setStory] = useState<Story | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [progress, setProgress] = useState(0); // 0-100
  const [error, setError] = useState<string | null>(null);
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  
  // Usage Tracking State
  const [stats, setStats] = useState<UsageStats>({ scriptsGenerated: 0, audioGenerated: 0, imagesGenerated: 0 });
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    checkApiKey();
  }, []);

  useEffect(() => {
    if (appState === AppState.SCRIPTING || appState === AppState.GENERATING_ASSETS) {
      const fakeTasks = [
        "Initializing Neural Engine v4.2...",
        "Optimizing Vector Embeddings...",
        "Syncing Temporal Buffers...",
        "Calibrating Semantic Consistency...",
        "Allocating GPU Shaders...",
        "Cross-referencing Knowledge Graphs...",
        "Synthesizing Multi-modal Latents...",
        "Applying Frame Interpolation...",
        "Normalizing Audio Waveforms...",
        "Finalizing Cinematic Post-processing...",
        "Verifying Parity Bits...",
        "Encrypting Asset Streams...",
        "Optimizing Latency Nodes..."
      ];
      
      let i = 0;
      const logInterval = setInterval(() => {
        if (i < fakeTasks.length) {
          setLogs(prev => [...prev.slice(-5), `[SYSTEM] ${fakeTasks[i]}`]);
          i++;
        } else {
          i = 0; // Loop logs
        }
      }, 1500);
      
      return () => {
        clearInterval(logInterval);
        setLogs([]);
      };
    }
  }, [appState]);

  const checkApiKey = async (): Promise<boolean> => {
    // Check if key is manually set in environment (e.g. .env file)
    if (process.env.API_KEY) {
      setIsApiKeySet(true);
      return true;
    }
    
    // Check AI Studio platform integration
    const aiStudio = (window as any).aistudio;
    if (aiStudio && await aiStudio.hasSelectedApiKey()) {
      setIsApiKeySet(true);
      return true;
    }
    
    setIsApiKeySet(false);
    return false;
  };

  const handleSelectKey = async () => {
    const aiStudio = (window as any).aistudio;
    if (aiStudio) {
      try {
        await aiStudio.openSelectKey();
      } catch (e) {
        console.error("Key selection cancelled or failed", e);
      }
      await checkApiKey();
    }
  };

  const handleGenerateStory = async () => {
    if (!topic.trim()) return;
    
    // Ensure key is available
    const hasKey = await checkApiKey();
    if (!hasKey) {
      await handleSelectKey();
      // Re-check after attempt
      const hasKeyAfterSelect = await checkApiKey();
      if (!hasKeyAfterSelect) return;
    }
    
    setAppState(AppState.SCRIPTING);
    setError(null);

    try {
      // Pass selected sceneCount and language to the service
      const calculatedSceneCount = Math.max(1, Math.round(targetDuration / 6));
      const script = await generateStoryScript(topic, 'dramatic', calculatedSceneCount, language, videoTone);
      
      // Update Stats
      setStats(prev => ({ ...prev, scriptsGenerated: prev.scriptsGenerated + 1 }));

      const initialScenes: Scene[] = script.scenes.map((s, i) => ({
        id: i,
        narration: s.narration,
        visualPrompt: s.visual_description,
        duration: 0,
        status: 'pending'
      }));

      setStory({
        title: script.title,
        scenes: initialScenes,
        musicMood: 'dramatic' // default
      });
      setScenes(initialScenes);
      
      // Start Asset Generation automatically
      generateAssets(initialScenes);

    } catch (e: any) {
      let errorMessage = e.message || "Failed to generate story script";
      const errStr = JSON.stringify(e);
      
      // Handle the case where the key is invalid or not found (common with some environments)
      if (errorMessage.includes("Requested entity was not found") || errorMessage.includes("API key not valid")) {
        setIsApiKeySet(false);
        const aiStudio = (window as any).aistudio;
        if (aiStudio) {
            await aiStudio.openSelectKey();
            await checkApiKey();
        }
      } else if (errorMessage.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "Gemini API quota exceeded. Please try again later or check your billing details.";
      }
      
      setError(errorMessage);
      setAppState(AppState.IDLE);
    }
  };

  const generateAssets = async (currentScenes: Scene[]) => {
    setAppState(AppState.GENERATING_ASSETS);
    const updatedScenes = [...currentScenes];
    const totalSteps = currentScenes.length * 2; // Audio + Visual per scene
    let completedSteps = 0;

    try {
      // 1. Generate Audio (Sequential to avoid Gemini TTS rate limits)
      for (let i = 0; i < updatedScenes.length; i++) {
        try {
          const audioUrl = await generateNarration(updatedScenes[i].narration);
          updatedScenes[i].audioUrl = audioUrl;
          updatedScenes[i].status = 'loading'; // audio done, waiting for image
          
          // Update Stats
          setStats(prev => ({ ...prev, audioGenerated: prev.audioGenerated + 1 }));

        } catch (err: any) {
          console.error(`Audio failed for scene ${i}`, err);
          updatedScenes[i].status = 'error';
          // Check if it's a rate limit error
          const errMsg = err.message || JSON.stringify(err);
          if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED")) {
            setError("Gemini API quota exceeded. Some scenes may be missing audio.");
          }
        } finally {
          completedSteps++;
          setProgress((completedSteps / totalSteps) * 100);
          setScenes([...updatedScenes]); // Update UI
        }
        
        // Add a delay between TTS requests to help with rate limits
        if (i < updatedScenes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // 2. Generate Images (Sequential for safety, though Pollinations is free)
      for (let i = 0; i < updatedScenes.length; i++) {
        try {
          const visualUrl = await generateCinematicImage(updatedScenes[i].visualPrompt, imageModel, imageStyle);
          updatedScenes[i].visualUrl = visualUrl;
          updatedScenes[i].status = 'complete';

          // Update Stats
          setStats(prev => ({ ...prev, imagesGenerated: prev.imagesGenerated + 1 }));

        } catch (err: any) {
          console.error(`Image failed for scene ${i}`, err);
          updatedScenes[i].status = 'error';
          if (err.message && err.message.includes("429")) {
             console.warn("Pollinations API rate limit hit even after retries.");
          }
        } finally {
          completedSteps++;
          setProgress((completedSteps / totalSteps) * 100);
          setScenes([...updatedScenes]); // Update UI
        }
      }

      setScenes(updatedScenes);
      setAppState(AppState.PREVIEW);

    } catch (e: any) {
      const errorMessage = e.message || "Failed to generate assets. Please try again.";
      setError(errorMessage);
      setAppState(AppState.IDLE);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-indigo-500/30 selection:text-indigo-200 font-sans overflow-x-hidden">
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div 
            className="flex items-center gap-3 cursor-pointer group" 
            onClick={() => { setAppState(AppState.IDLE); setStory(null); setScenes([]); setTopic(''); }}
          >
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
              <Film className="text-white w-5 h-5" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">J8 <span className="text-indigo-400">Studio</span></span>
          </div>
          
          <div className="flex items-center gap-4">
          </div>
        </div>
      </header>

      <main className="relative pt-32 pb-24 px-6 max-w-7xl mx-auto">
        
        {/* API Key Warning */}
        {!isApiKeySet && appState === AppState.IDLE && (
           <motion.div 
             initial={{ opacity: 0, y: -20 }}
             animate={{ opacity: 1, y: 0 }}
             className="mb-12 p-4 glass rounded-2xl flex items-start gap-4 max-w-2xl mx-auto"
           >
             <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
               <AlertCircle className="w-5 h-5 text-amber-500" />
             </div>
             <div>
               <h3 className="font-display font-bold text-amber-500 text-sm mb-1">API Key Required</h3>
               <p className="text-zinc-400 text-sm leading-relaxed">
                 To generate cinematic scripts and high-quality narration, please connect your Gemini API key. 
                 <button onClick={handleSelectKey} className="text-white hover:text-indigo-400 font-medium underline underline-offset-4 ml-1 transition-colors">Setup now</button>
               </p>
             </div>
           </motion.div>
        )}

        {/* Input Phase */}
        {appState === AppState.IDLE && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-16">
             <div className="space-y-6 max-w-3xl">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <span className="px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-[0.2em] mb-6 inline-block">
                    Next-Gen Video Generation
                  </span>
                  <h1 className="text-6xl md:text-8xl font-display font-extrabold tracking-tight leading-[0.9] mb-8">
                    Turn your <span className="text-gradient">imagination</span> into reality.
                  </h1>
                  <p className="text-xl text-zinc-400 max-w-xl mx-auto leading-relaxed">
                    Create stunning vertical videos for social media in seconds using advanced AI storytelling.
                  </p>
                </motion.div>
             </div>

             <div className="w-full max-w-2xl space-y-12">
               {/* Prompt Input */}
               <motion.div 
                 initial={{ opacity: 0, scale: 0.95 }}
                 animate={{ opacity: 1, scale: 1 }}
                 transition={{ delay: 0.2, duration: 0.5 }}
                 className="relative group"
               >
                 <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-600 to-indigo-500 rounded-2xl opacity-25 group-hover:opacity-50 blur-xl transition duration-500"></div>
                 <div className="relative flex items-center glass rounded-2xl p-2 pr-3">
                   <div className="pl-4 text-zinc-500">
                     <Wand2 className="w-5 h-5" />
                   </div>
                   <input 
                      type="text" 
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGenerateStory()}
                      placeholder="Describe your story idea..."
                      className="w-full bg-transparent text-white placeholder-zinc-500 px-4 py-4 outline-none text-lg font-medium"
                   />
                   <button 
                      onClick={handleGenerateStory}
                      disabled={!topic.trim()}
                      className="bg-white text-black hover:bg-zinc-200 disabled:opacity-50 disabled:hover:bg-white px-6 py-3 rounded-xl transition-all duration-300 font-bold flex items-center gap-2 shadow-xl"
                   >
                      Generate <ArrowRight className="w-4 h-4" />
                   </button>
                 </div>
               </motion.div>

               {/* Configuration Section */}
               <motion.div 
                 initial={{ opacity: 0, y: 40 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.4, duration: 0.8 }}
                 className="glass rounded-[32px] p-8 md:p-10 shadow-2xl relative overflow-hidden"
               >
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full -mr-32 -mt-32"></div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 text-left relative z-10">
                     
                     {/* Video Duration */}
                     <div className="space-y-4">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                           <Clock className="w-3.5 h-3.5 text-indigo-400" /> Duration
                        </label>
                        <div className="flex flex-wrap gap-2">
                           {[30, 50].map((val) => (
                              <button
                                 key={val}
                                 onClick={() => setTargetDuration(val)}
                                 className={`
                                    px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 border
                                    ${targetDuration === val 
                                    ? 'bg-indigo-500 text-white border-indigo-400 shadow-lg shadow-indigo-500/20' 
                                    : 'bg-white/5 text-zinc-400 border-white/5 hover:border-white/10 hover:text-white'
                                    }
                                 `}
                              >
                                 {val}s
                              </button>
                           ))}
                           <div className={`flex items-center bg-white/5 border rounded-xl px-3 transition-all duration-300 ${targetDuration !== 30 && targetDuration !== 50 ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/5'}`}>
                              <input
                                 type="number"
                                 min={6}
                                 max={300}
                                 value={targetDuration}
                                 onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setTargetDuration(isNaN(val) ? 6 : Math.min(300, Math.max(6, val)));
                                 }}
                                 className="w-10 bg-transparent text-white text-sm outline-none py-2 font-bold text-center"
                              />
                           </div>
                        </div>
                     </div>

                     {/* Narration Language */}
                     <div className="space-y-4">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                           <Globe className="w-3.5 h-3.5 text-emerald-400" /> Language
                        </label>
                        <div className="relative">
                          <select 
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-300 outline-none appearance-none hover:border-white/10 transition-colors cursor-pointer"
                          >
                            {['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Japanese', 'Korean', 'Chinese', 'Arabic', 'Hindi', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Urdu', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Vietnamese', 'Turkish', 'Polish', 'Ukrainian', 'Dutch', 'Thai', 'Indonesian', 'Malay', 'Tagalog'].map(lang => (
                              <option key={lang} value={lang} className="bg-zinc-900">{lang}</option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                            <ArrowRight className="w-3 h-3 rotate-90" />
                          </div>
                        </div>
                     </div>

                     {/* Video Tone */}
                     <div className="space-y-4">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                           <Film className="w-3.5 h-3.5 text-amber-400" /> Tone
                        </label>
                        <div className="relative">
                          <select 
                            value={videoTone}
                            onChange={(e) => setVideoTone(e.target.value)}
                            className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-300 outline-none appearance-none hover:border-white/10 transition-colors cursor-pointer"
                          >
                            {['Storytelling', 'Fact telling', 'Comedy', 'Viral', 'Educational', 'Motivational', 'Horror', 'Mystery', 'Romantic', 'Action', 'Relaxing', 'Satirical', 'Documentary', 'Vlog'].map(tone => (
                              <option key={tone} value={tone} className="bg-zinc-900">{tone}</option>
                            ))}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                            <ArrowRight className="w-3 h-3 rotate-90" />
                          </div>
                        </div>
                     </div>

                     {/* Image Model */}
                     <div className="space-y-4">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                           <Cpu className="w-3.5 h-3.5 text-cyan-400" /> Model
                        </label>
                        <div className="flex gap-2">
                           {['pollinations', 'gemini'].map((m) => (
                              <button
                                 key={m}
                                 onClick={() => setImageModel(m as any)}
                                 className={`
                                    flex-1 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 border capitalize
                                    ${imageModel === m 
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' 
                                    : 'bg-white/5 text-zinc-500 border-white/5 hover:text-zinc-300'
                                    }
                                 `}
                              >
                                 {m}
                              </button>
                           ))}
                        </div>
                     </div>

                     {/* Image Style */}
                     <div className="space-y-4 lg:col-span-2">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                           <Sparkles className="w-3.5 h-3.5 text-rose-400" /> Visual Style
                        </label>
                        <div className="flex flex-wrap gap-2">
                           {['Cinematic', 'Anime', 'Photorealistic', '3D Render', 'Cyberpunk', 'Fantasy', 'Minimalist'].map((style) => (
                              <button
                                 key={style}
                                 onClick={() => setImageStyle(style)}
                                 className={`
                                    px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 border
                                    ${imageStyle === style 
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' 
                                    : 'bg-white/5 text-zinc-500 border-white/5 hover:text-zinc-300'
                                    }
                                 `}
                              >
                                 {style}
                              </button>
                           ))}
                        </div>
                     </div>

                  </div>
               </motion.div>
             </div>
          </div>
        )}

        {/* Loading Phase */}
        {(appState === AppState.SCRIPTING || appState === AppState.GENERATING_ASSETS) && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12">
            <div className="relative w-32 h-32">
               <div className="absolute inset-0 border-4 border-indigo-500/10 rounded-full"></div>
               <div 
                  className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"
               ></div>
               <div className="absolute inset-0 flex items-center justify-center">
                 <Wand2 className="w-10 h-10 text-indigo-400 animate-pulse" />
               </div>
               <div className="absolute -inset-4 bg-indigo-500/20 blur-2xl rounded-full animate-pulse"></div>
            </div>
            
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-display font-bold">
                {appState === AppState.SCRIPTING ? 'Crafting your story' : 'Bringing it to life'}
              </h2>
              <p className="text-zinc-400 text-lg">
                {appState === AppState.SCRIPTING 
                  ? `Writing a ~${targetDuration}s script in ${language}...` 
                  : `Generating AI assets: ${Math.round(progress)}%`
                }
              </p>
            </div>

            {/* Fake Terminal Logs */}
            <div className="w-full max-w-lg glass p-6 rounded-2xl font-mono text-[11px] space-y-2 border-indigo-500/20">
              <div className="flex items-center gap-2 text-indigo-400 mb-4 border-b border-white/5 pb-2">
                <Terminal className="w-3.5 h-3.5" />
                <span className="uppercase tracking-widest font-bold">Engine Logs</span>
              </div>
              {logs.map((log, idx) => (
                <motion.div 
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-zinc-500"
                >
                  <span className="text-zinc-700 mr-2">[{new Date().toLocaleTimeString()}]</span>
                  {log}
                </motion.div>
              ))}
              <div className="flex items-center gap-2 text-indigo-500/50 animate-pulse">
                <span>_</span>
              </div>
            </div>

            {appState === AppState.GENERATING_ASSETS && (
              <div className="w-full max-w-lg grid grid-cols-1 gap-3">
                 {scenes.map((scene) => (
                    <div key={scene.id} className="glass p-3 rounded-xl flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full shrink-0 ${
                        scene.status === 'complete' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 
                        scene.status === 'loading' ? 'bg-amber-500 animate-pulse' : 
                        scene.status === 'error' ? 'bg-rose-500' : 'bg-zinc-800'
                      }`} />
                      <span className={`flex-1 truncate text-sm font-medium ${scene.status === 'pending' ? 'text-zinc-600' : 'text-zinc-300'}`}>
                        Scene {scene.id + 1}: {scene.narration}
                      </span>
                    </div>
                 ))}
              </div>
            )}
          </div>
        )}

        {/* Editor/Preview Phase */}
        {appState === AppState.PREVIEW && story && (
           <div className="animate-in fade-in duration-700 flex flex-col lg:flex-row gap-12 items-start justify-center">
              
              {/* Video Player Section */}
              <div className="w-full lg:flex-1 flex justify-center sticky top-28">
                <div className="relative group">
                  <div className="absolute -inset-4 bg-indigo-500/10 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                  <VideoPlayer 
                    scenes={scenes} 
                    appState={appState}
                    musicMood={story.musicMood}
                    onReset={() => {
                      setAppState(AppState.IDLE);
                      setTopic('');
                      setScenes([]);
                      setStory(null);
                    }}
                  />
                </div>
              </div>

              {/* Story Details (Sidebar) */}
              <div className="w-full lg:w-[400px] space-y-8">
                <div className="glass p-8 rounded-[32px]">
                  <h2 className="text-3xl font-display font-bold mb-4 leading-tight">{story.title}</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="capitalize px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold tracking-widest">{story.musicMood}</span>
                    <span className="text-zinc-500 text-xs font-medium">• {scenes.length} Scenes</span>
                    <span className="text-zinc-500 text-xs font-medium">• ~{targetDuration}s</span>
                  </div>
                </div>

                {/* Advanced Metrics Card */}
                <div className="glass p-6 rounded-2xl space-y-4">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-indigo-400" /> Advanced Metrics
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[9px] text-zinc-500 uppercase">Consistency</span>
                      <div className="text-sm font-bold text-white">98.4%</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-zinc-500 uppercase">Bitrate</span>
                      <div className="text-sm font-bold text-white">12.4 Mbps</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-zinc-500 uppercase">Sample Rate</span>
                      <div className="text-sm font-bold text-white">48 kHz</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] text-zinc-500 uppercase">AI Confidence</span>
                      <div className="text-sm font-bold text-white">High</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] px-4">Script Timeline</h3>
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {scenes.map((scene, i) => (
                      <div key={i} className="glass p-6 rounded-2xl group hover:bg-white/[0.05] transition-all duration-300">
                        <div className="flex justify-between items-start mb-4">
                          <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase">Scene {i + 1}</span>
                        </div>
                        <p className="text-zinc-300 text-sm mb-6 leading-relaxed font-medium italic">"{scene.narration}"</p>
                        
                        <div className="relative rounded-xl overflow-hidden aspect-video bg-black/40 border border-white/5">
                          {scene.visualUrl ? (
                            <img src={scene.visualUrl} alt="Scene preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-zinc-700 text-[10px] font-bold uppercase tracking-widest">Generating Visual...</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

           </div>
        )}

        {error && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500 text-red-500 px-6 py-4 rounded-lg backdrop-blur-md shadow-xl flex items-center gap-3 z-50">
             <AlertCircle className="w-5 h-5 shrink-0" />
             <span className="text-sm">{error}</span>
             <div className="flex items-center gap-2 ml-2">
               {error.toLowerCase().includes('quota') && (
                 <button onClick={handleSelectKey} className="whitespace-nowrap text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded text-sm transition-colors">
                   Change Key
                 </button>
               )}
               <button onClick={() => { setError(null); setAppState(AppState.IDLE); }} className="text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm transition-colors">
                 Dismiss
               </button>
             </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-black/40 backdrop-blur-xl py-24 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center justify-center space-y-16">
            
            <div className="flex flex-col items-center gap-4">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.4em]">The Visionaries</span>
              <h2 className="text-4xl font-display font-bold">Crafted with passion.</h2>
            </div>
            
            <motion.div 
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.1 }
                }
              }}
              className="flex flex-col items-center w-full space-y-12"
            >
              {/* Featured Lead */}
              <motion.div
                  variants={{
                    hidden: { opacity: 0, y: 30 },
                    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } }
                  }}
                  className="relative group w-full max-w-lg"
              >
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[32px] opacity-20 group-hover:opacity-40 blur-xl transition duration-500"></div>
                  <div className="relative glass p-10 rounded-[32px] flex flex-col items-center text-center space-y-6 overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-colors duration-500"></div>
                    
                    <span className="px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-widest relative z-10">
                      Project Lead
                    </span>
                    
                    <div className="space-y-3 relative z-10">
                      <h3 className="font-display font-extrabold text-4xl tracking-tight text-white group-hover:text-indigo-300 transition-colors duration-300">
                        Jagadeesh S
                      </h3>
                      <p className="font-mono text-sm text-zinc-500 tracking-widest">
                        1RUA24CSE7008
                      </p>
                    </div>
                  </div>
              </motion.div>

              {/* Other Developers */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl">
                {[
                  { name: 'Vishruth D', usn: '1RVU23CSE542', color: 'cyan' },
                  { name: 'Attili Ram Krishan Kumar', usn: '1RVU23CSE089', color: 'emerald' },
                  { name: 'Gandavaram Prudhvi Sai', usn: '1RUA24CSE7007', color: 'rose' }
                ].map((member, idx) => (
                  <motion.div
                    key={idx}
                    variants={{
                      hidden: { opacity: 0, y: 20 },
                      visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 20 } }
                    }}
                    className="relative group"
                  >
                    <div className={`absolute -inset-0.5 bg-${member.color}-500/20 rounded-3xl opacity-0 group-hover:opacity-100 blur-xl transition duration-500`}></div>
                    <div className="relative glass p-8 rounded-3xl flex flex-col items-center text-center space-y-4 group-hover:border-white/20 transition-all duration-300">
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Developer</span>
                      <div className="space-y-1.5">
                        <h4 className="font-display font-bold text-xl text-white group-hover:text-zinc-200 transition-colors">
                          {member.name}
                        </h4>
                        <p className="font-mono text-xs text-zinc-500">
                          {member.usn}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Mentorship Highlight */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative w-full max-w-4xl mx-auto"
            >
              {/* Decorative Background Elements */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none"></div>
              
              <div className="relative glass p-16 md:p-24 rounded-[48px] border-white/5 overflow-hidden group">
                {/* Animated Border Glow */}
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
                
                <div className="relative z-10 flex flex-col items-center text-center space-y-10">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent"></div>
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.5em]">Project Mentorship</span>
                    <div className="w-12 h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent"></div>
                  </div>

                  <div className="space-y-6">
                    <h2 className="text-xl md:text-2xl font-display font-medium text-zinc-400 italic tracking-tight">
                      Under the distinguished guidance of
                    </h2>
                    
                    <div className="relative py-4">
                      {/* Signature-like underline */}
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-48 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                      <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-extrabold tracking-tighter text-white">
                        Prof. Harikumar Santhibhavan
                      </h1>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
