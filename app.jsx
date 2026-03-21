import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";

// ========== THEME ==========
const C = {
  bg: '#0a0e17', card: '#13182a', border: '#1e2640', inputBg: '#181f35',
  text: '#e2e8f0', sub: '#7c8aa0', accent: '#64ffda', danger: '#ff6b6b',
};
const MOODS = ['😊','😐','😔','😡','😴','🤩'];
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const JOURNAL_PROMPTS = [
  'What went well today?','What did you learn?','What are you grateful for?',
  'How can tomorrow be better?','One highlight from today...','What challenged you?',
  'Something that made you smile...',
];
const CATEGORY_COLORS = ['#10b981','#8b5cf6','#f59e0b','#3b82f6','#ef4444','#ec4899','#06b6d4','#84cc16'];
const DEFAULT_CATEGORIES = [
  { id:'fitness', name:'Fitness Tracker', icon:'💪', color:'#10b981', days:7,
    tasks:['Do Workout','Log Meal 1','Log Meal 2','Log Meal 3','Hit Calories Intake','Hit Protein Intake'] },
  { id:'emotional', name:'Emotional Growth', icon:'🧠', color:'#8b5cf6', days:7,
    tasks:['Write Growth Journal','Talk to Family / Friend','Play any Match'] },
  { id:'financial', name:'Financial Growth', icon:'💰', color:'#f59e0b', days:6,
    tasks:['Go to Work','Log Hours','Do Next Practical Step'] },
];
const RANKS = [
  { min:1, max:5, name:'E-Rank', title:'Beginner Hunter', color:'#6b7280', icon:'🗡️' },
  { min:6, max:12, name:'D-Rank', title:'Apprentice Hunter', color:'#10b981', icon:'⚔️' },
  { min:13, max:20, name:'C-Rank', title:'Skilled Hunter', color:'#3b82f6', icon:'🛡️' },
  { min:21, max:30, name:'B-Rank', title:'Elite Hunter', color:'#8b5cf6', icon:'🏹' },
  { min:31, max:42, name:'A-Rank', title:'Master Hunter', color:'#f59e0b', icon:'👑' },
  { min:43, max:999, name:'S-Rank', title:'Shadow Monarch', color:'#ef4444', icon:'🔥' },
];
const getRank = (level) => RANKS.find(r => level >= r.min && level <= r.max) || RANKS[0];
const XP_PER_TASK = 10;
const XP_PER_LEVEL = 100;
const RANDOM_CHALLENGES = [
  { title:'📝 Journal Master', desc:'Write in your journal 5 days', target:5, subType:'journal' },
  { title:'💰 Savings Sprint', desc:'Save money 4 days this week', target:4, subType:'savings' },
  { title:'😊 Mood Logger', desc:'Log mood every day this week', target:7, subType:'mood' },
  { title:'💪 Perfect Day', desc:'Complete ALL tasks in one day', target:1, subType:'perfectDay' },
  { title:'⚡ Energy Tracker', desc:'Log energy level 5 days', target:5, subType:'energy' },
];
const GOAL_CATEGORIES = [
  { id:'health', name:'Health', icon:'🏋️', color:'#10b981' },
  { id:'wealth', name:'Wealth', icon:'💎', color:'#f59e0b' },
  { id:'happiness', name:'Happiness', icon:'😊', color:'#8b5cf6' },
];

// ========== STORAGE UTILS ==========
const STORAGE_KEY = 'pt_pwa_v1';

function getWeekId(date) {
  const d = date || new Date();
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const jan4 = new Date(target.getFullYear(), 0, 4);
  const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
  const weekNr = 1 + Math.round((dayDiff - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${String(weekNr).padStart(2, '0')}`;
}

function getWeekStart(weekId) {
  const parts = weekId.split('-W');
  const year = parseInt(parts[0]);
  const week = parseInt(parts[1]);
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7;
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - jan4Day + (week - 1) * 7);
  return weekStart;
}

function getWeekRange(weekId) {
  const start = getWeekStart(weekId);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${start.getDate()} ${months[start.getMonth()]} — ${end.getDate()} ${months[end.getMonth()]}`;
}

function getTodayIndex() { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; }

function getAdjacentWeek(weekId, dir) {
  const start = getWeekStart(weekId);
  start.setDate(start.getDate() + dir * 7);
  return getWeekId(start);
}

function initWeekData(categories) {
  const tasks = {};
  for (const cat of categories) {
    tasks[cat.id] = {};
    for (const task of cat.tasks) tasks[cat.id][task] = new Array(cat.days).fill(false);
  }
  return { tasks, logs: {}, meta: { stars: 0, reflection: '', focus: '' } };
}

function ensureWeek(data, weekId) {
  if (!data.weeks[weekId]) data.weeks[weekId] = initWeekData(data.categories);
  for (const cat of data.categories) {
    if (!data.weeks[weekId].tasks[cat.id]) data.weeks[weekId].tasks[cat.id] = {};
    for (const task of cat.tasks) {
      if (!data.weeks[weekId].tasks[cat.id][task])
        data.weeks[weekId].tasks[cat.id][task] = new Array(cat.days).fill(false);
    }
  }
  if (!data.weeks[weekId].meta) data.weeks[weekId].meta = { stars: 0, reflection: '', focus: '' };
  if (!data.weeks[weekId].logs) data.weeks[weekId].logs = {};
  return data;
}

function getCategoryScore(weekData, cat) {
  const catTasks = weekData.tasks[cat.id] || {};
  let done = 0, total = 0;
  for (const task of cat.tasks) {
    const arr = catTasks[task] || [];
    for (let i = 0; i < cat.days; i++) { total++; if (arr[i]) done++; }
  }
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function getOverallScore(weekData, categories) {
  let done = 0, total = 0;
  for (const cat of categories) { const s = getCategoryScore(weekData, cat); done += s.done; total += s.total; }
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
}

function calculateXPFromData(data) {
  let xp = 0;
  for (const weekId of Object.keys(data.weeks)) {
    const wd = data.weeks[weekId];
    for (const cat of data.categories) {
      const catTasks = wd.tasks[cat.id] || {};
      for (const task of cat.tasks) {
        const arr = catTasks[task] || [];
        for (let i = 0; i < cat.days; i++) { if (arr[i]) xp += XP_PER_TASK; }
      }
    }
    const logs = wd.logs || {};
    for (const dk of Object.keys(logs)) {
      const l = logs[dk];
      if (l.mood !== undefined) xp += 3;
      if (l.energy !== undefined) xp += 2;
      if (l.note && l.note.length > 0) xp += 5;
    }
    const overall = getOverallScore(wd, data.categories);
    if (overall.pct >= 80) xp += 100;
    else if (overall.pct >= 50) xp += 50;
  }
  for (const wk of Object.keys(data.challenges || {})) {
    for (const ch of (data.challenges[wk] || [])) { if (ch.completed) xp += ch.xpReward; }
  }
  return xp;
}

function calculateStats(data) {
  let str = 0, int_ = 0, gold = 0;
  for (const weekId of Object.keys(data.weeks)) {
    const wd = data.weeks[weekId];
    for (const cat of data.categories) {
      const catTasks = wd.tasks[cat.id] || {};
      let count = 0;
      for (const task of cat.tasks) {
        const arr = catTasks[task] || [];
        for (let i = 0; i < cat.days; i++) { if (arr[i]) count++; }
      }
      if (cat.id === 'fitness') str += count;
      else if (cat.id === 'emotional') int_ += count;
      else if (cat.id === 'financial') gold += count;
    }
  }
  return { str, int: int_, gold };
}

function seededRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) { hash = ((hash << 5) - hash) + seed.charCodeAt(i); hash |= 0; }
  return () => { hash = (hash * 1103515245 + 12345) & 0x7fffffff; return (hash >>> 16) / 32767; };
}

function generateChallenges(weekId, categories) {
  const rng = seededRandom(weekId);
  const challenges = [];
  const targetPct = Math.floor(rng() * 40) + 40;
  challenges.push({ id:`target_${weekId}`, type:'target', title:'🎯 Weekly Target', description:`Score at least ${targetPct}% this week`, target:targetPct, xpReward:50, completed:false });
  const catIdx = Math.floor(rng() * categories.length);
  const cat = categories[catIdx];
  const streakDays = Math.floor(rng() * 3) + 3;
  challenges.push({ id:`streak_${weekId}`, type:'streak', title:`${cat.icon} ${streakDays}-Day Streak`, description:`Complete all ${cat.name} tasks for ${streakDays} consecutive days`, target:streakDays, xpReward:40, completed:false, categoryId:cat.id });
  const rcIdx = Math.floor(rng() * RANDOM_CHALLENGES.length);
  const rc = RANDOM_CHALLENGES[rcIdx];
  challenges.push({ id:`random_${weekId}`, type:'random', title:rc.title, description:rc.desc, target:rc.target, xpReward:30, completed:false, subType:rc.subType });
  return challenges;
}

function getChallengeProgress(ch, wd, cats) {
  if (ch.type === 'target') return getOverallScore(wd, cats).pct;
  if (ch.type === 'streak') {
    const cat = cats.find(c => c.id === ch.categoryId);
    if (!cat) return 0;
    const ct = wd.tasks[cat.id] || {};
    let maxS = 0, curS = 0;
    for (let d = 0; d < cat.days; d++) {
      const allDone = cat.tasks.every(t => (ct[t] || [])[d]);
      if (allDone) { curS++; maxS = Math.max(maxS, curS); } else { curS = 0; }
    }
    return maxS;
  }
  if (ch.type === 'random') {
    const logs = wd.logs || {};
    const vals = Object.values(logs);
    switch (ch.subType) {
      case 'journal': return vals.filter(l => l.note && l.note.length > 0).length;
      case 'savings': return vals.filter(l => (l.money || 0) > 0).length;
      case 'mood': return vals.filter(l => l.mood !== undefined).length;
      case 'energy': return vals.filter(l => l.energy !== undefined).length;
      case 'perfectDay': {
        for (let d = 0; d < 7; d++) {
          const allDone = cats.every(cat => {
            if (d >= cat.days) return true;
            const ct = wd.tasks[cat.id] || {};
            return cat.tasks.every(t => (ct[t] || [])[d]);
          });
          if (allDone) return 1;
        }
        return 0;
      }
      default: return 0;
    }
  }
  return 0;
}

function getDefaultData() {
  return {
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c, tasks: [...c.tasks] })),
    weeks: {}, player: { xp: 0 }, challenges: {}, goals: [], reminders: [],
  };
}

function loadDataFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (!data.categories || !data.weeks) return getDefaultData();
      if (!data.player) data.player = { xp: calculateXPFromData(data) };
      if (!data.challenges) data.challenges = {};
      if (!data.goals) data.goals = [];
      if (!data.reminders) data.reminders = [];
      return data;
    }
  } catch (e) { console.error('Load error:', e); }
  return getDefaultData();
}

function saveDataToStorage(data) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) { console.error('Save error:', e); }
}

// ========== DATA CONTEXT ==========
const DataContext = createContext(null);

function DataProvider({ children }) {
  const [data, setData] = useState(getDefaultData);
  const [selectedWeek, setSelectedWeek] = useState(getWeekId());
  const [loaded, setLoaded] = useState(false);
  const [levelUpInfo, setLevelUpInfo] = useState(null);
  const currentWeek = getWeekId();
  const isCurrentWeek = selectedWeek === currentWeek;

  useEffect(() => {
    const d = loadDataFromStorage();
    ensureWeek(d, currentWeek);
    if (!d.challenges[currentWeek]) d.challenges[currentWeek] = generateChallenges(currentWeek, d.categories);
    setData({ ...d });
    saveDataToStorage(d);
    setLoaded(true);
  }, []);

  const persist = useCallback((next) => { setData({ ...next }); saveDataToStorage(next); }, []);

  const playerXP = data.player?.xp || 0;
  const playerLevel = Math.floor(playerXP / XP_PER_LEVEL) + 1;
  const playerRank = getRank(playerLevel);
  const xpInLevel = playerXP % XP_PER_LEVEL;
  const playerStats = useMemo(() => calculateStats(data), [data]);

  const addXP = useCallback((amount, prev) => {
    const oldXP = prev.player.xp;
    const newXP = Math.max(0, oldXP + amount);
    const oldLevel = Math.floor(oldXP / XP_PER_LEVEL) + 1;
    const newLevel = Math.floor(newXP / XP_PER_LEVEL) + 1;
    if (newLevel > oldLevel) setLevelUpInfo({ show: true, level: newLevel, rank: getRank(newLevel) });
    return { ...prev, player: { xp: newXP } };
  }, []);

  const toggleTask = useCallback((catId, task, dayIdx) => {
    setData(prev => {
      let next = { ...prev, weeks: { ...prev.weeks }, player: { ...prev.player }, challenges: { ...prev.challenges } };
      ensureWeek(next, selectedWeek);
      const wd = { ...next.weeks[selectedWeek] };
      if (!wd.tasks[catId]) wd.tasks[catId] = {};
      if (!wd.tasks[catId][task]) {
        const cat = next.categories.find(c => c.id === catId);
        wd.tasks[catId][task] = new Array(cat?.days || 7).fill(false);
      }
      wd.tasks[catId] = { ...wd.tasks[catId] };
      wd.tasks[catId][task] = [...wd.tasks[catId][task]];
      const wasChecked = wd.tasks[catId][task][dayIdx];
      wd.tasks[catId][task][dayIdx] = !wasChecked;
      wd.tasks = { ...wd.tasks };
      next.weeks[selectedWeek] = wd;
      next = addXP(wasChecked ? -XP_PER_TASK : XP_PER_TASK, next);
      if (next.challenges[selectedWeek]) {
        const chs = next.challenges[selectedWeek].map(ch => {
          if (ch.completed) return ch;
          const prog = getChallengeProgress(ch, wd, next.categories);
          if (prog >= ch.target) { next = addXP(ch.xpReward, next); return { ...ch, completed: true }; }
          return ch;
        });
        next.challenges = { ...next.challenges, [selectedWeek]: chs };
      }
      saveDataToStorage(next);
      return next;
    });
  }, [selectedWeek, addXP]);

  const setMeta = useCallback((key, value) => {
    setData(prev => {
      const next = { ...prev, weeks: { ...prev.weeks } };
      ensureWeek(next, selectedWeek);
      next.weeks[selectedWeek] = { ...next.weeks[selectedWeek], meta: { ...next.weeks[selectedWeek].meta, [key]: value } };
      saveDataToStorage(next);
      return next;
    });
  }, [selectedWeek]);

  const setLog = useCallback((dayIdx, key, value) => {
    setData(prev => {
      let next = { ...prev, weeks: { ...prev.weeks }, player: { ...prev.player }, challenges: { ...prev.challenges } };
      ensureWeek(next, selectedWeek);
      const logs = { ...next.weeks[selectedWeek].logs };
      const oldLog = logs[dayIdx] || {};
      const isNewEntry = oldLog[key] === undefined;
      logs[dayIdx] = { ...oldLog, [key]: value };
      next.weeks[selectedWeek] = { ...next.weeks[selectedWeek], logs };
      if (isNewEntry && (key === 'mood' || key === 'energy' || key === 'note')) {
        const xpAmount = key === 'note' ? 5 : key === 'mood' ? 3 : 2;
        next = addXP(xpAmount, next);
      }
      if (next.challenges[selectedWeek]) {
        const wd = next.weeks[selectedWeek];
        const chs = next.challenges[selectedWeek].map(ch => {
          if (ch.completed) return ch;
          const prog = getChallengeProgress(ch, wd, next.categories);
          if (prog >= ch.target) { next = addXP(ch.xpReward, next); return { ...ch, completed: true }; }
          return ch;
        });
        next.challenges = { ...next.challenges, [selectedWeek]: chs };
      }
      saveDataToStorage(next);
      return next;
    });
  }, [selectedWeek, addXP]);

  const resetWeek = useCallback(() => {
    setData(prev => {
      const next = { ...prev, weeks: { ...prev.weeks } };
      delete next.weeks[selectedWeek];
      ensureWeek(next, selectedWeek);
      saveDataToStorage(next);
      return next;
    });
  }, [selectedWeek]);

  const deleteWeek = useCallback((weekId) => {
    setData(prev => {
      const next = { ...prev, weeks: { ...prev.weeks }, challenges: { ...prev.challenges } };
      delete next.weeks[weekId];
      delete next.challenges[weekId];
      next.player = { xp: calculateXPFromData(next) };
      saveDataToStorage(next);
      return next;
    });
  }, []);

  const updateCategories = useCallback((cats) => {
    setData(prev => { const next = { ...prev, categories: cats }; saveDataToStorage(next); return next; });
  }, []);

  const weekChallenges = useMemo(() => {
    if (!data.challenges[selectedWeek]) {
      data.challenges[selectedWeek] = generateChallenges(selectedWeek, data.categories);
      saveDataToStorage(data);
    }
    const wd = data.weeks[selectedWeek];
    if (!wd) return (data.challenges[selectedWeek] || []).map(ch => ({ ...ch, progress: 0 }));
    return (data.challenges[selectedWeek] || []).map(ch => ({
      ...ch, progress: getChallengeProgress(ch, wd, data.categories),
    }));
  }, [data, selectedWeek]);

  const addGoal = useCallback((cat, title, targetDate) => {
    setData(prev => {
      const goal = { id:`goal_${Date.now()}`, category:cat, title, progress:0, targetDate, createdAt:new Date().toISOString(), archived:false };
      const next = { ...prev, goals: [...prev.goals, goal] };
      saveDataToStorage(next);
      return next;
    });
  }, []);

  const updateGoalProgress = useCallback((id, delta) => {
    setData(prev => {
      const goals = prev.goals.map(g => {
        if (g.id !== id) return g;
        const newProg = Math.max(0, Math.min(100, g.progress + delta));
        return { ...g, progress: newProg, completedAt: newProg >= 100 && g.progress < 100 ? new Date().toISOString() : g.completedAt };
      });
      const next = { ...prev, goals };
      saveDataToStorage(next);
      return next;
    });
  }, []);

  const updateGoal = useCallback((id, title, targetDate) => {
    setData(prev => {
      const goals = prev.goals.map(g => g.id === id ? { ...g, title, targetDate } : g);
      const next = { ...prev, goals }; saveDataToStorage(next); return next;
    });
  }, []);

  const archiveGoal = useCallback((id) => {
    setData(prev => {
      const goals = prev.goals.map(g => g.id === id ? { ...g, archived: true } : g);
      const next = { ...prev, goals }; saveDataToStorage(next); return next;
    });
  }, []);

  const deleteGoal = useCallback((id) => {
    setData(prev => {
      const goals = prev.goals.filter(g => g.id !== id);
      const next = { ...prev, goals }; saveDataToStorage(next); return next;
    });
  }, []);

  const dismissLevelUp = useCallback(() => setLevelUpInfo(null), []);

  return (
    <DataContext.Provider value={{
      data, currentWeek, selectedWeek, setSelectedWeek,
      toggleTask, setMeta, setLog, resetWeek, updateCategories,
      isCurrentWeek, loaded, deleteWeek,
      playerXP, playerLevel, playerRank, xpInLevel, playerStats,
      levelUpInfo, dismissLevelUp, weekChallenges,
      addGoal, updateGoalProgress, updateGoal, archiveGoal, deleteGoal,
    }}>
      {children}
    </DataContext.Provider>
  );
}

function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be inside DataProvider');
  return ctx;
}

// ========== CIRCULAR PROGRESS ==========
function CircularProgress({ size, strokeWidth, progress, color = C.accent }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;
  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <span style={{ fontSize: size * 0.22, fontWeight: 800, color: C.text, zIndex: 1 }}>{progress}%</span>
    </div>
  );
}

// ========== PROGRESS BAR ==========
function ProgressBar({ pct, color, height = 7 }) {
  return (
    <div style={{ height, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: height, overflow: 'hidden', width: '100%' }}>
      <div style={{ height, borderRadius: height, backgroundColor: color, width: `${pct}%`, transition: 'width 0.4s ease' }} />
    </div>
  );
}

// ========== SCORE LABEL ==========
function getScoreLabel(pct) {
  if (pct >= 75) return '🔥 Crushing it!';
  if (pct >= 50) return '✨ Good';
  if (pct >= 25) return '💫 Push';
  return '🎯 Start';
}

// ========== TABS ==========
const TABS = [
  { id: 'tracker', label: '📊 Tracker' },
  { id: 'dailylog', label: '📋 Log' },
  { id: 'history', label: '📅 History' },
  { id: 'hunter', label: '⚔️ Hunter' },
];

// ========== TRACKER TAB ==========
function TrackerTab() {
  const { data, selectedWeek, currentWeek, isCurrentWeek, toggleTask, setMeta, resetWeek, loaded, weekChallenges, playerLevel, playerRank, levelUpInfo, dismissLevelUp, setTab } = useData();
  const [showSettings, setShowSettings] = useState(false);

  const weekData = useMemo(() => {
    const d = { ...data }; ensureWeek(d, selectedWeek); return d.weeks[selectedWeek];
  }, [data, selectedWeek]);

  const overall = useMemo(() => getOverallScore(weekData, data.categories), [weekData, data.categories]);
  const catScores = useMemo(() => data.categories.map(cat => ({ ...getCategoryScore(weekData, cat), cat })), [weekData, data.categories]);

  const streak = useMemo(() => {
    let count = 0, wid = currentWeek;
    while (data.weeks[wid]) {
      const s = getOverallScore(data.weeks[wid], data.categories);
      if (s.pct >= 50) count++; else break;
      wid = getAdjacentWeek(wid, -1);
    }
    return count;
  }, [data, currentWeek]);

  const todayIdx = getTodayIndex();

  const handleExport = () => {
    const lines = [`📊 WEEKLY PROGRESS REPORT`, `${getWeekRange(selectedWeek)}`, ''];
    lines.push(`Overall: ${overall.done}/${overall.total} (${overall.pct}%)`);
    lines.push('');
    for (const cs of catScores) {
      lines.push(`${cs.cat.icon} ${cs.cat.name}: ${cs.done}/${cs.total} (${cs.pct}%)`);
      for (const task of cs.cat.tasks) {
        const arr = weekData.tasks[cs.cat.id]?.[task] || [];
        const doneCount = arr.filter(Boolean).length;
        lines.push(`  ${doneCount > 0 ? '✅' : '⬜'} ${task}: ${doneCount}/${cs.cat.days}`);
      }
      lines.push('');
    }
    if (weekData.meta.stars > 0) lines.push(`⭐ Rating: ${weekData.meta.stars}/5`);
    if (weekData.meta.reflection) lines.push(`📝 ${weekData.meta.reflection}`);
    if (weekData.meta.focus) lines.push(`🎯 Focus: ${weekData.meta.focus}`);
    navigator.clipboard?.writeText(lines.join('\n')).then(() => alert('Copied to clipboard!')).catch(() => alert(lines.join('\n')));
  };

  if (!loaded) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.scrollContainer}>
      {/* Header */}
      <div style={{ paddingTop: 12, paddingBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>All-in-1 Progress Tracker</h1>
        <p style={{ fontSize: 13, color: C.sub, margin: '4px 0 0' }}>
          📍 {isCurrentWeek ? 'Current Week' : selectedWeek} • {getWeekRange(selectedWeek)}
        </p>
      </div>

      {/* Score Card */}
      <div style={{ ...styles.card, display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, color: C.sub, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Weekly Score</p>
          <p style={{ fontSize: 36, fontWeight: 800, color: C.text, margin: '4px 0' }}>
            {overall.done}<span style={{ fontSize: 20, fontWeight: 400, color: C.sub }}>/{overall.total}</span>
          </p>
          {streak > 0 && <p style={{ fontSize: 12, color: C.accent, margin: 0 }}>🔥 {streak} week streak!</p>}
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {catScores.map(cs => (
              <div key={cs.cat.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cs.cat.color }} />
                <span style={{ fontSize: 11, color: C.sub }}>{cs.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <CircularProgress size={80} strokeWidth={6} progress={overall.pct} />
      </div>

      {/* Celebration */}
      {overall.pct >= 80 && isCurrentWeek && (
        <div style={{ backgroundColor: '#64ffda18', borderRadius: 12, padding: 12, marginTop: 12, textAlign: 'center', border: `1px solid ${C.accent}` }}>
          <span style={{ fontSize: 14, color: C.accent, fontWeight: 600 }}>🎉 Amazing week! You're crushing it! 🎉</span>
        </div>
      )}

      {/* Challenges */}
      <div style={{ ...styles.card, marginTop: 14, borderColor: '#3b82f640' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>⚔️ Weekly Challenges</span>
          <span style={{ backgroundColor: '#3b82f620', padding: '4px 10px', borderRadius: 8, border: '1px solid #3b82f640', fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>
            {playerRank.icon} Lv.{playerLevel}
          </span>
        </div>
        {weekChallenges.map(ch => {
          const pct = Math.min(100, Math.round((ch.progress / ch.target) * 100));
          return (
            <div key={ch.id} style={{ backgroundColor: ch.completed ? '#64ffda10' : C.inputBg, borderRadius: 10, padding: 10, marginBottom: 6, border: ch.completed ? '1px solid #64ffda30' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{ch.title}</p>
                  <p style={{ fontSize: 11, color: C.sub, margin: '1px 0 0' }}>{ch.description}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: ch.completed ? C.accent : '#3b82f6' }}>
                  {ch.completed ? '✅' : `+${ch.xpReward} XP`}
                </span>
              </div>
              <ProgressBar pct={pct} color={ch.completed ? C.accent : '#3b82f6'} height={5} />
              <p style={{ fontSize: 10, color: C.sub, margin: '3px 0 0' }}>{ch.progress}/{ch.target} {ch.completed ? '— Complete!' : ''}</p>
            </div>
          );
        })}
      </div>

      {/* Category Cards */}
      {data.categories.map((cat, catIdx) => {
        const score = catScores[catIdx];
        return (
          <div key={cat.id} style={{ ...styles.card, marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
                  {cat.icon} <span style={{ color: cat.color }}>{cat.name}</span>
                </span>
                <p style={{ fontSize: 11, color: C.sub, margin: '2px 0 0' }}>{cat.days} days • {cat.tasks.length} tasks/day</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: cat.color, margin: 0 }}>{score.pct}%</p>
                <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>{score.done}/{score.total}</p>
              </div>
            </div>
            <ProgressBar pct={score.pct} color={cat.color} />
            {/* Task Grid */}
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: 10, color: C.sub, fontWeight: 600, padding: '4px 8px 4px 0', minWidth: 100 }}>Task</th>
                    {DAYS.slice(0, cat.days).map((d, i) => (
                      <th key={i} style={{ fontSize: 10, color: todayIdx === i && isCurrentWeek ? C.accent : C.sub, fontWeight: todayIdx === i && isCurrentWeek ? 700 : 600, padding: '4px 2px', minWidth: 36, textAlign: 'center' }}>{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cat.tasks.map(task => (
                    <tr key={task}>
                      <td style={{ fontSize: 11, color: C.text, padding: '3px 8px 3px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{task}</td>
                      {Array.from({ length: cat.days }, (_, di) => {
                        const checked = weekData.tasks[cat.id]?.[task]?.[di] || false;
                        return (
                          <td key={di} style={{ textAlign: 'center', padding: '3px 2px' }}>
                            <button
                              onClick={() => isCurrentWeek && toggleTask(cat.id, task, di)}
                              disabled={!isCurrentWeek}
                              style={{
                                width: 26, height: 26, borderRadius: 6,
                                border: `1.5px solid ${checked ? cat.color : C.border}`,
                                backgroundColor: checked ? cat.color : C.inputBg,
                                cursor: isCurrentWeek ? 'pointer' : 'default',
                                opacity: isCurrentWeek ? 1 : 0.5,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 14, fontWeight: 700,
                                transition: 'all 0.15s ease',
                              }}
                            >{checked ? '✓' : ''}</button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Weekly Summary */}
      <div style={{ ...styles.card, marginTop: 14 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: '0 0 12px' }}>📝 Weekly Summary</h3>
        {catScores.map(cs => (
          <div key={cs.cat.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: `3px solid ${cs.cat.color}`, paddingLeft: 10, paddingTop: 8, paddingBottom: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: C.text }}>{cs.cat.icon} {cs.cat.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: C.sub }}>{cs.done}/{cs.total}</span>
              <span style={{ backgroundColor: cs.cat.color + '18', color: cs.cat.color, padding: '3px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>
                {getScoreLabel(cs.pct)}
              </span>
            </div>
          </div>
        ))}
        <p style={{ fontSize: 12, color: C.sub, marginTop: 14, marginBottom: 6 }}>Rate your week:</p>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => isCurrentWeek && setMeta('stars', s)}
              style={{ fontSize: 24, opacity: weekData.meta.stars >= s ? 1 : 0.3, padding: 8, background: 'none', border: 'none', cursor: 'pointer' }}>⭐</button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.sub, marginTop: 14, marginBottom: 6 }}>Weekly reflection:</p>
        <textarea
          style={{ ...styles.inputBase, minHeight: 80, resize: 'vertical' }}
          placeholder="How was your week? Kya seekha?..."
          value={weekData.meta.reflection}
          onChange={e => setMeta('reflection', e.target.value)}
          disabled={!isCurrentWeek}
        />
        <p style={{ fontSize: 12, color: C.sub, marginTop: 14, marginBottom: 6 }}>🎯 Next week's focus:</p>
        <input
          style={styles.inputBase}
          placeholder="One priority for next week..."
          value={weekData.meta.focus}
          onChange={e => setMeta('focus', e.target.value)}
          disabled={!isCurrentWeek}
        />
      </div>

      {/* Bottom Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, marginBottom: 40 }}>
        <button onClick={() => { if (confirm('Clear all data for this week?')) resetWeek(); }}
          style={{ ...styles.actionBtn, borderColor: C.danger, color: C.danger }}>🔄 Reset</button>
        <button onClick={handleExport}
          style={{ ...styles.actionBtn, borderColor: C.accent, color: C.accent }}>📤 Export</button>
      </div>
    </div>
  );
}

// ========== DAILY LOG TAB ==========
function DailyLogTab() {
  const { data, selectedWeek, isCurrentWeek, setLog, loaded } = useData();
  const [openDays, setOpenDays] = useState({ [getTodayIndex()]: true });
  const todayIdx = getTodayIndex();

  const weekData = useMemo(() => {
    const d = { ...data }; ensureWeek(d, selectedWeek); return d.weeks[selectedWeek];
  }, [data, selectedWeek]);

  if (!loaded) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.scrollContainer}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, paddingTop: 12 }}>📋 Daily Log</h1>
      <p style={{ fontSize: 13, color: C.sub, margin: '0 0 12px' }}>Track your mood, energy & notes</p>

      {DAYS.map((dayName, idx) => {
        const isOpen = openDays[idx];
        const isToday = idx === todayIdx && isCurrentWeek;
        const log = weekData.logs[idx] || {};

        return (
          <div key={idx} style={{ ...styles.card, marginBottom: 10, padding: 0, overflow: 'hidden' }}>
            <button onClick={() => setOpenDays(prev => ({ ...prev, [idx]: !prev[idx] }))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 14, background: 'none', border: 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{dayName}</span>
                {isToday && <span style={{ backgroundColor: C.accent, color: C.bg, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>TODAY</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {log.mood !== undefined && <span style={{ fontSize: 18 }}>{MOODS[log.mood]}</span>}
                {log.energy !== undefined && <span style={{ fontSize: 11, color: C.sub }}>⚡{log.energy + 1}</span>}
                {log.money > 0 && <span style={{ fontSize: 11, color: C.sub }}>💰${log.money}</span>}
                <span style={{ fontSize: 10, color: C.sub }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div style={{ padding: '12px 14px 16px', borderTop: `1px solid ${C.border}` }}>
                <p style={styles.fieldLabel}>How are you feeling?</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {MOODS.map((emoji, mi) => (
                    <button key={mi} onClick={() => isCurrentWeek && setLog(idx, 'mood', mi)}
                      disabled={!isCurrentWeek}
                      style={{
                        width: 44, height: 44, borderRadius: 12, fontSize: 22,
                        backgroundColor: log.mood === mi ? '#64ffda18' : C.inputBg,
                        border: `1px solid ${log.mood === mi ? C.accent : C.border}`,
                        cursor: isCurrentWeek ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{emoji}</button>
                  ))}
                </div>

                <p style={styles.fieldLabel}>Energy Level</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1,2,3,4,5].map(e => (
                    <button key={e} onClick={() => isCurrentWeek && setLog(idx, 'energy', e - 1)}
                      disabled={!isCurrentWeek}
                      style={{
                        width: 44, height: 44, borderRadius: 12, fontSize: 16, fontWeight: 700,
                        backgroundColor: log.energy === e - 1 ? '#64ffda18' : C.inputBg,
                        border: `1px solid ${log.energy === e - 1 ? C.accent : C.border}`,
                        color: log.energy === e - 1 ? C.accent : C.sub,
                        cursor: isCurrentWeek ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{e}</button>
                  ))}
                </div>

                <p style={styles.fieldLabel}>Money Saved (AUD)</p>
                <input type="number" style={styles.inputBase} placeholder="0"
                  value={log.money !== undefined ? log.money : ''}
                  onChange={e => setLog(idx, 'money', parseFloat(e.target.value) || 0)}
                  disabled={!isCurrentWeek}
                />

                <p style={styles.fieldLabel}>Journal</p>
                <textarea style={{ ...styles.inputBase, minHeight: 80, resize: 'vertical' }}
                  placeholder={JOURNAL_PROMPTS[idx % JOURNAL_PROMPTS.length]}
                  value={log.note || ''}
                  onChange={e => setLog(idx, 'note', e.target.value)}
                  disabled={!isCurrentWeek}
                />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ height: 40 }} />
    </div>
  );
}

// ========== HISTORY TAB ==========
function HistoryTab() {
  const { data, selectedWeek, setSelectedWeek, currentWeek, loaded, deleteWeek, addGoal, updateGoalProgress, updateGoal, archiveGoal, deleteGoal } = useData();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalCat, setGoalCat] = useState('health');
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [editingGoal, setEditingGoal] = useState(null);
  const [showArchive, setShowArchive] = useState(false);

  const sortedWeeks = useMemo(() => Object.keys(data.weeks).sort().reverse(), [data.weeks]);
  const activeGoals = useMemo(() => data.goals.filter(g => !g.archived), [data.goals]);
  const archivedGoals = useMemo(() => data.goals.filter(g => g.archived), [data.goals]);

  const getDaysLeft = (dateStr) => {
    const target = new Date(dateStr);
    return Math.ceil((target.getTime() - new Date().getTime()) / 86400000);
  };

  const handleAddGoal = () => {
    if (!goalTitle.trim()) { alert('Enter a goal title'); return; }
    if (!goalDate.trim()) { alert('Enter a target date (YYYY-MM-DD)'); return; }
    if (editingGoal) updateGoal(editingGoal, goalTitle.trim(), goalDate.trim());
    else addGoal(goalCat, goalTitle.trim(), goalDate.trim());
    setGoalTitle(''); setGoalDate(''); setShowGoalForm(false); setEditingGoal(null);
  };

  if (!loaded) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={styles.scrollContainer}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, paddingTop: 12, marginBottom: 6 }}>📊 History & Goals</h1>

      {/* Goals */}
      <p style={{ fontSize: 13, fontWeight: 700, color: C.accent, letterSpacing: 1, textTransform: 'uppercase', margin: '8px 0 10px' }}>🎯 MY GOALS</p>

      {GOAL_CATEGORIES.map(gc => {
        const goal = activeGoals.find(g => g.category === gc.id);
        if (!goal) {
          return (
            <button key={gc.id} onClick={() => { setGoalCat(gc.id); setEditingGoal(null); setGoalTitle(''); setGoalDate(''); setShowGoalForm(true); }}
              style={{ ...styles.card, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, border: `1px dashed ${gc.color}40`, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
              <span style={{ fontSize: 24 }}>{gc.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: gc.color }}>Set {gc.name} Goal</span>
            </button>
          );
        }
        const daysLeft = getDaysLeft(goal.targetDate);
        return (
          <div key={goal.id} style={{ ...styles.card, marginBottom: 10, borderLeft: `4px solid ${gc.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 11, color: C.sub, margin: 0 }}>{gc.icon} {gc.name}</p>
                <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '2px 0' }}>{goal.title}</p>
                <p style={{ fontSize: 12, color: daysLeft < 0 ? C.danger : C.accent, margin: 0 }}>
                  {daysLeft >= 0 ? `${daysLeft} days left` : `${Math.abs(daysLeft)} days overdue`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => { setEditingGoal(goal.id); setGoalCat(goal.category); setGoalTitle(goal.title); setGoalDate(goal.targetDate); setShowGoalForm(true); }}
                  style={styles.iconBtn}>✏️</button>
                <button onClick={() => { if (confirm('Archive this goal?')) archiveGoal(goal.id); }}
                  style={styles.iconBtn}>📦</button>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1 }}><ProgressBar pct={goal.progress} color={gc.color} height={8} /></div>
              <span style={{ fontSize: 14, fontWeight: 700, color: gc.color, minWidth: 40, textAlign: 'right' }}>{goal.progress}%</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[{v:-10,l:'−10'},{v:5,l:'+5'},{v:10,l:'+10'},{v:25,l:'+25'}].map(b => (
                <button key={b.l} onClick={() => updateGoalProgress(goal.id, b.v)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 8, backgroundColor: b.v > 5 ? gc.color+'20' : C.inputBg, border: `1px solid ${b.v > 5 ? gc.color : C.border}`, color: b.v > 5 ? gc.color : C.sub, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{b.l}</button>
              ))}
            </div>
            {goal.progress >= 100 && <p style={{ fontSize: 13, fontWeight: 600, color: C.accent, marginTop: 8, textAlign: 'center' }}>🎉 Goal Complete!</p>}
          </div>
        );
      })}

      {archivedGoals.length > 0 && (
        <button onClick={() => setShowArchive(!showArchive)}
          style={{ background: 'none', border: 'none', color: C.sub, fontSize: 13, cursor: 'pointer', padding: '10px 0', width: '100%', textAlign: 'center' }}>
          📜 Goal History ({archivedGoals.length}) {showArchive ? '▲' : '▼'}
        </button>
      )}
      {showArchive && archivedGoals.map(g => {
        const ci = GOAL_CATEGORIES.find(c => c.id === g.category) || GOAL_CATEGORIES[0];
        return (
          <div key={g.id} style={{ ...styles.card, marginBottom: 6, borderLeft: `3px solid ${ci.color}`, opacity: 0.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 10, color: C.sub, margin: 0 }}>{ci.icon} {ci.name}</p>
                <p style={{ fontSize: 14, color: C.text, margin: 0 }}>{g.title}</p>
                <p style={{ fontSize: 10, color: C.sub, margin: '2px 0 0' }}>{g.progress}% • {g.completedAt ? 'Completed' : 'Archived'}</p>
              </div>
              <button onClick={() => deleteGoal(g.id)} style={styles.iconBtn}>🗑</button>
            </div>
          </div>
        );
      })}

      {/* Week History */}
      <p style={{ fontSize: 13, fontWeight: 700, color: C.accent, letterSpacing: 1, textTransform: 'uppercase', margin: '24px 0 10px' }}>📅 WEEK HISTORY</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setSelectedWeek(getAdjacentWeek(selectedWeek, -1))}
          style={{ ...styles.navBtn }}>◀ Prev</button>
        <button onClick={() => setSelectedWeek(currentWeek)}
          style={{ ...styles.navBtn, borderColor: C.accent, color: C.accent }}>Current</button>
        <button onClick={() => setSelectedWeek(getAdjacentWeek(selectedWeek, 1))}
          style={{ ...styles.navBtn }}>Next ▶</button>
      </div>

      {sortedWeeks.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 30 }}>
          <p style={{ fontSize: 36 }}>📅</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: C.text }}>No history yet</p>
        </div>
      ) : sortedWeeks.map(wid => {
        const wd = data.weeks[wid];
        const overall = getOverallScore(wd, data.categories);
        const isCurrent = wid === currentWeek;
        const isSelected = wid === selectedWeek;
        return (
          <div key={wid} style={{ ...styles.card, marginBottom: 10, borderColor: isSelected ? C.accent : isCurrent ? '#64ffda60' : C.border }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div onClick={() => { setSelectedWeek(wid); }} style={{ cursor: 'pointer', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{wid}</span>
                  {isCurrent && <span style={{ backgroundColor: C.accent, color: C.bg, padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700 }}>CURRENT</span>}
                </div>
                <p style={{ fontSize: 12, color: C.sub, margin: '2px 0 0' }}>{getWeekRange(wid)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 22, fontWeight: 700, color: overall.pct >= 50 ? C.accent : C.text, margin: 0 }}>{overall.pct}%</p>
                <button onClick={() => { if (confirm(`Delete all data for ${wid}?`)) deleteWeek(wid); }}
                  style={styles.iconBtn}>🗑</button>
              </div>
            </div>
            <div style={{ marginTop: 6 }}>
              {data.categories.map(cat => {
                const cs = getCategoryScore(wd, cat);
                return (
                  <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 12, width: 18 }}>{cat.icon}</span>
                    <div style={{ flex: 1 }}><ProgressBar pct={cs.pct} color={cat.color} height={6} /></div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: cat.color, minWidth: 30, textAlign: 'right' }}>{cs.pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Goal Modal */}
      {showGoalForm && (
        <div style={styles.modalOverlay} onClick={() => { setShowGoalForm(false); setEditingGoal(null); }}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 12px' }}>{editingGoal ? '✏️ Edit Goal' : '🎯 New Goal'}</h3>
            {!editingGoal && (
              <>
                <p style={styles.fieldLabel}>CATEGORY</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {GOAL_CATEGORIES.map(gc => (
                    <button key={gc.id} onClick={() => setGoalCat(gc.id)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 10, backgroundColor: goalCat === gc.id ? gc.color+'20' : C.inputBg, border: `1px solid ${goalCat === gc.id ? gc.color : C.border}`, textAlign: 'center', cursor: 'pointer' }}>
                      <p style={{ fontSize: 20, margin: 0 }}>{gc.icon}</p>
                      <p style={{ fontSize: 10, color: goalCat === gc.id ? gc.color : C.sub, margin: '2px 0 0' }}>{gc.name}</p>
                    </button>
                  ))}
                </div>
              </>
            )}
            <p style={styles.fieldLabel}>GOAL TITLE</p>
            <input style={styles.inputBase} placeholder="e.g., Lose 10kg, Save $5000" value={goalTitle} onChange={e => setGoalTitle(e.target.value)} />
            <p style={styles.fieldLabel}>TARGET DATE</p>
            <input type="date" style={styles.inputBase} value={goalDate} onChange={e => setGoalDate(e.target.value)} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowGoalForm(false); setEditingGoal(null); }}
                style={{ flex: 1, padding: 12, borderRadius: 8, backgroundColor: C.inputBg, border: 'none', color: C.sub, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleAddGoal}
                style={{ flex: 2, padding: 12, borderRadius: 8, backgroundColor: C.accent, border: 'none', color: C.bg, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{editingGoal ? 'Update' : 'Set Goal'}</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ height: 40 }} />
    </div>
  );
}

// ========== HUNTER TAB ==========
function HunterTab() {
  const { data, playerXP, playerLevel, playerRank, xpInLevel, playerStats, loaded } = useData();
  const totalWeeks = Object.keys(data.weeks).length;
  const totalTasks = playerStats.str + playerStats.int + playerStats.gold;
  const maxStat = Math.max(playerStats.str, playerStats.int, playerStats.gold, 1);

  const bestWeek = useMemo(() => {
    let best = 0;
    for (const wid of Object.keys(data.weeks)) {
      const s = getOverallScore(data.weeks[wid], data.categories);
      if (s.pct > best) best = s.pct;
    }
    return best;
  }, [data]);

  if (!loaded) return <div style={styles.loading}>Loading...</div>;

  return (
    <div style={{ ...styles.scrollContainer, backgroundColor: '#050a15' }}>
      <div style={{ paddingTop: 12, marginBottom: 16, textAlign: 'center' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: 3, margin: 0 }}>⚔️ STATUS WINDOW</h2>
        <div style={{ height: 2, marginTop: 8, borderRadius: 1, backgroundColor: playerRank.color }} />
      </div>

      {/* Rank Card */}
      <div style={{ backgroundColor: '#0a1025', borderRadius: 16, border: `1.5px solid ${playerRank.color}`, padding: 24, textAlign: 'center', marginBottom: 14, boxShadow: `0 0 20px ${playerRank.color}50` }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: playerRank.color+'20', border: `1px solid ${playerRank.color}`, borderRadius: 20, padding: '8px 16px', marginBottom: 12 }}>
          <span style={{ fontSize: 18 }}>{playerRank.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: playerRank.color, letterSpacing: 1 }}>{playerRank.name}</span>
        </div>
        <p style={{ fontSize: 11, color: C.sub, letterSpacing: 2, margin: '4px 0 0', textTransform: 'uppercase' }}>LEVEL</p>
        <p style={{ fontSize: 56, fontWeight: 900, color: playerRank.color, margin: 0 }}>{playerLevel}</p>
        <p style={{ fontSize: 14, color: C.sub, fontStyle: 'italic', margin: '-4px 0 0' }}>{playerRank.title}</p>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: C.sub, letterSpacing: 1, fontWeight: 700 }}>EXP</span>
            <span style={{ fontSize: 11, color: C.text }}>{xpInLevel} / {XP_PER_LEVEL}</span>
          </div>
          <ProgressBar pct={(xpInLevel / XP_PER_LEVEL) * 100} color={playerRank.color} height={10} />
          <p style={{ fontSize: 11, color: C.sub, textAlign: 'center', marginTop: 6 }}>Total: {playerXP.toLocaleString()} XP</p>
        </div>
      </div>

      {/* Stats */}
      <div style={{ backgroundColor: '#0a1025', borderRadius: 16, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.sub, textAlign: 'center', marginBottom: 14, letterSpacing: 2 }}>── STATS ──</p>
        {[
          { key: 'STR', val: playerStats.str, color: '#10b981', label: 'Strength (Fitness)' },
          { key: 'INT', val: playerStats.int, color: '#8b5cf6', label: 'Intelligence (Emotional)' },
          { key: 'GOLD', val: playerStats.gold, color: '#f59e0b', label: 'Gold (Financial)' },
        ].map(stat => (
          <div key={stat.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 55 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: stat.color, letterSpacing: 1, margin: 0 }}>{stat.key}</p>
              <p style={{ fontSize: 8, color: C.sub, margin: 0 }}>{stat.label}</p>
            </div>
            <div style={{ flex: 1 }}><ProgressBar pct={(stat.val / maxStat) * 100} color={stat.color} height={8} /></div>
            <span style={{ fontSize: 16, fontWeight: 700, color: stat.color, minWidth: 40, textAlign: 'right' }}>{stat.val}</span>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div style={{ backgroundColor: '#0a1025', borderRadius: 16, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.sub, textAlign: 'center', marginBottom: 14, letterSpacing: 2 }}>── ACHIEVEMENTS ──</p>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {[{n:totalTasks,l:'Tasks Done'},{n:totalWeeks,l:'Weeks Tracked'},{n:`${bestWeek}%`,l:'Best Week'}].map(a => (
            <div key={a.l} style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: C.accent, margin: 0 }}>{a.n}</p>
              <p style={{ fontSize: 10, color: C.sub, margin: '2px 0 0' }}>{a.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Rank Progression */}
      <div style={{ backgroundColor: '#0a1025', borderRadius: 16, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: C.sub, textAlign: 'center', marginBottom: 14, letterSpacing: 2 }}>── RANK PROGRESSION ──</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
          {RANKS.map((r) => {
            const isActive = playerLevel >= r.min;
            const isCurrent = playerLevel >= r.min && playerLevel <= r.max;
            return (
              <div key={r.name} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  width: isCurrent ? 40 : 36, height: isCurrent ? 40 : 36, borderRadius: '50%', margin: '0 auto',
                  backgroundColor: isActive ? r.color : C.inputBg,
                  border: `${isCurrent ? 3 : 1}px solid ${isActive ? r.color : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isCurrent ? `0 0 12px ${r.color}60` : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  <span style={{ fontSize: 14 }}>{r.icon}</span>
                </div>
                <p style={{ fontSize: 9, color: isActive ? r.color : C.sub, marginTop: 4, fontWeight: isCurrent ? 800 : 600 }}>
                  {r.name.split('-')[0]}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ height: 40 }} />
    </div>
  );
}

// ========== SETTINGS ==========
function SettingsPanel({ onClose }) {
  const { data, updateCategories } = useData();
  const [cats, setCats] = useState([]);
  const [newTaskInputs, setNewTaskInputs] = useState({});

  useEffect(() => {
    setCats(data.categories.map(c => ({ ...c, tasks: [...c.tasks] })));
  }, [data.categories]);

  const updateCat = (idx, key, value) => {
    setCats(prev => { const next = [...prev]; next[idx] = { ...next[idx], [key]: value }; return next; });
  };
  const removeTask = (catIdx, taskIdx) => {
    setCats(prev => { const next = [...prev]; next[catIdx] = { ...next[catIdx], tasks: next[catIdx].tasks.filter((_, i) => i !== taskIdx) }; return next; });
  };
  const addTask = (catIdx) => {
    const taskName = (newTaskInputs[catIdx] || '').trim();
    if (!taskName) return;
    setCats(prev => { const next = [...prev]; next[catIdx] = { ...next[catIdx], tasks: [...next[catIdx].tasks, taskName] }; return next; });
    setNewTaskInputs(prev => ({ ...prev, [catIdx]: '' }));
  };
  const addCategory = () => {
    const id = `cat_${Date.now()}`;
    const usedColors = cats.map(c => c.color);
    const color = CATEGORY_COLORS.find(c => !usedColors.includes(c)) || '#3b82f6';
    setCats(prev => [...prev, { id, name: 'New Category', icon: '📌', color, days: 7, tasks: ['New Task'] }]);
  };
  const handleSave = () => { updateCategories(cats); onClose(); };

  return (
    <div style={styles.scrollContainer}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>⚙️ Settings</h2>
        <button onClick={handleSave} style={{ backgroundColor: C.accent, color: C.bg, padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Save & Close</button>
      </div>

      <p style={{ fontSize: 14, fontWeight: 600, color: C.accent, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Categories</p>

      {cats.map((cat, catIdx) => (
        <div key={cat.id} style={{ ...styles.card, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input style={{ ...styles.inputBase, width: 48, textAlign: 'center', fontSize: 22 }}
              value={cat.icon} onChange={e => updateCat(catIdx, 'icon', e.target.value)} maxLength={2} />
            <input style={{ ...styles.inputBase, flex: 1, fontSize: 16 }}
              value={cat.name} onChange={e => updateCat(catIdx, 'name', e.target.value)} />
          </div>

          <p style={styles.fieldLabel}>Days per week</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[5,6,7].map(d => (
              <button key={d} onClick={() => updateCat(catIdx, 'days', d)}
                style={{ padding: '8px 16px', borderRadius: 8, backgroundColor: cat.days === d ? C.accent : C.inputBg, border: `1px solid ${cat.days === d ? C.accent : C.border}`, color: cat.days === d ? C.bg : C.sub, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{d}</button>
            ))}
          </div>

          <p style={styles.fieldLabel}>Color</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {CATEGORY_COLORS.map(color => (
              <button key={color} onClick={() => updateCat(catIdx, 'color', color)}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color, border: `2px solid ${cat.color === color ? '#fff' : 'transparent'}`, cursor: 'pointer' }} />
            ))}
          </div>

          <p style={styles.fieldLabel}>Tasks</p>
          {cat.tasks.map((task, ti) => (
            <div key={ti} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.inputBg, borderRadius: 8, padding: '10px 12px', marginBottom: 4 }}>
              <span style={{ fontSize: 14, color: C.text }}>{task}</span>
              <button onClick={() => removeTask(catIdx, ti)} style={{ ...styles.iconBtn, color: C.danger }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input style={{ ...styles.inputBase, flex: 1, height: 40 }}
              placeholder="New task..." value={newTaskInputs[catIdx] || ''}
              onChange={e => setNewTaskInputs(prev => ({ ...prev, [catIdx]: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addTask(catIdx)} />
            <button onClick={() => addTask(catIdx)}
              style={{ height: 40, padding: '0 14px', borderRadius: 8, backgroundColor: C.accent, border: 'none', color: C.bg, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
          </div>
          <button onClick={() => { if (confirm(`Delete "${cat.name}"?`)) setCats(prev => prev.filter((_,i) => i !== catIdx)); }}
            style={{ background: 'none', border: 'none', color: C.danger, fontSize: 13, cursor: 'pointer', marginTop: 12, padding: 8, width: '100%', textAlign: 'center' }}>🗑 Delete Category</button>
        </div>
      ))}

      <button onClick={addCategory}
        style={{ ...styles.card, width: '100%', textAlign: 'center', border: `1px dashed ${C.accent}`, cursor: 'pointer', color: C.accent, fontSize: 14, fontWeight: 600 }}>+ Add New Category</button>
      <div style={{ height: 60 }} />
    </div>
  );
}

// ========== MAIN APP ==========
export default function App() {
  const [tab, setTab] = useState('tracker');
  const [showSettings, setShowSettings] = useState(false);

  return (
    <DataProvider>
      <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: C.text, maxWidth: 480, margin: '0 auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 70 }}>
          {showSettings ? (
            <SettingsPanel onClose={() => setShowSettings(false)} />
          ) : (
            <>
              {tab === 'tracker' && <TrackerTab />}
              {tab === 'dailylog' && <DailyLogTab />}
              {tab === 'history' && <HistoryTab />}
              {tab === 'hunter' && <HunterTab />}
            </>
          )}
        </div>

        {/* Settings FAB */}
        {!showSettings && (
          <button onClick={() => setShowSettings(true)}
            style={{
              position: 'fixed', bottom: 76, right: 16, width: 44, height: 44, borderRadius: 22,
              backgroundColor: C.card, border: `1px solid ${C.border}`, color: C.sub,
              fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}>⚙️</button>
        )}

        {/* Tab Bar */}
        <div style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 480,
          display: 'flex', backgroundColor: '#0d1220', borderTop: `1px solid ${C.border}`,
          paddingBottom: 'env(safe-area-inset-bottom, 8px)', zIndex: 100,
        }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setShowSettings(false); }}
              style={{
                flex: 1, padding: '10px 0', background: 'none', border: 'none',
                color: tab === t.id && !showSettings ? C.accent : C.sub,
                fontSize: 12, fontWeight: tab === t.id && !showSettings ? 700 : 500,
                cursor: 'pointer', transition: 'color 0.2s',
              }}>{t.label}</button>
          ))}
        </div>

        {/* Level Up Overlay */}
        <LevelUpOverlay />
      </div>
    </DataProvider>
  );
}

function LevelUpOverlay() {
  const { levelUpInfo, dismissLevelUp } = useData();
  if (!levelUpInfo?.show) return null;
  return (
    <div onClick={dismissLevelUp} style={styles.modalOverlay}>
      <div style={{ backgroundColor: '#0a1025', borderRadius: 20, border: `2px solid ${levelUpInfo.rank.color}`, padding: 40, textAlign: 'center', boxShadow: `0 0 30px ${levelUpInfo.rank.color}80` }}>
        <p style={{ fontSize: 48, margin: 0 }}>⚡</p>
        <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: 3, color: levelUpInfo.rank.color, margin: '8px 0 0' }}>LEVEL UP!</p>
        <p style={{ fontSize: 44, fontWeight: 900, color: C.text, margin: '4px 0' }}>Level {levelUpInfo.level}</p>
        <p style={{ fontSize: 16, fontWeight: 700, color: levelUpInfo.rank.color, margin: '8px 0' }}>
          {levelUpInfo.rank.icon} {levelUpInfo.rank.name}
        </p>
        <p style={{ fontSize: 12, color: C.sub, marginTop: 20, opacity: 0.6 }}>Tap to continue</p>
      </div>
    </div>
  );
}

// ========== SHARED STYLES ==========
const styles = {
  scrollContainer: { padding: '0 16px' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: C.accent, fontSize: 16 },
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16,
    border: `1px solid ${C.border}`,
  },
  inputBase: {
    backgroundColor: C.inputBg, borderRadius: 8, border: `1px solid ${C.border}`,
    color: C.text, fontSize: 14, padding: 12, width: '100%', boxSizing: 'border-box',
    outline: 'none', fontFamily: 'inherit',
  },
  fieldLabel: {
    fontSize: 12, color: C.sub, marginBottom: 6, marginTop: 10,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  actionBtn: {
    flex: 1, padding: '12px 0', borderRadius: 10, backgroundColor: C.card,
    border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', textAlign: 'center',
  },
  navBtn: {
    flex: 1, padding: '10px 0', borderRadius: 10, backgroundColor: C.card,
    border: `1px solid ${C.border}`, color: C.sub, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', textAlign: 'center',
  },
  iconBtn: {
    background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: 4,
  },
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200, padding: 20,
  },
  modalContent: {
    backgroundColor: C.card, borderRadius: 16, padding: 20,
    border: `1px solid ${C.border}`, width: '100%', maxWidth: 400,
  },
};
