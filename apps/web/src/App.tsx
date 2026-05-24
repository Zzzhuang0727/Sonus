import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  FileText,
  Heart,
  Loader2,
  Mic2,
  Pause,
  Play,
  Send,
  SkipBack,
  SkipForward,
  Square,
  Trash2,
  UserRound,
  Volume2,
  X
} from "lucide-react";
import type { ChatHistoryItem, DJTurn, NowState, QueueItem, SonusPlan, UserPreferenceChoice, UserProfile, UserRegistration } from "@sonus/shared";
import { api } from "./api";

const emptyNow: NowState = {
  queue: [],
  hostStatus: "idle",
  progressMs: 0,
  updatedAt: new Date().toISOString()
};

const waveBars = [18, 28, 14, 34, 48, 38, 20, 12, 28, 54, 72, 62, 40, 24, 14, 30, 46, 36, 58, 78, 64, 42, 24, 34, 50, 32, 16, 22, 36, 18];
const pixelDigits: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"]
};

const pixelLetters: Record<string, string[]> = {
  S: ["1111", "1000", "1000", "1110", "0001", "0001", "1110"],
  O: ["0110", "1001", "1001", "1001", "1001", "1001", "0110"],
  N: ["1001", "1101", "1101", "1011", "1011", "1001", "1001"],
  U: ["1001", "1001", "1001", "1001", "1001", "1001", "0110"]
};

type Theme = "dark" | "light";
type PlaybackPhase = "idle" | "host" | "track";
type AuthMode = "login" | "register";
type LyricLine = {
  id: string;
  time?: number;
  text: string;
};

const emptyRegistration: UserRegistration = {
  username: "",
  phone: "",
  email: "",
  name: "",
  age: undefined,
  birthMonthDay: undefined,
  preferredGenres: [],
  preferredArtists: []
};

export function App() {
  const [now, setNow] = useState<NowState>(emptyNow);
  const [turn, setTurn] = useState<DJTurn | undefined>();
  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const [plan, setPlan] = useState<SonusPlan | undefined>();
  const [message, setMessage] = useState("I want something soft and late-night in English.");
  const [mood, setMood] = useState("gentle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [user, setUser] = useState<UserProfile | undefined>();
  const [recentChoices, setRecentChoices] = useState<UserPreferenceChoice[]>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [loginIdentity, setLoginIdentity] = useState("");
  const [registration, setRegistration] = useState<UserRegistration>(emptyRegistration);
  const [playingId, setPlayingId] = useState<string | undefined>();
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [theme, setTheme] = useState<Theme>(() => (window.localStorage.getItem("sonus-theme") === "light" ? "light" : "dark"));
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [playbackPhase, setPlaybackPhase] = useState<PlaybackPhase>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackTime, setTrackTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [autoplayNonce, setAutoplayNonce] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const audioRef = useRef<HTMLAudioElement>(null);
  const speechRef = useRef<HTMLAudioElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const messageDeckRef = useRef<HTMLElement>(null);
  const lyricLineRefs = useRef<Array<HTMLParagraphElement | null>>([]);
  const pendingAutoplayRef = useRef(false);

  const activeItem = useMemo(() => {
    return now.current ?? now.queue.find((item) => item.id === playingId) ?? now.queue[0];
  }, [now.current, now.queue, playingId]);

  const activeIndex = useMemo(() => {
    return activeItem ? now.queue.findIndex((item) => item.id === activeItem.id) : -1;
  }, [activeItem, now.queue]);

  const previousItem = activeIndex > 0 ? now.queue[activeIndex - 1] : undefined;
  const nextItem = activeIndex >= 0 ? now.queue.slice(activeIndex + 1).find((item) => item.status !== "played") : now.queue[0];
  const lyricLines = useMemo(() => parseLyric(activeItem?.track.lyric), [activeItem?.track.lyric]);
  const currentLyricIndex = useMemo(() => getCurrentLyricIndex(lyricLines, trackTime), [lyricLines, trackTime]);

  useEffect(() => {
    api.now().then(setNow).catch((err) => setError(String(err)));
    api.history().then(setHistory).catch(() => undefined);
    refreshUserState().catch(() => undefined);

    const events = new EventSource("/api/stream");
    events.addEventListener("now-playing", (event) => setNow(JSON.parse((event as MessageEvent).data)));
    events.addEventListener("queue-updated", (event) => {
      const queue = JSON.parse((event as MessageEvent).data) as QueueItem[];
      setNow((current) => ({ ...current, queue, next: queue[0], updatedAt: new Date().toISOString() }));
    });
    events.addEventListener("speech-ready", () => {
      setNow((current) => ({ ...current, hostStatus: "speaking", updatedAt: new Date().toISOString() }));
    });
    events.addEventListener("error", (event) => setError(JSON.parse((event as MessageEvent).data).message));

    return () => events.close();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("sonus-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    if (speechRef.current) {
      speechRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    setTrackTime(0);
    setTrackDuration(msToSeconds(activeItem?.track.durationMs));
  }, [activeItem?.id, activeItem?.track.durationMs]);

  useEffect(() => {
    const historyList = historyListRef.current;
    if (historyList) {
      historyList.scrollTop = historyList.scrollHeight;
    }
  }, [history.length]);

  useEffect(() => {
    if (!lyricsOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLyricsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lyricsOpen]);

  useEffect(() => {
    if (!activeItem?.track.audioUrl || !pendingAutoplayRef.current) {
      return;
    }

    pendingAutoplayRef.current = false;
    requestAnimationFrame(() => {
      void playTrackAudio();
    });
  }, [activeItem?.id, activeItem?.track.audioUrl, autoplayNonce]);

  useEffect(() => {
    if (!lyricsOpen || currentLyricIndex < 0) {
      return;
    }

    lyricLineRefs.current[currentLyricIndex]?.scrollIntoView({
      block: "center",
      behavior: "smooth"
    });
  }, [lyricsOpen, currentLyricIndex]);

  useEffect(() => {
    resizeMessageInput();
  }, [message]);

  function switchTheme(nextTheme: Theme) {
    setTheme(nextTheme);
    window.localStorage.setItem("sonus-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }

  function toggleQueue() {
    setQueueExpanded((expanded) => !expanded);
  }

  function handleQueueKey(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleQueue();
    }
  }

  function updateNowWithQueue(queue: QueueItem[], extra: Partial<NowState> = {}) {
    setNow((current) => ({
      ...current,
      queue,
      next: queue.find((item) => item.status === "queued"),
      updatedAt: new Date().toISOString(),
      ...extra
    }));
  }

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedMessage = message.trim();
    if (!submittedMessage) {
      return;
    }

    setMessage("");
    requestAnimationFrame(resizeMessageInput);
    await sendChatMessage(submittedMessage);
  }

  async function sendChatMessage(submittedMessage: string) {
    setBusy(true);
    setError(undefined);
    const pendingUserId = `pending-user-${Date.now()}`;
    setHistory((items) => [
      ...items,
      {
        id: pendingUserId,
        role: "user",
        text: submittedMessage,
        createdAt: new Date().toISOString()
      }
    ]);

    try {
      const nextTurn = await api.chat({ message: submittedMessage, mood });
      setTurn(nextTurn);
      appendHistoryForTurn(nextTurn, submittedMessage, pendingUserId);
      updateNowWithQueue(nextTurn.queue, {
        current: undefined,
        lastSegue: nextTurn.segue,
        lastSpeechUrl: nextTurn.speechUrl,
        hostStatus: nextTurn.speechUrl ? "speaking" : "idle"
      });
      setPlayingId(undefined);
      setTrackTime(0);
      setPlaybackPhase("idle");
      setIsPlaying(false);
      if (nextTurn.speechUrl) {
        requestAnimationFrame(() => {
          setPlaybackPhase("host");
          void speechRef.current?.play().catch((err) => setError(`浏览器阻止了主播语音自动播放：${String(err)}`));
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleMessageChange(value: string) {
    setMessage(value);
  }

  function resizeMessageInput() {
    const input = messageInputRef.current;
    if (!input) {
      return;
    }

    input.style.height = "44px";
    const nextHeight = Math.min(128, input.scrollHeight);
    input.style.height = `${nextHeight}px`;
    messageDeckRef.current?.style.setProperty("--dock-space", `${nextHeight + 64}px`);
  }

  async function playItem(item: QueueItem) {
    setPlayingId(item.id);
    pendingAutoplayRef.current = true;
    setPlaybackPhase("track");
    setIsPlaying(false);
    setNow(await api.play(item.id));
    await refreshRecentChoices();
    setAutoplayNonce((nonce) => nonce + 1);
  }

  async function playTrackAudio() {
    if (!activeItem?.track.audioUrl) {
      setError("当前曲目没有可播放音频地址。");
      return;
    }

    speechRef.current?.pause();
    setPlaybackPhase("track");
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    try {
      await audioRef.current?.play();
    } catch (err) {
      setError(`浏览器阻止了歌曲自动播放：${String(err)}`);
    }
  }

  async function startPlayback() {
    setError(undefined);
    if (playbackPhase === "host" && speechRef.current) {
      speechRef.current.volume = volume;
      await speechRef.current.play().catch((err) => setError(`浏览器阻止了主播语音自动播放：${String(err)}`));
      return;
    }

    if (activeItem) {
      const loadedTrackUrl = audioRef.current?.currentSrc || audioRef.current?.src;
      const canResumeLoadedTrack = loadedTrackUrl === activeItem.track.audioUrl && (audioRef.current?.currentTime ?? 0) > 0;
      if (activeItem.status === "playing" || now.current?.id === activeItem.id || canResumeLoadedTrack) {
        await playTrackAudio();
      } else {
        await playItem(activeItem);
      }
      return;
    }

    if (queue[0]) {
      await playItem(queue[0]);
    }
  }

  function pausePlayback() {
    speechRef.current?.pause();
    audioRef.current?.pause();
    setIsPlaying(false);
  }

  function stopPlayback() {
    pausePlayback();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
    if (speechRef.current) {
      speechRef.current.currentTime = 0;
    }
    setPlaybackPhase("idle");
    setTrackTime(0);
    setIsPlaying(false);
  }

  async function playPrevious() {
    if (audioRef.current && audioRef.current.currentTime > 5) {
      audioRef.current.currentTime = 0;
      setTrackTime(0);
      return;
    }

    if (previousItem) {
      await playItem(previousItem);
    }
  }

  async function playNext() {
    if (nextItem) {
      await playItem(nextItem);
      return;
    }

    stopPlayback();
  }

  function handleTrackEnded() {
    setIsPlaying(false);
    void playNext();
  }

  function handleSpeechEnded() {
    setIsPlaying(false);
    setPlaybackPhase("idle");
  }

  function handleProgressChange(value: string) {
    const nextTime = Number(value);
    if (!Number.isFinite(nextTime)) {
      return;
    }

    setTrackTime(nextTime);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
    }
  }

  function handleVolumeStep() {
    setVolume((current) => (current >= 0.95 ? 0.2 : Math.min(1, current + 0.14)));
  }

  function appendHistoryForTurn(nextTurn: DJTurn, submittedMessage: string, pendingUserId?: string) {
    const firstTrack = nextTurn.queue[0]?.track;
    const userItem: ChatHistoryItem = {
        id: `${nextTurn.id}-user`,
        role: "user",
        text: submittedMessage,
        createdAt: nextTurn.createdAt
    };
    const sonusItem: ChatHistoryItem = {
        id: `${nextTurn.id}-sonus`,
        role: "sonus",
        text: nextTurn.say,
        createdAt: nextTurn.createdAt,
        speechUrl: nextTurn.speechUrl,
        nowPlaying: firstTrack ? `${firstTrack.title} · ${firstTrack.artist}` : undefined,
        suggestions: nextTurn.queue
    };

    setHistory((items) => {
      const pendingIndex = pendingUserId ? items.findIndex((item) => item.id === pendingUserId) : -1;
      if (pendingIndex === -1) {
        return [...items, userItem, sonusItem];
      }

      const nextItems = [...items];
      nextItems.splice(pendingIndex, 1, userItem, sonusItem);
      return nextItems;
    });
  }

  async function togglePlayback() {
    if (isPlaying) {
      pausePlayback();
      return;
    }

    await startPlayback();
  }

  async function chooseSuggestion(item: QueueItem) {
    updateNowWithQueue(now.queue.length ? now.queue : [item], {
      current: item,
      next: undefined,
      hostStatus: "playing"
    });
    await playItem(item);
  }

  async function rerollSuggestions(suggestions: QueueItem[]) {
    if (busy) {
      return;
    }

    const rejected = suggestions
      .slice(0, 5)
      .map((item) => `${item.track.title} by ${item.track.artist}`)
      .join("; ");
    await sendChatMessage(`I do not like any of these five choices. Please recommend five different English songs or non-Chinese instrumentals. Avoid: ${rejected}.`);
  }

  async function clearChatHistory() {
    if (!history.length || busy) {
      return;
    }

    const confirmed = window.confirm("清除 Sonus 聊天记录？这会删除本地历史，当前播放队列不会受影响。");
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      await api.clearHistory();
      setHistory([]);
      setTurn(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createPlan() {
    setBusy(true);
    try {
      setPlan(await api.planToday(mood));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function refreshUserState() {
    const [profile, preferences] = await Promise.all([api.me(), api.preferences()]);
    setUser(profile);
    setRecentChoices(preferences.choices);
  }

  async function refreshRecentChoices() {
    const preferences = await api.preferences().catch(() => undefined);
    if (preferences) {
      setRecentChoices(preferences.choices);
    }
  }

  function openAuth(nextMode: AuthMode = "login") {
    setAuthMode(nextMode);
    setAuthOpen(true);
    setError(undefined);
  }

  function updateRegistrationField(field: keyof UserRegistration, value: string | number | string[] | undefined) {
    setRegistration((current) => ({ ...current, [field]: value } as UserRegistration));
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const profile =
        authMode === "login"
          ? await api.login({ identity: loginIdentity.trim() })
          : await api.register(registration);
      setUser(profile);
      setAuthOpen(false);
      setLoginIdentity("");
      setRegistration(emptyRegistration);
      await refreshRecentChoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function logoutUser() {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      await api.logout();
      await refreshUserState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const queue = now.queue;
  const statusText = now.hostStatus === "thinking" ? "THINKING" : now.hostStatus === "speaking" ? "SPEAKING" : now.hostStatus === "playing" ? "ON AIR" : "STANDBY";
  const clock = currentTime.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dayName = currentTime.toLocaleDateString("en-US", { weekday: "long" });
  const fullDate = currentTime.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, " · ").toUpperCase();
  const currentTitle = activeItem?.track.title ?? "NO TRACK LOADED";
  const currentArtist = activeItem?.track.artist ?? "Send Sonus a signal";
  const hostCopy = turn?.say ?? now.lastSegue ?? "Connected to Sonus server. Tell the DJ what kind of night this is, and the first queue will arrive here.";
  const effectiveDuration = trackDuration || msToSeconds(activeItem?.track.durationMs);
  const progressPercent = effectiveDuration ? Math.min(100, (trackTime / effectiveDuration) * 100) : 0;
  const hostStatusText = playbackPhase === "host" ? "HOST LIVE" : statusText;
  const signedInUser = user?.id === "local-default" ? undefined : user;
  const displayHistory = history.length
    ? history
    : [
        {
          id: "sonus-welcome",
          role: "sonus" as const,
          text: hostCopy,
          createdAt: now.updatedAt,
          nowPlaying: activeItem ? `${currentTitle} · ${currentArtist}` : undefined
        }
      ];

  return (
    <main className="consoleShell" data-theme={theme}>
      <section className="radioPanel">
        <header className="topbar">
          <div className="identity">
            <div>
              <PixelWord value="SONUS" />
            </div>
          </div>
          <div className="modeSwitch" aria-label="mode switch">
            <button type="button" className={signedInUser ? "accountSwitch active" : "accountSwitch"} onClick={() => openAuth("login")}>
              {signedInUser ? signedInUser.name.slice(0, 8).toUpperCase() : "LOGIN"}
            </button>
            <button type="button" data-theme-option="dark" className={theme === "dark" ? "active" : ""} aria-pressed={theme === "dark"} onClick={() => switchTheme("dark")}>
              DARK
            </button>
            <button type="button" data-theme-option="light" className={theme === "light" ? "active" : ""} aria-pressed={theme === "light"} onClick={() => switchTheme("light")}>
              LIGHT
            </button>
          </div>
        </header>

        <section className="clockDeck">
          <PixelClock value={clock} />
          <p>{dayName}</p>
          <small>{fullDate}</small>
          <div className="onAir">
            <span /> {hostStatusText}
          </div>
          <Waveform variant="hero" />
        </section>

        <section className="transportDeck">
          <div className="trackMeta">
            <div className="meterMini">
              <span />
              <span />
              <span />
            </div>
            <div>
              <strong>{currentTitle}</strong>
              <p>{currentArtist}</p>
            </div>
          </div>
          <div className="transport">
            <IconButton label="上一首" onClick={() => void playPrevious()} icon={<SkipBack size={18} />} />
            <IconButton
              label={isPlaying ? "暂停" : "播放"}
              onClick={() => void togglePlayback()}
              icon={isPlaying ? <Pause size={18} /> : <Play size={18} />}
              active={isPlaying}
            />
            <IconButton label="下一首" onClick={() => void playNext()} icon={<SkipForward size={18} />} />
            <IconButton label="停止" onClick={stopPlayback} icon={<Square size={16} />} />
            <IconButton label={`音量 ${Math.round(volume * 100)}%`} onClick={handleVolumeStep} icon={<Volume2 size={18} />} />
            <IconButton label="打开歌词" onClick={() => setLyricsOpen(true)} icon={<FileText size={17} />} active={lyricsOpen} />
          </div>
          <div className="progressLine">
            <span>{formatTime(trackTime)}</span>
            <label className="rail" aria-label="播放进度">
              <input
                type="range"
                min="0"
                max={Math.max(1, Math.floor(effectiveDuration || 1))}
                value={Math.min(trackTime, effectiveDuration || trackTime)}
                onChange={(event) => handleProgressChange(event.target.value)}
                disabled={!activeItem?.track.audioUrl}
                style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
              />
            </label>
            <span>{formatTime(effectiveDuration)}</span>
          </div>
          <audio
            ref={audioRef}
            src={activeItem?.track.audioUrl}
            preload="metadata"
            onLoadedMetadata={(event) => setTrackDuration(event.currentTarget.duration || msToSeconds(activeItem?.track.durationMs))}
            onTimeUpdate={(event) => setTrackTime(event.currentTarget.currentTime)}
            onPlay={() => {
              setPlaybackPhase("track");
              setIsPlaying(true);
            }}
            onPause={() => {
              setTrackTime(audioRef.current?.currentTime ?? trackTime);
              setIsPlaying(false);
            }}
            onEnded={handleTrackEnded}
          />
        </section>

        <section className={queueExpanded ? "queueDeck expanded" : "queueDeck"}>
          <button
            type="button"
            className="stripHeader queueToggle"
            aria-expanded={queueExpanded}
            onClick={toggleQueue}
            onKeyDown={handleQueueKey}
          >
            <span className="toggleLabel">
              <span className="toggleArrow" />
              QUEUE
            </span>
            <span>{queue.length} TRACKS</span>
          </button>
          <div className="queueRows" hidden={!queueExpanded}>
            {queue.length ? (
              queue.map((item, index) => (
                <button className="queueRow" key={item.id} onClick={() => playItem(item)}>
                  <span className={item.status === "playing" ? "liveDot active" : "liveDot"} />
                  <span>{index === 0 ? "Sonus" : `CH-${String(index + 1).padStart(2, "0")}`}</span>
                  <strong>{item.track.title}</strong>
                  <em>{item.reason}</em>
                </button>
              ))
            ) : (
              <p className="empty">NO SIGNAL IN QUEUE</p>
            )}
          </div>
        </section>

        <section className="messageDeck" ref={messageDeckRef}>
          <div className="sectionLabel chatHeader">
            <span className="sectionTitle">
              <Mic2 size={16} />
              <span>SONUS CHAT</span>
            </span>
            <button
              type="button"
              className="clearHistoryButton"
              onClick={() => void clearChatHistory()}
              disabled={busy || history.length === 0}
              aria-label="清除聊天记录"
              title="清除聊天记录"
            >
              <Trash2 size={15} />
              <span>CLEAR</span>
            </button>
          </div>
          <div className="chatHistory" aria-label="Sonus chat history" ref={historyListRef}>
            {displayHistory.map((item) => (
              <article className={`chatBubbleRow ${item.role}`} key={item.id}>
                <div className="chatAvatar" aria-hidden="true">{item.role === "user" ? "ME" : "S"}</div>
                <div className="chatBubble">
                  <div className="chatMeta">
                    <span>{item.role === "user" ? "YOU" : "SONUS"}</span>
                    <time dateTime={item.createdAt}>{formatHistoryTime(item.createdAt)}</time>
                  </div>
                  <p>{item.text}</p>
                  {item.role === "sonus" && item.suggestions?.length ? (
                    <div className="songChoices" aria-label="Song choices">
                      {item.suggestions.slice(0, 5).map((choice, index) => (
                        <button
                          type="button"
                          className="songChoice"
                          key={choice.id}
                          onClick={() => void chooseSuggestion(choice)}
                          aria-label={`Play ${choice.track.title} by ${choice.track.artist}`}
                        >
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <strong>{choice.track.title}</strong>
                          <em>{choice.track.artist}</em>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="songChoice rerollChoice"
                        onClick={() => void rerollSuggestions(item.suggestions ?? [])}
                        disabled={busy}
                        aria-label="Recommend five different songs"
                      >
                        <span>06</span>
                        <strong>None of these</strong>
                        <em>Recommend 5 different songs</em>
                      </button>
                    </div>
                  ) : null}
                  {item.role === "sonus" && item.suggestions?.length ? <small>Choose one to play.</small> : null}
                </div>
              </article>
            ))}
          </div>
          {turn?.speechUrl ? (
            <audio
              ref={speechRef}
              controls
              src={turn.speechUrl}
              onPlay={() => {
                setPlaybackPhase("host");
                setIsPlaying(true);
              }}
              onPause={() => setIsPlaying(false)}
              onEnded={handleSpeechEnded}
            />
          ) : null}
          <div className="systemLine">Now playing: {currentTitle}.</div>
          {error ? <div className="error">{error}</div> : null}
          <form className="commandDock" onSubmit={submitChat}>
            <input className="moodInput" aria-label="mood" value={mood} onChange={(event) => setMood(event.target.value)} />
            <textarea
              ref={messageInputRef}
              aria-label="message"
              rows={1}
              value={message}
              onChange={(event) => handleMessageChange(event.target.value)}
            />
            <button type="submit" disabled={busy} aria-label="send">
              {busy ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
            </button>
          </form>
        </section>

        <footer className="footerLine">
          <span>SONUS FM</span>
          <span>CONNECTED.</span>
        </footer>
      </section>

      <aside className="sidePanel">
        <section className="sideCard">
          <div className="sectionLabel">
            <CalendarDays size={16} />
            <span>TODAY PLAN</span>
          </div>
          <button className="pixelButton" onClick={createPlan} disabled={busy}>
            GENERATE
          </button>
          {plan ? (
            <div className="planBox">
              <strong>{plan.theme}</strong>
              <p>{plan.opening}</p>
              {plan.blocks.map((block) => (
                <p key={block.title}>{block.title}: {block.hostNote}</p>
              ))}
            </div>
          ) : (
            <p className="empty">NO PLAN YET</p>
          )}
        </section>

        <section className="sideCard recentCard">
          <div className="sectionLabel">
            <Heart size={16} />
            <span>RECENT 20</span>
          </div>
          <div className="listenerBadge">
            <span>{signedInUser ? "SIGNED IN" : "LOCAL"}</span>
            <strong>{user?.name ?? "Local Listener"}</strong>
          </div>
          {recentChoices.length ? (
            <ol className="recentList">
              {recentChoices.slice(0, 20).map((choice, index) => (
                <li key={`${choice.trackId}-${choice.chosenAt}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{choice.title}</strong>
                    <em>{choice.artist}</em>
                  </div>
                  <time dateTime={choice.chosenAt}>{formatRecentTime(choice.chosenAt)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty">NO RECENT PLAYS</p>
          )}
        </section>
      </aside>

      {authOpen ? (
        <div className="authOverlay" onMouseDown={(event) => event.currentTarget === event.target && setAuthOpen(false)}>
          <section className="authWindow" role="dialog" aria-modal="true" aria-label="Sonus login">
            <header className="authHeader">
              <div>
                <span>SONUS USER</span>
                <strong>{authMode === "login" ? "LOGIN" : "REGISTER"}</strong>
              </div>
              <button type="button" onClick={() => setAuthOpen(false)} aria-label="关闭登录窗口">
                <X size={18} />
              </button>
            </header>

            {signedInUser ? (
              <div className="accountPanel">
                <div className="chatAvatar" aria-hidden="true">{signedInUser.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <span>CURRENT USER</span>
                  <strong>{signedInUser.name}</strong>
                  <em>{signedInUser.email}</em>
                </div>
                <button type="button" onClick={() => void logoutUser()} disabled={busy}>
                  LOGOUT
                </button>
              </div>
            ) : null}

            <div className="authTabs" role="tablist" aria-label="auth mode">
              <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>
                LOGIN
              </button>
              <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>
                REGISTER
              </button>
            </div>

            <form className="authForm" onSubmit={submitAuth}>
              {authMode === "login" ? (
                <label>
                  <span>USERNAME / PHONE / EMAIL</span>
                  <input value={loginIdentity} onChange={(event) => setLoginIdentity(event.target.value)} required autoFocus />
                </label>
              ) : (
                <div className="authGrid">
                  <label>
                    <span>USERNAME</span>
                    <input value={registration.username} onChange={(event) => updateRegistrationField("username", event.target.value)} required autoFocus />
                  </label>
                  <label>
                    <span>PHONE</span>
                    <input value={registration.phone} onChange={(event) => updateRegistrationField("phone", event.target.value)} required />
                  </label>
                  <label className="wide">
                    <span>EMAIL</span>
                    <input type="email" value={registration.email} onChange={(event) => updateRegistrationField("email", event.target.value)} required />
                  </label>
                  <label className="wide">
                    <span>NAME</span>
                    <input value={registration.name ?? ""} onChange={(event) => updateRegistrationField("name", event.target.value)} />
                  </label>
                  <label>
                    <span>AGE</span>
                    <input
                      type="number"
                      min="1"
                      max="130"
                      value={registration.age ?? ""}
                      onChange={(event) => updateRegistrationField("age", event.target.value ? Number(event.target.value) : undefined)}
                    />
                  </label>
                  <label>
                    <span>BIRTH MM-DD</span>
                    <input
                      value={registration.birthMonthDay ?? ""}
                      onChange={(event) => updateRegistrationField("birthMonthDay", event.target.value || undefined)}
                      pattern="^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$"
                    />
                  </label>
                  <label className="wide">
                    <span>GENRES</span>
                    <input value={registration.preferredGenres.join(", ")} onChange={(event) => updateRegistrationField("preferredGenres", splitList(event.target.value))} />
                  </label>
                  <label className="wide">
                    <span>ARTISTS</span>
                    <input value={registration.preferredArtists.join(", ")} onChange={(event) => updateRegistrationField("preferredArtists", splitList(event.target.value))} />
                  </label>
                </div>
              )}

              <button className="authSubmit" type="submit" disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} /> : authMode === "login" ? "LOGIN" : "CREATE USER"}
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {lyricsOpen ? (
        <div className="lyricsOverlay" onMouseDown={(event) => event.currentTarget === event.target && setLyricsOpen(false)}>
          <section className="lyricsWindow" role="dialog" aria-modal="true" aria-label="歌词窗口">
            <header className="lyricsWindowHeader">
              <div>
                <span>LYRICS</span>
                <strong>{currentTitle}</strong>
                <small>{currentArtist}</small>
              </div>
              <button type="button" onClick={() => setLyricsOpen(false)} aria-label="关闭歌词">
                <X size={18} />
              </button>
            </header>
            <div className="lyricsTimeline">
              {lyricLines.length ? (
                lyricLines.map((line, index) => (
                  <p
                    className={[
                      "lyricLine",
                      index === currentLyricIndex ? "active" : "",
                      index < currentLyricIndex ? "past" : ""
                    ].filter(Boolean).join(" ")}
                    key={line.id}
                    ref={(node) => {
                      lyricLineRefs.current[index] = node;
                    }}
                  >
                    <span>{line.time === undefined ? "--:--" : formatTime(line.time)}</span>
                    <strong>{line.text}</strong>
                  </p>
                ))
              ) : (
                <p className="lyricsEmpty">NO LYRIC SIGNAL</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function msToSeconds(ms: number | undefined) {
  return ms ? Math.max(0, Math.round(ms / 1000)) : 0;
}

function formatTime(seconds: number | undefined) {
  const safeSeconds = Math.max(0, Math.floor(seconds ?? 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatHistoryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatRecentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase();
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseLyric(lyric: string | undefined): LyricLine[] {
  if (!lyric) {
    return [];
  }

  const lines: LyricLine[] = lyric
    .split(/\r?\n/)
    .flatMap((line, lineIndex): LyricLine[] => {
      const timeMatches = Array.from(line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g));
      const text = line.replace(/\[[^\]]+\]/g, "").trim();

      if (!text) {
        return [];
      }

      if (!timeMatches.length) {
        return [{ id: `plain-${lineIndex}`, time: undefined, text }];
      }

      return timeMatches.map((timeMatch, timeIndex) => ({
        id: `${lineIndex}-${timeIndex}-${text}`,
        time: Number(timeMatch[1]) * 60 + Number(timeMatch[2]) + Number(`0.${(timeMatch[3] ?? "0").padEnd(3, "0")}`),
        text
      }));
    });

  return lines.sort((left, right) => (left.time ?? Number.MAX_SAFE_INTEGER) - (right.time ?? Number.MAX_SAFE_INTEGER));
}

export function getCurrentLyricIndex(lines: LyricLine[], trackTime: number) {
  const firstTimedIndex = lines.findIndex((line) => line.time !== undefined);
  if (firstTimedIndex === -1) {
    return lines.length ? 0 : -1;
  }

  let activeIndex = firstTimedIndex;
  for (let index = firstTimedIndex; index < lines.length; index += 1) {
    const lineTime = lines[index]?.time;
    if (lineTime === undefined) {
      continue;
    }

    if (lineTime <= trackTime + 0.15) {
      activeIndex = index;
    } else {
      break;
    }
  }

  return activeIndex;
}

function Waveform({ variant }: { variant?: "hero" }) {
  const bars = [...waveBars, ...waveBars];

  return (
    <div className={variant === "hero" ? "waveform heroWave" : "waveform"} aria-hidden="true">
      <div className="waveTrack">
        {bars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          style={
            {
              "--base": `${Math.max(12, Math.round(height * 0.58))}px`,
              "--peak": `${height}px`,
              "--delay": `${index * -0.11}s`,
              "--speed": `${1.05 + (index % 5) * 0.12}s`
            } as React.CSSProperties
          }
        />
      ))}
      </div>
    </div>
  );
}

function PixelClock({ value }: { value: string }) {
  return (
    <div className="pixelClock" aria-label={value}>
      {value.split("").map((character, index) =>
        character === ":" ? (
          <span className="pixelColon" key={`${character}-${index}`}>
            <i />
            <i />
          </span>
        ) : (
          <span className="pixelDigit" key={`${character}-${index}`}>
            {(pixelDigits[character] ?? pixelDigits["0"]).flatMap((row, rowIndex) =>
              row.split("").map((cell, cellIndex) => <i className={cell === "1" ? "on" : ""} key={`${rowIndex}-${cellIndex}`} />)
            )}
          </span>
        )
      )}
    </div>
  );
}

function PixelWord({ value }: { value: string }) {
  return (
    <div className="brandName" aria-label={value}>
      {value.split("").map((character, index) => (
        <span className="pixelLetter" key={`${character}-${index}`}>
          {(pixelLetters[character.toUpperCase()] ?? pixelLetters.S).flatMap((row, rowIndex) =>
            row.split("").map((cell, cellIndex) => <i className={cell === "1" ? "on" : ""} key={`${rowIndex}-${cellIndex}`} />)
          )}
        </span>
      ))}
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  active = false
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button type="button" className={active ? "iconButton active" : "iconButton"} onClick={onClick} aria-label={label} title={label}>
      {icon}
    </button>
  );
}
