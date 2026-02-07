import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BIBLE_BOOKS, TOTAL_CHAPTERS } from './constants';
import { ReadStatus, FamilyMember, BibleBook } from './types';
import { getMotivationalMessage } from './geminiService';
import html2canvas from 'html2canvas';
import { db } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

// 선택 가능한 컬러 테마 정의
const COLOR_THEMES = [
  { id: 'red', dotColor: 'bg-red-500', color: 'bg-red-50 border-red-200 text-red-700' },
  { id: 'yellow', dotColor: 'bg-yellow-400', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { id: 'green', dotColor: 'bg-green-500', color: 'bg-green-50 border-green-200 text-green-700' },
  { id: 'pink', dotColor: 'bg-pink-400', color: 'bg-pink-50 border-pink-200 text-pink-700' },
  { id: 'blue', dotColor: 'bg-blue-500', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { id: 'indigo', dotColor: 'bg-indigo-500', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  { id: 'orange', dotColor: 'bg-orange-500', color: 'bg-orange-50 border-orange-200 text-orange-700' },
  { id: 'teal', dotColor: 'bg-teal-500', color: 'bg-teal-50 border-teal-200 text-teal-700' },
];

const DEFAULT_MEMBERS: FamilyMember[] = [
  { id: 'member1', name: '아빠', color: 'bg-red-50 border-red-200 text-red-700', dotColor: 'bg-red-500', label: '아빠' },
  { id: 'member2', name: '엄마', color: 'bg-yellow-50 border-yellow-200 text-yellow-700', dotColor: 'bg-yellow-400', label: '엄마' },
  { id: 'member3', name: '아들', color: 'bg-green-50 border-green-200 text-green-700', dotColor: 'bg-green-500', label: '아들' },
  { id: 'member4', name: '딸', color: 'bg-pink-50 border-pink-200 text-pink-700', dotColor: 'bg-pink-400', label: '딸' },
];

interface LastClicked {
  bookName: string;
  index: number;
}

const App: React.FC = () => {
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(DEFAULT_MEMBERS);
  const [readStatus, setReadStatus] = useState<ReadStatus>({});

  // 최신 readStatus를 가리키는 Ref (비동기 콜백에서 최신성 보장하여 데이터 누락 방지)
  const readStatusRef = useRef<ReadStatus>({});
  useEffect(() => {
    readStatusRef.current = readStatus;
  }, [readStatus]);

  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  });

  const [activeMemberId, setActiveMemberId] = useState<string>('member1');
  const [activeMobileTab, setActiveMobileTab] = useState<'reading' | 'race'>('reading');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [lastClicked, setLastClicked] = useState<LastClicked | null>(null);

  const [message, setMessage] = useState<string>("주의 말씀은 내 발에 등이요 내 길에 빛이니이다.");
  const [isLoadingMessage, setIsLoadingMessage] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState<'init' | 'connected' | 'error'>('init');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubMembers = onSnapshot(doc(db, "bible_tracker", "config"), (snapshot) => {
      setConnectionStatus('connected');
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.members) setFamilyMembers(data.members);
        if (data.startDate) setStartDate(data.startDate);
        if (data.endDate) setEndDate(data.endDate);
      }
    }, (error) => {
      console.error("멤버 동기화 오류:", error);
      setConnectionStatus('error');
      setErrorMessage(error.message);
    });

    const unsubStatus = onSnapshot(doc(db, "bible_tracker", "status"), (snapshot) => {
      if (snapshot.exists()) {
        setReadStatus(snapshot.data() as ReadStatus);
      }
    }, (error) => {
      console.error("읽기표 동기화 오류:", error);
    });

    return () => {
      unsubMembers();
      unsubStatus();
    };
  }, []);

  useEffect(() => {
    if (familyMembers.length > 0 && !familyMembers.find(m => m.id === activeMemberId)) {
      setActiveMemberId(familyMembers[0].id);
    }
  }, [familyMembers, activeMemberId]);

  const familyProgress = useMemo(() => {
    const results: Record<string, number> = {};
    familyMembers.forEach(m => { results[m.id] = 0; });

    BIBLE_BOOKS.forEach(book => {
      const chapters = readStatus[book.name];
      if (chapters && typeof chapters === 'object') {
        Object.values(chapters).forEach(readers => {
          if (Array.isArray(readers)) {
            readers.forEach(rid => {
              if (results[rid] !== undefined) results[rid]++;
            });
          }
        });
      }
    });
    return results;
  }, [readStatus, familyMembers]);

  const activeMember = useMemo(() =>
    familyMembers.find(m => m.id === activeMemberId) || familyMembers[0] || DEFAULT_MEMBERS[0]
    , [familyMembers, activeMemberId]);

  const activeProgress = useMemo(() => {
    const readCount = familyProgress[activeMemberId] || 0;
    return {
      totalChapters: TOTAL_CHAPTERS,
      readChapters: readCount,
      percentage: (readCount / TOTAL_CHAPTERS) * 100
    };
  }, [familyProgress, activeMemberId]);

  const goalStats = useMemo(() => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const daysPassed = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    if (totalDays <= 0) return null;

    const chaptersLeft = TOTAL_CHAPTERS - activeProgress.readChapters;
    const dailyTarget = chaptersLeft > 0 && daysRemaining > 0 ? (chaptersLeft / daysRemaining).toFixed(1) : "0";
    const expectedProgress = Math.min(100, Math.max(0, (daysPassed / totalDays) * 100));
    const isAhead = activeProgress.percentage >= expectedProgress;

    return { daysRemaining, dailyTarget, isAhead, expectedProgress, totalDays };
  }, [startDate, endDate, activeProgress]);

  const updateGlobalDate = async (field: 'startDate' | 'endDate', value: string) => {
    if (field === 'startDate') setStartDate(value);
    if (field === 'endDate') setEndDate(value);
    await setDoc(doc(db, "bible_tracker", "config"), {
      members: familyMembers,
      startDate: field === 'startDate' ? value : startDate,
      endDate: field === 'endDate' ? value : endDate
    }, { merge: true });
  };

  useEffect(() => {
    const updateMessage = async () => {
      setIsLoadingMessage(true);
      const msg = await getMotivationalMessage(activeProgress.percentage);
      setMessage(msg);
      setIsLoadingMessage(false);
    };
    if (activeProgress.readChapters > 0 && activeProgress.readChapters % 10 === 0) {
      updateMessage();
    }
  }, [activeProgress.readChapters]);

  const toggleChapter = useCallback(async (bookName: string, chapterIdx: number, isShift: boolean) => {
    if (!activeMemberId) return;

    const currentStatus = readStatusRef.current;
    const rawChapters = currentStatus[bookName] || {};
    const bookChapters: Record<string, string[]> = Array.isArray(rawChapters)
      ? rawChapters.reduce((acc, curr, idx) => ({ ...acc, [idx]: curr || [] }), {})
      : JSON.parse(JSON.stringify(rawChapters));

    let targetIndices = [chapterIdx];
    if (isShift && lastClicked && lastClicked.bookName === bookName) {
      const start = Math.min(lastClicked.index, chapterIdx);
      const end = Math.max(lastClicked.index, chapterIdx);
      targetIndices = [];
      for (let i = start; i <= end; i++) targetIndices.push(i);
    }

    const currentChapterReaders = bookChapters[chapterIdx] || [];
    const isCurrentlyRead = currentChapterReaders.includes(activeMemberId);
    const shouldBeRead = !isCurrentlyRead;

    targetIndices.forEach(idx => {
      const readers = [...(bookChapters[idx] || [])];
      const mIdx = readers.indexOf(activeMemberId);
      if (shouldBeRead) {
        if (mIdx === -1) readers.push(activeMemberId);
      } else {
        if (mIdx > -1) readers.splice(mIdx, 1);
      }
      bookChapters[idx] = readers;
    });

    setReadStatus(prev => ({ ...prev, [bookName]: bookChapters }));
    setLastClicked({ bookName, index: chapterIdx });

    try {
      await setDoc(doc(db, "bible_tracker", "status"), {
        [bookName]: bookChapters
      }, { merge: true });
    } catch (e: any) {
      console.error("저장 실패:", e);
      alert("데이터 저장 실패: " + e.message);
    }
  }, [activeMemberId, lastClicked]);

  const handleExportImage = async () => {
    if (!exportRef.current) return;
    try {
      const canvas = await html2canvas(exportRef.current, { scale: 2, backgroundColor: '#f8fafc' });
      const link = document.createElement('a');
      link.href = canvas.toDataURL();
      link.download = '우리가족_성경읽기표.png';
      link.click();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="min-h-screen pb-[28rem] md:pb-[24rem] lg:pb-[18rem] bg-slate-50 relative selection:bg-indigo-100">
      {isSettingsOpen && (
        <SettingsModal
          familyMembers={familyMembers}
          onSave={async (updated) => {
            try {
              await setDoc(doc(db, "bible_tracker", "config"), { members: updated }, { merge: true });
              setIsSettingsOpen(false);
            } catch (e: any) {
              console.error(e);
              alert("저장 실패: " + e.message);
            }
          }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      <header className="bg-indigo-600 text-white p-4 md:p-6 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-black flex items-center gap-2">
              <span className="text-2xl md:text-3xl">📖</span> 우리 가족 성경 읽기표
            </h1>
            <div className="flex items-center gap-2 mt-1 px-1">
              <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-green-400' : connectionStatus === 'error' ? 'bg-red-500' : 'bg-yellow-400 animate-pulse'}`}></div>
              <span className="text-[10px] font-bold opacity-80">
                {connectionStatus === 'connected' ? '실시간 동기화 중 (v2.8 14:00)' : connectionStatus === 'error' ? '연결 끊김 (오류)' : '연결 중...'}
              </span>
            </div>
          </div>
          <div className="flex gap-1 md:gap-2">
            <button onClick={() => setIsSettingsOpen(true)} className="bg-indigo-500 hover:bg-indigo-400 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-[10px] md:text-sm font-bold border border-indigo-400/30 transition-colors">가족 설정</button>
            <button onClick={handleExportImage} className="bg-white text-indigo-600 px-3 py-1.5 md:px-5 md:py-2 rounded-xl text-[10px] md:text-sm font-black shadow-md hover:bg-indigo-50 transition-colors">이미지 저장</button>
          </div>
        </div>
      </header>

      {/* 모바일 전용 탭 스위처 */}
      <div className="lg:hidden sticky top-[72px] md:top-[88px] z-40 bg-white/80 backdrop-blur-md border-b border-indigo-100 p-2 flex gap-2">
        <button
          onClick={() => setActiveMobileTab('reading')}
          className={`flex-1 py-3 rounded-2xl font-black text-sm transition-all ${activeMobileTab === 'reading' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
        >
          📖 성경 읽기표
        </button>
        <button
          onClick={() => setActiveMobileTab('race')}
          className={`flex-1 py-3 rounded-2xl font-black text-sm transition-all ${activeMobileTab === 'race' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
        >
          🏃‍♂️ 독서 레이스
        </button>
      </div>

      {connectionStatus === 'error' && (
        <div className="bg-red-500 text-white px-4 py-2 text-center text-sm font-bold sticky top-[136px] lg:top-[88px] z-40 shadow-md">
          🚨 데이터베이스 연결 오류: {errorMessage}
        </div>
      )}

      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-8 p-4 md:p-8">
        <div ref={exportRef} className={`flex-1 ${activeMobileTab === 'race' ? 'hidden lg:block' : 'block'}`}>
          <section className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-indigo-50 mb-10">
            <h2 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-2">오늘의 한마디</h2>
            <p className={`text-gray-800 text-lg md:text-xl italic font-bold leading-relaxed ${isLoadingMessage ? 'animate-pulse' : ''}`}>
              "{message}"
            </p>
          </section>

          <div className="space-y-12 md:space-y-16">
            {['OT', 'NT'].map(cat => (
              <div key={cat}>
                <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-6 md:mb-8 border-b-4 border-indigo-100 pb-2 inline-block">
                  {cat === 'OT' ? '구약 성경' : '신약 성경'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-8">
                  {BIBLE_BOOKS.filter(b => b.category === cat).map(book => (
                    <BookCard
                      key={book.id}
                      book={book}
                      status={readStatus[book.name] || {}}
                      activeMemberId={activeMemberId}
                      familyMembers={familyMembers}
                      onToggle={toggleChapter}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className={`lg:w-80 shrink-0 ${activeMobileTab === 'reading' ? 'hidden lg:block' : 'block'}`}>
          <div className="sticky top-28">
            <div className="bg-white rounded-[2.5rem] p-6 md:p-8 shadow-2xl border border-indigo-50 min-h-[500px] flex flex-col">
              <h3 className="text-lg md:text-xl font-black text-gray-800 mb-8 md:mb-12 flex items-center gap-2">🏃‍♂️ 독서 레이스</h3>
              <div className="flex-1 flex items-end justify-between gap-3 md:gap-4 h-80 px-2 relative">
                {familyMembers.map(member => {
                  const chaptersRead = familyProgress[member.id] || 0;
                  const percentage = (chaptersRead / TOTAL_CHAPTERS) * 100;
                  const isActive = member.id === activeMemberId;
                  return (
                    <div key={member.id} className="flex-1 flex flex-col items-center h-full group">
                      <div className="mb-2 text-[10px] font-black text-slate-400 whitespace-nowrap">{Math.round(percentage)}%</div>
                      <div className={`relative flex-1 w-full rounded-2xl bg-slate-50 flex flex-col justify-end overflow-hidden border-2 transition-all duration-500 ${isActive ? 'border-indigo-400 ring-4 ring-indigo-50' : 'border-slate-100'}`}>
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} className="w-6 h-6 md:w-8 md:h-8 rounded-full border-2 border-white shadow-md object-cover" alt="" />
                          ) : (
                            <div className={`w-6 h-6 md:w-8 md:h-8 rounded-full border-2 border-white shadow-md ${member.dotColor} flex items-center justify-center text-[8px] md:text-[10px] text-white font-bold`}>{member.name.charAt(0)}</div>
                          )}
                        </div>
                        <div className={`w-full ${member.dotColor} rounded-t-xl transition-all duration-1000 ease-out shadow-inner relative`} style={{ height: `${Math.max(5, percentage)}%` }}>
                          <div className="w-full h-full absolute top-0 left-0 bg-white/20 skew-x-[-20deg] animate-[shimmer_2s_infinite]"></div>
                        </div>
                      </div>
                      <div className={`mt-2 md:mt-4 text-[10px] md:text-xs font-black truncate w-full text-center transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>{member.name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-3xl border-t border-slate-200 p-2 md:p-6 z-[60] shadow-[0_-30px_60px_-15px_rgba(0,0,0,0.12)] lg:max-w-[90rem] lg:left-1/2 lg:-translate-x-1/2 lg:bottom-4 lg:rounded-[2.5rem] lg:border">
        <div className="max-w-full mx-auto flex flex-col gap-2 md:gap-4">
          <div className="flex flex-col lg:flex-row items-center gap-2 md:gap-8 bg-slate-50/70 p-2 md:p-4 rounded-[1.2rem] md:rounded-[1.5rem] border border-slate-100 shadow-inner">
            <div className="flex items-center gap-2 md:gap-3 bg-white px-3 py-1.5 md:px-4 md:py-2 rounded-2xl border border-slate-100 shadow-sm shrink-0">
              <div className="flex flex-col">
                <label className="text-[6px] md:text-[8px] font-black text-slate-400 uppercase mb-0.5">START</label>
                <input type="date" value={startDate} onChange={(e) => updateGlobalDate('startDate', e.target.value)} className="text-[10px] md:text-xs font-black text-slate-700 focus:outline-none bg-transparent" />
              </div>
              <div className="text-slate-300 font-black px-0.5 md:px-1">~</div>
              <div className="flex flex-col">
                <label className="text-[6px] md:text-[8px] font-black text-slate-400 uppercase mb-0.5">GOAL</label>
                <input type="date" value={endDate} onChange={(e) => updateGlobalDate('endDate', e.target.value)} className="text-[10px] md:text-xs font-black text-slate-700 focus:outline-none bg-transparent" />
              </div>
            </div>

            <div className="flex items-center justify-between lg:justify-start gap-4 md:gap-6 flex-1 w-full px-4 md:px-4 lg:border-l border-slate-200/50">
              <div className="flex items-center gap-2">
                <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase">D-DAY</span>
                <span className="text-sm md:text-xl font-black text-indigo-600 tabular-nums">{goalStats ? `D-${goalStats.daysRemaining}` : '-'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase">TARGET</span>
                <span className="text-xs md:text-base font-black text-slate-700 tabular-nums">{goalStats ? `${goalStats.dailyTarget}장/일` : '-'}</span>
              </div>
              <div className="flex-1 hidden lg:flex items-center gap-4">
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                  <div className="h-full bg-slate-400 transition-all duration-1000 ease-out" style={{ width: `${goalStats ? goalStats.expectedProgress : 0}%` }}></div>
                </div>
                <div className="text-[9px] font-black text-slate-400 whitespace-nowrap">권장 진도 {goalStats ? goalStats.expectedProgress.toFixed(0) : 0}%</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col xl:flex-row items-center gap-2 md:gap-6">
            <div className="flex flex-wrap justify-center xl:justify-start gap-1.5 md:gap-2 shrink-0">
              {familyMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => setActiveMemberId(member.id)}
                  className={`flex items-center gap-1.5 md:gap-2 px-2.5 py-1.5 md:px-3 md:py-1.5 rounded-xl font-black text-[10px] md:text-xs transition-all duration-300 transform active:scale-95 ${activeMemberId === member.id ? `${member.color} ring-2 ring-indigo-500 shadow-md scale-105` : 'bg-white text-slate-400 border border-slate-100 hover:border-indigo-200'}`}
                >
                  {member.avatarUrl ? <img src={member.avatarUrl} className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full object-cover" alt="" /> : <div className={`w-3.5 h-3.5 md:w-4 md:h-4 rounded-full ${member.dotColor}`}></div>}
                  {member.name}
                </button>
              ))}
            </div>
            <div className="flex-1 w-full flex items-center gap-3 md:gap-4 bg-white/50 px-3 py-1.5 md:px-4 md:py-2 rounded-2xl border border-slate-100">
              <div className="text-[8px] md:text-[10px] font-black text-slate-500 whitespace-nowrap">{activeMember.name}: {activeProgress.readChapters}/{TOTAL_CHAPTERS}장</div>
              <div className="flex-1 h-3 md:h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200 p-0.5">
                <div className={`h-full ${activeMember?.dotColor || 'bg-slate-400'} rounded-full transition-all duration-1000 ease-in-out relative`} style={{ width: `${activeProgress.percentage}%` }}>
                  <div className="absolute inset-0 bg-white/20 skew-x-[-45deg] animate-[shimmer_2s_infinite]"></div>
                </div>
              </div>
              <div className="text-xs md:text-sm font-black text-indigo-600 tabular-nums">{activeProgress.percentage.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

const BookCard: React.FC<{
  book: BibleBook,
  status: Record<string, string[]>,
  activeMemberId: string,
  familyMembers: FamilyMember[],
  onToggle: (bookName: string, chapterIdx: number, isShift: boolean) => void
}> = ({ book, status, activeMemberId, familyMembers, onToggle }) => {
  const readCountByActive = Object.values(status).filter((readers: string[]) => readers.includes(activeMemberId)).length;
  const isCompleteByActive = readCountByActive === book.chapters;
  return (
    <div className={`bg-white rounded-[2rem] border-2 overflow-hidden transition-all duration-300 ${isCompleteByActive ? 'border-indigo-500 shadow-xl' : 'border-slate-100 hover:border-indigo-100'}`}>
      <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
        <div>
          <h4 className="font-black text-lg text-slate-800">{book.name}</h4>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{book.chapters} Chapters</p>
        </div>
        <div className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">{Math.round((readCountByActive / book.chapters) * 100)}%</div>
      </div>
      <div className="p-5 grid grid-cols-6 gap-2">
        {Array.from({ length: book.chapters }).map((_, idx) => {
          const readers = status[idx] || [];
          const isReadByActive = readers.includes(activeMemberId);
          return (
            <button key={idx} onClick={(e) => onToggle(book.name, idx, e.shiftKey)} className={`group w-full aspect-square rounded-xl text-[10px] font-black transition-all relative flex items-center justify-center overflow-hidden ${isReadByActive ? 'bg-indigo-600 text-white shadow-md transform scale-105' : 'bg-slate-50 text-slate-300 hover:bg-slate-100'}`}>
              <span className="relative z-10">{idx + 1}</span>
              <div className="absolute bottom-1.5 flex gap-0.5 px-1 justify-center w-full">
                {familyMembers.map(member => readers.includes(member.id) && <div key={member.id} className={`w-1 h-1 rounded-full ${member.dotColor} border-[0.5px] border-white`} />)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const SettingsModal: React.FC<{
  familyMembers: FamilyMember[];
  onSave: (updated: FamilyMember[]) => Promise<void>;
  onClose: () => void;
}> = ({ familyMembers, onSave, onClose }) => {
  const [localMembers, setLocalMembers] = useState<FamilyMember[]>(JSON.parse(JSON.stringify(familyMembers)));
  const [isSaving, setIsSaving] = useState(false);
  const handleSave = async () => { setIsSaving(true); await onSave(localMembers); setIsSaving(false); };
  const handleUpdateMember = (id: string, updates: Partial<FamilyMember>) => setLocalMembers(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  const handleUpdateColor = (id: string, theme: typeof COLOR_THEMES[0]) => setLocalMembers(prev => prev.map(m => m.id === id ? { ...m, dotColor: theme.dotColor, color: theme.color } : m));
  const handleImageUpload = (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image(); img.src = reader.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas'); const MAX_SIZE = 120;
        let width = img.width; let height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } }
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.6);
          handleUpdateMember(id, { avatarUrl: compressed });
        }
      };
    };
    reader.readAsDataURL(file);
  };
  const handleAddMember = () => {
    const newId = `member_${Date.now()}`; const randomTheme = COLOR_THEMES[Math.floor(Math.random() * COLOR_THEMES.length)];
    setLocalMembers(prev => [...prev, { id: newId, name: `구성원 ${prev.length + 1}`, label: `구성원 ${prev.length + 1}`, dotColor: randomTheme.dotColor, color: randomTheme.color }]);
  };
  const handleDeleteMember = (id: string) => { if (localMembers.length <= 1) return; setLocalMembers(prev => prev.filter(m => m.id !== id)); };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-2xl font-black text-slate-800">가족 설정</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="p-8 overflow-y-auto space-y-6">
          {localMembers.map((member) => (
            <div key={member.id} className="relative group space-y-6 p-6 bg-slate-50 rounded-3xl border border-slate-100">
              <button onClick={() => handleDeleteMember(member.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <input type="file" id={`file-${member.id}`} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(member.id, e)} />
                    <label htmlFor={`file-${member.id}`} className={`cursor-pointer w-24 h-24 rounded-[2rem] ${member.dotColor} flex items-center justify-center text-white font-black shadow-lg overflow-hidden relative`}>
                      {member.avatarUrl ? <img src={member.avatarUrl} className="w-full h-full object-cover" alt="" /> : <span className="text-3xl">{member.name.charAt(0)}</span>}
                    </label>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 max-w-[120px]">
                    {COLOR_THEMES.map((theme) => <button key={theme.id} onClick={() => handleUpdateColor(member.id, theme)} className={`w-5 h-5 rounded-full ${theme.dotColor} ${member.dotColor === theme.dotColor ? 'ring-2 ring-slate-400' : ''}`} />)}
                  </div>
                </div>
                <div className="flex-1 space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">이름</label>
                  <input type="text" value={member.name} onChange={(e) => handleUpdateMember(member.id, { name: e.target.value })} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-700" />
                </div>
              </div>
            </div>
          ))}
          <button onClick={handleAddMember} className="w-full py-4 border-2 border-dashed border-slate-100 rounded-3xl text-slate-300 font-bold flex items-center justify-center gap-2">새 구성원 추가</button>
        </div>
        <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
          <button onClick={onClose} disabled={isSaving} className="flex-1 py-4 font-black text-slate-500 disabled:opacity-50">취소</button>
          <button onClick={handleSave} disabled={isSaving} className={`flex-[2] py-4 rounded-2xl font-black text-white ${isSaving ? 'bg-slate-400' : 'bg-indigo-600'}`}>{isSaving ? '저장 중...' : '설정 저장'}</button>
        </div>
      </div>
    </div>
  );
};

export default App;
