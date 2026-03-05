import React, { useEffect, useRef, useState } from 'react';
import { View } from '../types';

interface Props {
  onBack: () => void;
  onNavigate?: (view: View) => void;
  currentFat?: number;
  targetFat?: number;
}

const STAGES_CONFIG = [
  { id: 6, top: 120, left: 200, title: '终极形态', align: 'center' },
  { id: 5, top: 380, left: 100, title: '解锁条件', desc: '保持当前状态 2 周即可解锁', align: 'left' },
  { id: 4, top: 620, left: 300, title: '进阶', desc: '力量提升 5%，肌肉线条更明显', align: 'right' },
  { id: 3, top: 880, left: 300, title: '下一阶段', desc: '完成 5 个有氧任务即可到达', align: 'right' },
  { id: 2, top: 1140, left: 100, title: '初见成效', desc: '基础代谢稳定，减脂进入快车道', align: 'left' },
  { id: 1, top: 1400, left: 100, title: '起步', desc: '建立规律的运动习惯，控制饮食', align: 'left' },
  { id: 0, top: 1650, left: 200, title: '当前状态', align: 'center' },
];

const EvolutionProgress: React.FC<Props> = ({ onBack, currentFat = 28, targetFat = 15 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showBanner, setShowBanner] = useState(true);

  // Auto scroll to bottom smoothly
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const step = (currentFat - targetFat) / 6;

  return (
    <div
      className="h-screen bg-[#050505] overflow-y-auto overflow-x-hidden font-sans select-none scroll-smooth relative"
      ref={containerRef}
    >
      {/* Top Header Fixed */}
      <div className="fixed top-0 w-full flex items-center justify-between px-6 py-5 z-50 bg-gradient-to-b from-[#050505] via-[#050505]/80 to-transparent">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-[#111] border border-white/5 shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform">
          <span className="material-icons-round text-lg">close</span>
        </button>
        <div className="px-5 py-2 rounded-full bg-black/80 backdrop-blur-md border border-[#B8FF00]/30 shadow-[0_0_15px_rgba(184,255,0,0.1)]">
          <span className="text-xs text-[#B8FF00] font-bold tracking-widest uppercase">进化路径</span>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#111] border border-white/5 shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform">
          <span className="material-icons-round text-lg">settings</span>
        </button>
      </div>

      <div className="relative w-full max-w-[400px] h-[1900px] mx-auto mt-32 pb-40">

        <svg className="absolute inset-0 w-full h-[1900px] z-0 pointer-events-none" viewBox="0 0 400 1900" preserveAspectRatio="xMidYMid slice">
          {/* Dashed background path */}
          <path
            d="M 200,120
               C 200,280 100,280 100,380
               C 100,520 300,520 300,620
               C 300,760 300,760 300,880
               C 300,1020 100,1020 100,1140
               C 100,1280 100,1280 100,1400
               C 100,1540 200,1540 200,1650
               L 200,1800"
            stroke="#B8FF00"
            strokeWidth="1.5"
            strokeDasharray="6 6"
            fill="none"
            opacity="0.6"
          />
        </svg>

        {/* Nodes */}
        {STAGES_CONFIG.map((conf) => {
          const bodyFat = Math.round(currentFat - (step * conf.id));
          const isGoal = conf.id === 6;
          const isCurrent = conf.id === 0;
          const isLocked = !isGoal && !isCurrent;

          if (isGoal) {
            return (
              <div key={conf.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10" style={{ top: conf.top, left: conf.left }}>
                <div className="relative">
                  {/* Pulsing Gold Glow Outer Shell */}
                  <div className="absolute -inset-4 bg-[#FFD700]/20 blur-2xl rounded-full animate-pulse-slow"></div>
                  <div className="absolute -inset-1 bg-gradient-to-b from-[#FFD700]/60 to-transparent blur-md rounded-[2rem]"></div>

                  <div className="w-[150px] h-[190px] rounded-[1.8rem] bg-black border-[2.5px] border-[#FFD700] flex items-center justify-center shadow-[0_0_50px_rgba(255,215,0,0.4),inset_0_0_20px_rgba(255,215,0,0.3)] relative overflow-hidden group">
                    {/* Golden Vignette Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#FFD700]/20 to-transparent opacity-80 z-20 pointer-events-none mix-blend-screen"></div>

                    {/* Actual AI Image */}
                    <img src="/progress/Z.png" className="w-full h-full object-cover object-top relative z-10 brightness-[1.15] contrast-[1.2] saturate-150" alt="Goal" />

                    {/* Light Sweep Animation */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-[#FFF]/40 to-transparent -translate-x-full animate-[shimmer_3s_ease-out_infinite] z-20 mix-blend-overlay"></div>

                    {/* Bottom Dark Gradient for readability of anything inside */}
                    <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-black via-black/40 to-transparent z-10"></div>
                  </div>

                  {/* Decorative Elements */}
                  <div className="absolute -top-7 left-0 right-0 flex items-center justify-center animate-bounce z-30 drop-shadow-[0_0_15px_#FFD700]">
                    <span className="text-4xl leading-none" role="img" aria-label="crown">👑</span>
                  </div>
                  <div className="absolute -bottom-2 -left-3 animate-pulse">
                    <span className="material-icons-round text-[#FFD700]/80 text-xl blur-[1px]">flare</span>
                  </div>
                </div>

                <div className="mt-5 bg-[#120a00]/90 backdrop-blur-md px-6 py-2.5 rounded-xl border border-[#FFD700]/40 text-center shadow-[0_10px_30px_rgba(255,215,0,0.2)] relative z-20">
                  <h3 className="text-[#FFD700] font-black text-[15px] tracking-widest drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]">终极形态</h3>
                  <p className="text-[#FFD700]/70 text-[10px] tracking-wider mt-1 font-bold">目标: {targetFat}% 体脂</p>
                </div>
              </div>
            );
          }

          if (isCurrent) {
            return (
              <div key={conf.id} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10" style={{ top: conf.top, left: conf.left }}>
                <div className="w-[170px] h-[210px] rounded-[1.5rem] bg-black border-[1.5px] border-[#B8FF00] overflow-hidden flex flex-col relative shadow-[0_0_40px_rgba(184,255,0,0.15)] glow-neon">
                  <img src="/progress/ori.png" className="w-full h-full object-cover object-top opacity-90" alt="Current" />

                  <div className="absolute top-0 w-full h-1 bg-[#B8FF00]/60"></div>
                  <div className="absolute bottom-0 w-full bg-gradient-to-t from-black via-black/90 to-transparent pt-12 pb-4 text-center">
                    <h3 className="text-[#B8FF00] font-black italic text-4xl drop-shadow-md tracking-tighter">
                      {currentFat}%<span className="text-[12px] not-italic ml-1 opacity-80">体脂</span>
                    </h3>
                    <p className="text-white/80 text-[10px] uppercase font-bold tracking-[0.2em] mt-1">{conf.title}</p>
                  </div>
                </div>
                {/* Glowing tail dot */}
                <div className="absolute -bottom-10 w-2 h-2 rounded-full bg-[#B8FF00] shadow-[0_0_15px_#B8FF00] border-2 border-[#B8FF00]"></div>
                <div className="absolute -bottom-10 w-1 h-[40px] bg-gradient-to-t from-[#B8FF00] to-transparent -z-10 opacity-50"></div>

                {/* You Are Here Arrow Indicator */}
                <div className="absolute -left-[85px] top-1/2 -translate-y-1/2 flex items-center animate-bounce-x">
                  <div className="bg-[#B8FF00] text-black text-[11px] font-bold px-2 py-1.5 rounded-sm shadow-[0_0_10px_#B8FF00]">当前状态</div>
                  <div className="w-4 h-4 bg-[#B8FF00] rotate-45 -ml-2 rounded-sm transform translate-x-[4px]"></div>
                </div>
              </div>
            );
          }

          const isNextStage = conf.id === 1;

          // Intermediate Nodes
          return (
            <div key={conf.id} className="absolute -translate-x-1/2 -translate-y-1/2 z-10" style={{ top: conf.top, left: conf.left }}>
              {isNextStage ? (
                // Stage 1: Revealed Next Goal (Shows clear photo but maintains 'to be unlocked' badge)
                <div className="w-[170px] h-[210px] rounded-[1.5rem] bg-black border border-[#B8FF00]/40 overflow-hidden relative shadow-[0_0_20px_rgba(184,255,0,0.15)]">
                  <img src={`/progress/${bodyFat}%25.png`} className="w-full h-full object-cover object-top opacity-90" alt={`Next Stage ${conf.id}`} onError={(e) => { e.currentTarget.style.display = 'none'; }} />

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent pt-12 pb-3 flex flex-col items-center">
                    <span className="text-[#B8FF00] font-black text-2xl italic tracking-tighter drop-shadow-md">{bodyFat}%</span>
                    <div className="flex items-center gap-1 mt-1 opacity-90 bg-[#B8FF00]/10 px-2.5 py-0.5 rounded-full border border-[#B8FF00]/30">
                      <span className="material-icons-round text-[10px] text-[#B8FF00]">lock_open</span>
                      <span className="text-[9px] text-[#B8FF00] font-bold tracking-widest">下阶目标</span>
                    </div>
                  </div>
                </div>
              ) : (
                // Stages 2-5: Locked Future Goals (No photo, just lock badge)
                <div className="w-[170px] h-[210px] rounded-[1.5rem] bg-[#0a0a0a] border-[1px] border-white/5 flex flex-col items-center justify-center relative shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden">
                  {/* Subtle Tech Pattern Background */}
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[length:10px_10px] pointer-events-none opacity-20"></div>

                  <div className="relative z-20 flex flex-col items-center">
                    <span className="text-gray-600 font-black text-4xl italic tracking-tighter drop-shadow-md">{bodyFat}%</span>
                    <div className="flex items-center gap-1 mt-3 opacity-60 bg-black/60 px-3 py-1 rounded-full border border-white/5">
                      <span className="material-icons-round text-[12px] text-gray-500">lock</span>
                      <span className="text-[10px] text-gray-500 font-bold tracking-widest">待解锁</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Floating desc text */}
              <div className={`absolute top-1/2 -translate-y-1/2 w-48 ${conf.align === 'left' ? 'left-[calc(100%+24px)] text-left' : 'right-[calc(100%+24px)] text-right'}`}>
                <h4 className="text-gray-300 text-[12px] font-bold tracking-wider">{conf.title}</h4>
                <p className="text-gray-500 text-[10px] mt-1 tracking-wider leading-relaxed pr-2">{conf.desc}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating AI Predictive Banner */}
      {showBanner && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-[360px] bg-[#0c0c0c]/90 backdrop-blur-2xl border border-white/5 rounded-3xl p-4 flex gap-4 items-center shadow-[0_20px_40px_rgba(0,0,0,0.9)] z-50 animate-in fade-in slide-in-from-bottom-5 duration-500">
          <div className="w-12 h-12 bg-[#B8FF00] rounded-full flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(184,255,0,0.2)]">
            <span className="material-icons-round text-black md-24">share</span>
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1">
              <h4 className="text-white font-bold text-[13px] tracking-widest">AI 预测</h4>
              <span className="text-[9px] px-2 py-0.5 bg-white/10 rounded uppercase text-gray-400 font-mono tracking-widest">180 天</span>
            </div>
            <p className="text-gray-400 text-[10px] leading-relaxed">
              基于你当前的轨迹，如果蛋白质摄入量增加 10%，你将在 11 月中旬解锁 <strong className="text-[#B8FF00]">22% 节点</strong>。
            </p>
          </div>
          <button
            onClick={() => setShowBanner(false)}
            className="w-10 h-10 rounded-full bg-white/5 flex flex-col gap-1 items-center justify-center shrink-0 border border-white/5 cursor-pointer active:scale-95 transition-transform hover:bg-white/10"
          >
            <span className="material-icons-round text-gray-400 text-[16px]">visibility_off</span>
          </button>
        </div>
      )}

      <style>{`
        .glow-neon {
          box-shadow: 0 0 20px rgba(184,255,0,0.1), inset 0 0 40px rgba(0,0,0,1);
        }
        @keyframes scan {
          0%, 100% { transform: translateY(-100%); opacity: 0; }
          10%, 90% { opacity: 1; }
          50% { transform: translateY(200%); }
        }
        @keyframes shimmer {
          0% { transform: translateX(-150%) skewX(-15deg); }
          100% { transform: translateX(150%) skewX(-15deg); }
        }
        @keyframes bounce-x {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-4px); }
        }
        .animate-bounce-x {
          animation: bounce-x 1s ease-in-out infinite;
        }
      `}</style>
    </div >
  );
};

export default EvolutionProgress;