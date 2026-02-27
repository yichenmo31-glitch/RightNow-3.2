import React from 'react';
import { View } from '../types';
import Hero3D from '../components/Hero3D';
import type { AuthUser } from '../api';

const MOTIVATION_QUOTES = [
    "除了汗水，没有任何东西能穿透现实与理想的壁垒。",
    "昨天的犹豫，是今天唯一的遗憾。",
    "你离目标（Z），只差今天这 45 分钟。",
    "痛苦是暂时的，但成就感会随你一生。",
    "不要为了舒适而妥协你的潜力。",
    "每一次力竭，都是在重塑更强大的自己。",
    "镜子不说谎，进度条也是。"
];

interface Props {
    onNavigate?: (view: View) => void;
    isProfileComplete?: boolean;
    authUser?: AuthUser | null;
}

const Dashboard: React.FC<Props> = ({ onNavigate, isProfileComplete = true, authUser }) => {
    // Incomplete State View
    if (!isProfileComplete) {
        return (
            <div className="min-h-screen bg-bg-dark flex flex-col justify-center items-center p-6 relative overflow-hidden">
                {/* Background Ambience */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none"></div>

                <div className="z-10 text-center space-y-6 animate-fade-in">
                    {/* Big RightNow Logo */}
                    <div>
                        <h1 className="text-6xl font-black font-serif italic text-white mb-2">Right<span className="text-primary">Now</span></h1>
                        <p className="text-sm text-gray-400 tracking-[0.5em] uppercase">Believing is Seeing</p>
                    </div>

                    <div className="w-16 h-1 bg-white/10 mx-auto rounded-full"></div>

                    <p className="text-gray-400 max-w-xs mx-auto text-sm leading-relaxed">
                        您尚未完成身体档案配置。<br />
                        完善数据，让 AI 为您生成未来的理想形态。
                    </p>

                    <button
                        onClick={() => onNavigate?.(View.Onboarding)}
                        className="bg-primary text-black font-bold text-lg px-10 py-4 rounded-full shadow-[0_0_25px_rgba(184,255,0,0.3)] active:scale-[0.98] transition-all flex items-center gap-2 mx-auto hover:bg-primary-dark"
                    >
                        <span>继续配置档案</span>
                        <span className="material-icons-round">arrow_forward</span>
                    </button>
                </div>
            </div>
        );
    }

    // Get a deterministic quote based on the current day of the year
    const today = new Date();
    const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24);
    const dailyQuote = MOTIVATION_QUOTES[dayOfYear % MOTIVATION_QUOTES.length];

    return (
        <div className="min-h-screen pb-24 relative overflow-hidden bg-bg-dark">
            {/* Header */}
            <div className="absolute top-0 w-full p-6 z-20 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
                <div>
                    <h1 className="text-2xl font-black font-serif italic text-white">Right<span className="text-primary">Now</span></h1>
                    <p className="text-[10px] text-gray-400 tracking-widest uppercase">Believing is Seeing</p>
                </div>
                <div className="w-10 h-10 rounded-full border border-white/20 overflow-hidden">
                    {authUser?.avatar ? (
                        <img src={authUser.avatar} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-primary/20 flex items-center justify-center">
                            <span className="text-primary text-sm font-bold">{authUser?.name?.charAt(0) || '?'}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Center Visual Area */}
            <div className="relative h-[70vh] w-full flex flex-col items-center justify-center">

                {/* --- 
                  COMMENTED OUT 2D IMAGE LOGIC
                  We reverted to the 3D model below, but keep this logic in case 
                  a static 2D poster is preferred later.
                --- */}
                {/* 
                <div className="relative w-full h-[60vh] flex justify-center items-end pb-12">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-[#B8FF00]/10 rounded-full blur-[100px] pointer-events-none"></div>
                    <img
                        src="/Z.png"
                        alt="Ideal State"
                        className="h-full object-contain relative z-10"
                        style={{ maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)' }}
                    />
                </div>
                */}

                {/* 3D Model Area */}
                <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-primary/10 rounded-full blur-[80px]"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-purple-900/20 rounded-full blur-[100px]"></div>
                <div className="w-full h-full absolute inset-0 z-10" style={{ maskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 80%, transparent 100%)' }}>
                    <Hero3D />
                </div>
            </div>

            {/* Main Stats Panel / Bottom Action */}
            <div className="absolute bottom-[100px] left-6 right-6 z-20">
                {/* Current Phase Card */}
                <div
                    onClick={() => onNavigate?.(View.EvolutionProgress)}
                    className="glass p-5 rounded-3xl border-l-4 border-l-primary relative overflow-hidden cursor-pointer active:scale-95 transition-all group shadow-[0_10px_30px_rgba(0,0,0,0.8)]"
                >
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-400 font-serif">进化进度</span>
                        <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-primary group-hover:text-black transition-colors">
                            <span className="material-icons-round text-sm">arrow_forward</span>
                        </div>
                    </div>
                    <div>
                        <span className="text-lg font-bold text-white leading-tight">查看AI预测<br />不同阶段的自己</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
