"use client";
import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  source?: "voice" | "text";
  timestamp?: number;
  imageUrl?: string;
  fileName?: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

interface Update {
  id: number;
  message: string;
  time: string;
  date: string;
  read: boolean;
}

interface DailyCheck {
  id: number;
  label: string;
  status: "idle" | "processing" | "done";
  lastResult: string;
  expanded: boolean;
  followUp: string;
}

function formatMessage(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/#{1,3} (.*?)(\n|$)/g, '<strong>$1</strong><br/>')
    .replace(/^- (.*?)$/gm, '• $1')
    .replace(/\n/g, '<br/>');
}

function generateId() {
  return Math.random().toString(36).slice(2);
}

const API = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
  ? 'https://api.heyjarvis.me'
  : 'http://localhost:3001';

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showUpdates, setShowUpdates] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dailyChecks, setDailyChecks] = useState<DailyCheck[]>([]);
  const [newCheckInput, setNewCheckInput] = useState("");
  const [voiceRunning, setVoiceRunning] = useState(false);
  const [spokenUpdates, setSpokenUpdates] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{data: string, type: string, name: string} | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTranscriptRef = useRef("");
  const lastResponseRef = useRef("");
  const activeIdRef = useRef<string | null>(null);
  const latestCameraFrameRef = useRef<string | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  const activeConv = conversations.find(c => c.id === activeId);
  const messages = activeConv?.messages || [];

  useEffect(() => {
    const saved = localStorage.getItem('jarvis_token');
    const savedName = localStorage.getItem('jarvis_name');
    const savedConvs = localStorage.getItem('jarvis_conversations');
    if (saved && savedName) { setToken(saved); setUserName(savedName); }
    if (savedConvs) {
      try {
        const convs = JSON.parse(savedConvs);
        setConversations(convs);
        if (convs.length > 0) setActiveId(convs[0].id);
      } catch {}
    }
    if (window.innerWidth >= 768) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    if (conversations.length > 0) localStorage.setItem('jarvis_conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  function addMessageToConv(convId: string, msg: Message) {
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, msg] } : c));
  }

  useEffect(() => {
    const interval = setInterval(async () => {
      const tok = tokenRef.current;
      if (!tok) return;
      try {
        const res = await fetch(`${API}/bg-response`, {
          headers: { Authorization: `Bearer ${tok}` }
        });
        const data = await res.json();
        if (!data.responses?.length) return;

        for (const r of data.responses) {
          let convId = activeIdRef.current;
          if (!convId) {
            convId = generateId();
            const conv: Conversation = {
              id: convId,
              title: r.message.slice(0, 40),
              messages: [],
              createdAt: Date.now()
            };
            setConversations(prev => [conv, ...prev]);
            setActiveId(convId);
            activeIdRef.current = convId;
          }
          addMessageToConv(convId, {
            role: "assistant",
            content: r.message,
            source: "text",
            timestamp: r.timestamp ?? Date.now()
          });
        }
      } catch {}
    }, 800);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!token) return;
    const saved = token;

    const fetchUpdates = async () => {
      try {
        const res = await fetch(`${API}/proactive-updates`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setUpdates(data.updates || []);
        setUnreadCount((data.updates || []).filter((u: Update) => !u.read).length);
      } catch {}
    };

    const checkVoice = async () => {
      try {
        const res = await fetch(`${API}/voice/running`);
        const data = await res.json();
        setVoiceRunning(data.running);
      } catch {}
    };

    fetchUpdates();
    checkVoice();
    const updatesInterval = setInterval(fetchUpdates, 15000);
    const voiceInterval = setInterval(checkVoice, 3000);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/voice-status`);
        const data = await res.json();
        setIsListening(data.listening);
        setIsSpeaking(data.speaking);

        if (data.transcript && data.transcript !== lastTranscriptRef.current) {
          lastTranscriptRef.current = data.transcript;
          const convId = activeIdRef.current || generateId();
          if (!activeIdRef.current) {
            const conv: Conversation = { id: convId, title: data.transcript.slice(0, 40), messages: [], createdAt: Date.now() };
            setConversations(prev => [conv, ...prev]);
            setActiveId(convId);
            activeIdRef.current = convId;
          }
          addMessageToConv(convId, { role: "user", content: data.transcript, source: "voice", timestamp: Date.now() });
        }

        if (data.response && data.response !== lastResponseRef.current && data.response !== '' && data.speaking) {
  lastResponseRef.current = data.response;
  const convId = activeIdRef.current;
  if (convId) addMessageToConv(convId, { role: "assistant", content: data.response, source: "voice", timestamp: Date.now() });
  setTimeout(() => { if (lastResponseRef.current === data.response) lastResponseRef.current = ''; }, 5000);
}
      } catch {}
    }, 400);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream;
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const tick = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        setAudioLevel(data.reduce((a, b) => a + b, 0) / data.length);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    }).catch(() => {});

    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then(stream => {
        cameraStreamRef.current = stream;
        setCameraActive(true);
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;

        video.addEventListener('loadeddata', async () => {
          try {
            ctx.drawImage(video, 0, 0, 640, 480);
            const frame = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            latestCameraFrameRef.current = frame;
            await fetch(`${API}/camera-frame`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saved}` },
              body: JSON.stringify({ frame })
            });
          } catch {}
        });

        cameraIntervalRef.current = setInterval(async () => {
          try {
            ctx.drawImage(video, 0, 0, 640, 480);
            const frame = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            latestCameraFrameRef.current = frame;
            await fetch(`${API}/camera-frame`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${saved}` },
              body: JSON.stringify({ frame })
            });
          } catch {}
        }, 5000);
      })
      .catch(() => { setCameraActive(false); });

    return () => {
      clearInterval(interval);
      clearInterval(updatesInterval);
      clearInterval(voiceInterval);
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      cameraStreamRef.current?.getTracks().forEach(t => t.stop());
      if (cameraIntervalRef.current) clearInterval(cameraIntervalRef.current);
    };
  }, [token]);

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setAttachedFile({ data: base64, type: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  function newConversation() {
    const id = generateId();
    const conv: Conversation = { id, title: 'New conversation', messages: [], createdAt: Date.now() };
    setConversations(prev => [conv, ...prev]);
    setActiveId(id);
    activeIdRef.current = id;
    setSidebarOpen(false);
    fetch(`${API}/reset`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }

  function deleteConversation(id: string) {
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (activeId === id) {
        const newActive = filtered.length > 0 ? filtered[0].id : null;
        setActiveId(newActive);
        activeIdRef.current = newActive;
      }
      localStorage.setItem('jarvis_conversations', JSON.stringify(filtered));
      return filtered;
    });
  }

  const [voiceBubbleVisible, setVoiceBubbleVisible] = useState(false);

const toggleVoice = async () => {
  if (voiceRunning) {
    await fetch(`${API}/voice/stop`, { method: "POST" });
    setVoiceRunning(false);
    setVoiceBubbleVisible(false);
  } else {
    await fetch(`${API}/voice/start`, { method: "POST" });
    setVoiceRunning(true);
    setVoiceBubbleVisible(true);
  }
};

  const handleAuth = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/signup';
      const body = authMode === 'login'
        ? { email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword, name: authName };
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      localStorage.setItem('jarvis_token', data.token);
      localStorage.setItem('jarvis_name', data.name);
      setToken(data.token);
      setUserName(data.name);
      const id = generateId();
      setConversations([{ id, title: 'New conversation', messages: [], createdAt: Date.now() }]);
      setActiveId(id);
      activeIdRef.current = id;
    } catch (e: any) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const logout = () => {
    localStorage.removeItem('jarvis_token');
    localStorage.removeItem('jarvis_name');
    localStorage.removeItem('jarvis_conversations');
    setToken(null); setUserName(''); setConversations([]); setActiveId(null); activeIdRef.current = null;
  };

  const markAllRead = async () => {
    await fetch(`${API}/proactive-updates/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    setUpdates(prev => prev.map(u => ({ ...u, read: true }))); setUnreadCount(0);
  };

  const addDailyCheck = async () => {
    if (!newCheckInput.trim()) return;
    const label = newCheckInput.trim();
    setNewCheckInput("");
    const check: DailyCheck = { id: Date.now(), label, status: "processing", lastResult: "", expanded: false, followUp: "" };
    setDailyChecks(prev => [...prev, check]);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: `${label} — check this every day and send a proactive_update with the result` })
      });
      const data = await res.json();
      setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: "done", lastResult: data.message || "Done." } : c));
    } catch { setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: "idle", lastResult: "Failed." } : c)); }
  };

  const runFollowUp = async (check: DailyCheck) => {
    if (!check.followUp.trim()) return;
    setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: "processing", followUp: "" } : c));
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: `Regarding my daily check "${check.label}": ${check.followUp}` })
      });
      const data = await res.json();
      setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, status: "done", lastResult: data.message || "Done." } : c));
    } catch {}
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    const fileToSend = attachedFile;
    setInput("");
    setAttachedFile(null);

    let convId = activeIdRef.current;
    if (!convId || !conversations.find(c => c.id === convId)) {
      convId = generateId();
      setConversations(prev => [{ id: convId!, title: userMsg.slice(0, 40), messages: [], createdAt: Date.now() }, ...prev]);
      setActiveId(convId);
      activeIdRef.current = convId;
    } else {
      setConversations(prev => prev.map(c => c.id === convId && c.messages.length === 0 ? { ...c, title: userMsg.slice(0, 40) } : c));
    }
    const finalConvId = convId!;

    addMessageToConv(finalConvId, {
      role: "user",
      content: userMsg,
      source: "text",
      timestamp: Date.now(),
      imageUrl: fileToSend?.type.startsWith('image/') ? `data:${fileToSend.type};base64,${fileToSend.data}` : undefined,
      fileName: fileToSend?.name
    });

    setLoading(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: userMsg,
          cameraFrame: latestCameraFrameRef.current,
          attachedFile: fileToSend
        })
      });
      const data = await res.json();
      if (data.message && data.message !== 'On it.') {
        addMessageToConv(finalConvId, { role: "assistant", content: data.message, source: "text", timestamp: Date.now() });
        // Speak response in user's browser
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(data.message.replace(/<[^>]*>/g, '').replace(/\*\*/g, '').replace(/\*/g, ''));
          utterance.rate = 1.0;
          utterance.pitch = 0.85;
          utterance.volume = 1.0;
          window.speechSynthesis.speak(utterance);
        }
      }
    } catch {
      addMessageToConv(finalConvId, { role: "assistant", content: "Cannot connect to JARVIS server.", timestamp: Date.now() });
    }
    setLoading(false);
  };

  const orbScale = 1 + (audioLevel / 255) * 0.4;
  const orbBg = isListening ? "radial-gradient(circle at 40% 40%, #34d399, #059669)"
    : isSpeaking ? "radial-gradient(circle at 40% 40%, #a78bfa, #6d28d9)"
    : loading ? "radial-gradient(circle at 40% 40%, #a78bfa, #6d28d9)"
    : "radial-gradient(circle at 40% 40%, #60a5fa, #1d4ed8)";
  const orbGlow = isListening ? `0 0 ${20 + audioLevel / 4}px rgba(52,211,153,0.8)`
    : isSpeaking ? "0 0 24px rgba(167,139,250,0.8)"
    : loading ? "0 0 20px rgba(167,139,250,0.6)"
    : "0 0 16px rgba(96,165,250,0.5)";
  const statusText = isListening ? "Listening..." : isSpeaking ? "Speaking..." : loading ? "Thinking..." : "Ready";

  if (!token) {
    return (
      <div className="h-screen bg-[#060608] flex items-center justify-center p-4 overflow-hidden">
        <div className="w-full max-w-sm bg-[rgba(8,8,12,0.97)] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="px-8 pt-8 pb-6 text-center border-b border-white/5">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-700 mx-auto mb-4" style={{ boxShadow: "0 0 24px rgba(96,165,250,0.5)" }} />
            <div className="text-white text-xl font-semibold tracking-wide">JARVIS</div>
            <div className="text-white/30 text-xs mt-1">Your autonomous AI</div>
          </div>
          <div className="p-8">
            <div className="flex gap-2 mb-6">
              <button onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${authMode === 'login' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}>Sign In</button>
              <button onClick={() => setAuthMode('signup')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${authMode === 'signup' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/40 hover:text-white/60'}`}>Sign Up</button>
            </div>
            <div className="flex flex-col gap-3">
              {authMode === 'signup' && <input value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Your name" className="bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-3 outline-none placeholder:text-white/25 focus:border-blue-500/40 transition-all" />}
              <input value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email" type="email" className="bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-3 outline-none placeholder:text-white/25 focus:border-blue-500/40 transition-all" />
              <input value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password" type="password" onKeyDown={e => e.key === 'Enter' && handleAuth()} className="bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-3 outline-none placeholder:text-white/25 focus:border-blue-500/40 transition-all" />
              {authError && <div className="text-red-400 text-xs px-1">{authError}</div>}
              <button onClick={handleAuth} disabled={authLoading} className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-white text-sm font-medium transition-all mt-1">
                {authLoading ? 'Loading...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#060608] flex overflow-hidden" style={{ fontFamily: "-apple-system, 'SF Pro Display', sans-serif" }}>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className={`
        fixed md:relative inset-y-0 left-0 z-40 md:z-auto
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        w-64
        bg-[#060608]
        border-r border-white/5 flex flex-col h-screen
        transition-transform duration-300
      `}>
        <div className="p-4 flex-shrink-0">
          <div className="flex items-center justify-between mb-6 px-1">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-700" style={{ boxShadow: "0 0 12px rgba(96,165,250,0.5)" }} />
              <span className="text-white text-sm font-semibold tracking-wide">JARVIS</span>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden text-white/30 hover:text-white/60 transition-all">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <button onClick={newConversation} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 text-blue-300 text-xs font-medium transition-all mb-3">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New conversation
          </button>

          {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
  <button onClick={toggleVoice} className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all mb-2 ${voiceRunning ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'}`}>
    <div className={`w-2 h-2 rounded-full ${voiceRunning ? 'bg-green-400 animate-pulse' : 'bg-white/20'}`} />
    {voiceRunning ? 'Voice active — stop' : 'Start voice'}
  </button>
)}
          <button
  onClick={async () => {
    const res = await fetch(`${API}/voice/spoken-updates`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    setSpokenUpdates(data.enabled);
  }}
  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${spokenUpdates ? 'bg-purple-500/15 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'}`}
>
  <div className={`w-2 h-2 rounded-full ${spokenUpdates ? 'bg-purple-400 animate-pulse' : 'bg-white/20'}`} />
  {spokenUpdates ? 'Spoken updates — on' : 'Spoken updates — off'}
</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
          <div className="text-white/25 text-xs uppercase tracking-widest mb-2 px-1">Conversations</div>
          {conversations.length === 0 && <div className="text-white/20 text-xs px-1 py-2">No conversations yet</div>}
          {conversations.map(conv => (
            <div key={conv.id}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl mb-1 cursor-pointer transition-all ${conv.id === activeId ? 'bg-white/8 text-white/90' : 'text-white/40 hover:bg-white/5 hover:text-white/60'}`}
              onClick={() => { setActiveId(conv.id); activeIdRef.current = conv.id; setSidebarOpen(false); }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 opacity-60">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span className="text-xs flex-1 truncate">{conv.title}</span>
              <button onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-red-400 p-1">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white/70 text-xs font-medium truncate">{userName}</div>
          </div>
          <button onClick={logout} className="text-white/25 hover:text-white/50 transition-all p-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">

        {/* Top bar */}
        <div className="px-4 py-3 flex items-center gap-3 border-b border-white/5 flex-shrink-0">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-all text-white/30 hover:text-white/60 flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-6 h-6 rounded-full flex-shrink-0 transition-all duration-100" style={{ background: orbBg, boxShadow: orbGlow, transform: `scale(${orbScale})` }} />
            <div className="min-w-0">
              <div className="text-white/80 text-sm font-medium leading-none">JARVIS</div>
              <div className="text-white/30 text-xs mt-0.5">{statusText}</div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-0.5 h-5 mr-1">
            {[...Array(5)].map((_, i) => {
              const h = isListening || audioLevel > 10 ? Math.max(3, (audioLevel / 255) * 20 * (0.4 + (i % 3) * 0.3)) : isSpeaking ? 4 + Math.abs(Math.sin(Date.now() / 200 + i)) * 12 : 3;
              return <div key={i} className="w-0.5 rounded-full transition-all duration-75" style={{ height: `${h}px`, background: isListening ? '#34d399' : isSpeaking ? '#a78bfa' : 'rgba(255,255,255,0.15)' }} />;
            })}
          </div>

          {cameraActive && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white/30 text-xs">cam</span>
            </div>
          )}

          <div className="sm:hidden">
            {voiceRunning && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
          </div>
          <button onClick={logout} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-all text-white/30 hover:text-white/60 flex-shrink-0" title="Sign out">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
          <button onClick={() => { setShowUpdates(!showUpdates); if (!showUpdates) markAllRead(); }} className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition-all flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 rounded-full text-white flex items-center justify-center font-bold" style={{ fontSize: '9px' }}>{unreadCount}</span>
            )}
          </button>
        </div>

        {showUpdates && (
          <div className="absolute inset-0 md:inset-auto md:top-[53px] md:right-0 md:w-80 md:h-[calc(100vh-53px)] bg-[rgba(6,6,8,0.99)] border-l border-white/5 z-20 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white/40 text-xs uppercase tracking-widest font-medium">Daily Checks</div>
                  <button onClick={() => setShowUpdates(false)} className="text-white/40 hover:text-white/70 text-xs transition-all flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    Close
                  </button>
                </div>
                {dailyChecks.length === 0 && <div className="text-white/20 text-xs py-2">No checks yet</div>}
                {dailyChecks.map(check => (
                  <div key={check.id} className="mb-2 rounded-xl border border-white/7 overflow-hidden">
                    <button onClick={() => setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, expanded: !c.expanded } : c))}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-all text-left">
                      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                        {check.status === "processing" ? <div className="w-3.5 h-3.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                          : check.status === "done" ? <div className="w-4 h-4 rounded-full bg-green-500/20 border border-green-500/50 flex items-center justify-center"><svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
                          : <div className="w-3.5 h-3.5 rounded-full border border-white/20" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white/80 text-xs font-medium truncate">{check.label}</div>
                        {check.status === "done" && !check.expanded && <div className="text-white/30 text-xs mt-0.5 truncate">{check.lastResult}</div>}
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" className={`flex-shrink-0 transition-transform ${check.expanded ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                    {check.expanded && (
                      <div className="px-4 pb-3 border-t border-white/5">
                        {check.lastResult && <div className="text-white/60 text-xs py-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatMessage(check.lastResult) }} />}
                        <div className="flex gap-2 mt-1">
                          <input value={check.followUp} onChange={e => setDailyChecks(prev => prev.map(c => c.id === check.id ? { ...c, followUp: e.target.value } : c))}
                            onKeyDown={e => e.key === 'Enter' && runFollowUp(check)} placeholder="Ask a follow-up..."
                            className="flex-1 bg-white/5 border border-white/8 rounded-lg text-white text-xs px-3 py-2 outline-none placeholder:text-white/20 focus:border-blue-500/30 transition-all" />
                          <button onClick={() => runFollowUp(check)} className="px-3 py-2 bg-blue-600/40 hover:bg-blue-600/60 border border-blue-500/20 rounded-lg text-blue-300 text-xs transition-all">Ask</button>
                        </div>
                        <button onClick={() => setDailyChecks(prev => prev.filter(c => c.id !== check.id))} className="mt-2 text-red-400/40 hover:text-red-400/70 text-xs transition-all">Remove</button>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <input value={newCheckInput} onChange={e => setNewCheckInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDailyCheck()}
                    placeholder="Check the weather every day..." className="flex-1 bg-white/5 border border-white/8 rounded-xl text-white text-xs px-3 py-2.5 outline-none placeholder:text-white/20 focus:border-blue-500/30 transition-all" />
                  <button onClick={addDailyCheck} disabled={!newCheckInput.trim()} className="px-3 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-xl text-white text-xs transition-all font-medium">Add</button>
                </div>
              </div>
              <div className="mx-4 my-3 border-t border-white/5" />
              <div className="px-4 pb-4">
                <div className="text-white/40 text-xs uppercase tracking-widest mb-3 font-medium">JARVIS Updates</div>
                {updates.length === 0 ? <div className="text-white/20 text-xs py-2">JARVIS is watching...</div>
                  : updates.map(update => (
                    <div key={update.id} className={`mb-2 px-4 py-3 rounded-xl text-xs border leading-relaxed ${update.read ? 'bg-white/2 border-white/5 text-white/40' : 'bg-blue-500/8 border-blue-500/20 text-white/80'}`}>
                      <div>{update.message}</div>
                      <div className="mt-1.5 opacity-40">{update.time} · {update.date}</div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4 min-h-0 relative">
  {/* VOICE BUBBLE — shown when voice is running */}
  {voiceRunning && (
    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-[#060608]">
      {/* Outer glow rings */}
      <div className="relative flex items-center justify-center mb-8">
        {isListening && (
          <>
            <div className="absolute w-48 h-48 rounded-full animate-ping" style={{ background: 'rgba(52,211,153,0.08)', animationDuration: '2s' }} />
            <div className="absolute w-36 h-36 rounded-full animate-ping" style={{ background: 'rgba(52,211,153,0.12)', animationDuration: '1.5s' }} />
          </>
        )}
        {isSpeaking && (
          <>
            <div className="absolute w-48 h-48 rounded-full animate-ping" style={{ background: 'rgba(167,139,250,0.08)', animationDuration: '1.8s' }} />
            <div className="absolute w-36 h-36 rounded-full animate-ping" style={{ background: 'rgba(167,139,250,0.12)', animationDuration: '1.2s' }} />
          </>
        )}
        {/* Main orb */}
        <div
          className="w-28 h-28 rounded-full transition-all duration-100 cursor-pointer"
          style={{
            background: orbBg,
            boxShadow: `${orbGlow}, inset 0 0 40px rgba(255,255,255,0.05)`,
            transform: `scale(${1 + (audioLevel / 255) * 0.3})`
          }}
        />
      </div>

      {/* Status */}
      <div className="text-white/60 text-lg font-medium mb-1">{statusText}</div>
      {isListening && <div className="text-white/25 text-sm">Listening for your voice</div>}
      {isSpeaking && <div className="text-white/25 text-sm">Speaking...</div>}
      {!isListening && !isSpeaking && !loading && <div className="text-white/25 text-sm">Say anything</div>}

      {/* Audio waveform */}
      <div className="flex items-center gap-1 h-8 mt-4">
        {[...Array(12)].map((_, i) => {
          const h = isListening || audioLevel > 10
            ? Math.max(3, (audioLevel / 255) * 32 * (0.3 + Math.sin(i * 0.8) * 0.7))
            : isSpeaking
            ? 4 + Math.abs(Math.sin(Date.now() / 150 + i * 0.6)) * 20
            : 3;
          return (
            <div key={i} className="w-1 rounded-full transition-all duration-75"
              style={{ height: `${h}px`, background: isListening ? '#34d399' : isSpeaking ? '#a78bfa' : 'rgba(255,255,255,0.1)' }} />
          );
        })}
      </div>

      {/* Show transcript if speaking */}
      {messages.length > 0 && (
        <div className="mt-6 max-w-sm text-center">
          <div className="text-white/20 text-xs mb-2">Last message</div>
          <div className="text-white/50 text-sm leading-relaxed line-clamp-3">
            {messages[messages.length - 1]?.content}
          </div>
        </div>
      )}

      {/* View full chat button */}
      <button
        onClick={() => setVoiceRunning(false) /* just hides bubble, doesn't stop voice */}
        className="mt-8 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white/40 hover:text-white/60 text-xs transition-all"
      >
        View chat
      </button>
    </div>
  )}

  {messages.length === 0 && !voiceRunning ? (
    <div className="flex-1 flex flex-col items-center justify-center text-center h-full px-4">
      <div className="w-16 h-16 rounded-full mb-5 flex-shrink-0" style={{ background: orbBg, boxShadow: orbGlow }} />
      <div className="text-white/60 text-xl font-medium mb-1">Good to see you, {userName}.</div>
      <div className="text-white/25 text-sm mb-8">
        {cameraActive ? "I can see your screen and your camera." : "I can see your screen and I'm always ready."}
      </div>
      <button onClick={toggleVoice} className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white/50 hover:text-white/70 text-sm transition-all flex items-center gap-2.5">
        <div className="w-2 h-2 rounded-full bg-white/30" />
        Start voice
      </button>
    </div>
  ) : !voiceRunning ? (
    messages.map((msg, i) => (
      <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
        {msg.role === "assistant" && (
          <div className="w-6 h-6 rounded-full flex-shrink-0 mt-1" style={{ background: orbBg, boxShadow: orbGlow }} />
        )}
        <div className={`max-w-[80%] md:max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          msg.role === "assistant" ? "bg-white/5 border border-white/7 text-white/85 rounded-tl-sm" : "bg-blue-600 text-white rounded-tr-sm"
        }`}>
          {msg.source === "voice" && <div className="text-xs opacity-40 mb-1">{msg.role === "user" ? "voice" : "spoken"}</div>}
          {msg.fileName && !msg.imageUrl && (
            <div className="flex items-center gap-1.5 mb-2 opacity-70">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
              <span className="text-xs">{msg.fileName}</span>
            </div>
          )}
          <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
          {msg.imageUrl && (
            <img src={msg.imageUrl} alt={msg.fileName || 'attachment'} className="mt-2 rounded-xl max-w-full" style={{ maxHeight: '300px', objectFit: 'contain' }} />
          )}
        </div>
      </div>
    ))
  ) : null}
  {loading && !voiceRunning && (
    <div className="flex gap-2.5">
      <div className="w-6 h-6 rounded-full flex-shrink-0 mt-1" style={{ background: orbBg }} />
      <div className="bg-white/5 border border-white/7 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1">
          {[0, 150, 300].map(delay => <span key={delay} className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />)}
        </div>
      </div>
    </div>
  )}
  <div ref={bottomRef} />
</div>

{attachedFile && (
          <div className="px-4 pt-2 flex-shrink-0">
            <div className="flex items-center gap-2">
              {attachedFile.type.startsWith('image/') ? (
                <img src={`data:${attachedFile.type};base64,${attachedFile.data}`} alt="preview" className="h-12 w-12 rounded-lg object-cover border border-white/10" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
              )}
              <span className="text-white/50 text-xs flex-1 truncate">{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)} className="text-white/30 hover:text-white/60 transition-all p-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        )}

        <div className="px-4 pb-4 pt-3 flex gap-2.5 border-t border-white/5 flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,.js,.ts,.py,.md,.json,.csv,.doc,.docx"
            onChange={handleFileAttach}
            className="hidden"
          />
          <button
  onClick={() => {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Speech recognition not supported. Use Chrome or Edge.');
    return;
  }
  alert('Starting recognition...');
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  setIsListening(true);
  recognition.onstart = () => alert('Listening! Speak now.');
  recognition.onresult = (e: any) => {
    alert('Got result: ' + e.results[0][0].transcript);
    setIsListening(false);
    // ... rest of code
  };
  recognition.onerror = (e: any) => {
    alert('Error: ' + e.error);
    setIsListening(false);
  };
  recognition.onend = () => setIsListening(false);
  recognition.start();
}}
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
</button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-11 h-11 flex items-center justify-center rounded-xl hover:bg-white/5 transition-all flex-shrink-0 text-white/30 hover:text-white/60"
            title="Attach file"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="Message JARVIS..."
            disabled={loading}
            className="flex-1 bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-3 outline-none placeholder:text-white/20 focus:border-blue-500/30 transition-all"
          />
          <button onClick={send} disabled={loading || (!input.trim() && !attachedFile)}
            className="w-11 h-11 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 rounded-xl flex items-center justify-center transition-all flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}