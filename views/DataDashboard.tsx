import React, { useState, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { View } from '../types';
import { weightApi, dietApi, checkinsApi } from '../api';
import type { DietSummary } from '../api';
import { generateDataInsights } from '../services/gemini';

interface Props {
    onNavigate?: (view: View) => void;
    weightData?: { date: string, val: number }[];
}




const DataDashboard: React.FC<Props> = ({ onNavigate }) => {
    const [chartTab, setChartTab] = useState<'weight' | 'fat'>('weight');
    const [weightChartData, setWeightChartData] = useState<{ date: string; val: number }[]>([]);
    const [dietSummary, setDietSummary] = useState<DietSummary | null>(null);
    const [checkinDays, setCheckinDays] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [aiLoading, setAiLoading] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [weights, diet, checkins] = await Promise.all([
                    weightApi.list().catch(() => []),
                    dietApi.summary().catch(() => null),
                    checkinsApi.list().catch(() => []),
                ]);

                // Transform weight records for chart
                if (weights.length > 0) {
                    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
                    const today = new Date().toISOString().split('T')[0];
                    setWeightChartData(sorted.map(w => {
                        if (w.date === today) return { date: '今天', val: w.weight };
                        const parts = w.date.split('-');
                        return { date: `${parseInt(parts[1])}月${parseInt(parts[2])}日`, val: w.weight };
                    }));
                }

                if (diet) setDietSummary(diet);

                // Build checkin day set for heatmap
                const days = new Set<string>();
                checkins.forEach(c => {
                    const d = c.createdAt?.split('T')[0];
                    if (d) days.add(d);
                });
                setCheckinDays(days);
            } catch (err) {
                console.error('DataDashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Fetch AI suggestions after data is loaded
    useEffect(() => {
        if (loading) return;
        const cached = sessionStorage.getItem('ai_suggestions');
        if (cached) {
            try { setAiSuggestions(JSON.parse(cached)); return; } catch { /* ignore */ }
        }
        setAiLoading(true);
        const latestWeight = weightChartData.length > 0 ? weightChartData[weightChartData.length - 1].val : undefined;
        let weightTrend = '暂无数据';
        if (weightChartData.length >= 2) {
            const diff = weightChartData[weightChartData.length - 1].val - weightChartData[0].val;
            weightTrend = diff > 0 ? `上升 ${diff.toFixed(1)}kg` : diff < 0 ? `下降 ${Math.abs(diff).toFixed(1)}kg` : '持平';
        }
        generateDataInsights({
            totalCalories: dietSummary?.totalCalories,
            totalProtein: dietSummary?.totalProtein,
            totalFat: dietSummary?.totalFat,
            totalCarbs: dietSummary?.totalCarbs,
            latestWeight,
            weightTrend,
            checkinCount: checkinDays.size,
        }).then(suggestions => {
            setAiSuggestions(suggestions);
            sessionStorage.setItem('ai_suggestions', JSON.stringify(suggestions));
        }).finally(() => setAiLoading(false));
    }, [loading, dietSummary, weightChartData, checkinDays]);

    return (
        <div className="min-h-screen pb-32 pt-6 px-6 bg-bg-dark text-white font-sans">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-serif font-bold tracking-tight">数据看板</h1>
                <button className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all">
                    <span className="material-icons-round text-gray-300">settings</span>
                </button>
            </div>

            {/* Weekly Progress Card */}
            <div className="bg-[#111] rounded-[32px] p-5 border border-white/5 mb-4 shadow-lg">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-400 mb-1">本周已完成</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold font-serif text-white">2.0</span>
                            <span className="text-sm text-gray-500">/ 5.5 小时</span>
                        </div>
                    </div>
                    <button
                        onClick={() => onNavigate?.(View.EvolutionRecord)}
                        className="flex items-center gap-2 bg-white/5 px-4 py-2.5 rounded-2xl border border-white/5 hover:bg-white/10 active:bg-white/15 transition-all group"
                    >
                        <span className="material-icons-round text-primary text-sm group-hover:scale-110 transition-transform">history</span>
                        <span className="text-xs font-bold text-gray-200">查看进化之路</span>
                    </button>
                </div>
            </div>

            {/* Calories Card */}
            <div className="bg-[#111] rounded-[32px] p-6 border border-white/5 mb-4 shadow-lg">
                <div className="flex justify-between items-start mb-2">
                    <p className="text-sm text-gray-400">消耗热量</p>
                    <span className="material-icons-round text-primary text-sm">local_fire_department</span>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-bold font-serif text-white">{dietSummary ? dietSummary.totalCalories.toLocaleString() : '--'}</span>
                    <span className="text-sm text-gray-500">kcal</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full shadow-[0_0_12px_#B8FF00]" style={{ width: `${dietSummary ? Math.min(100, (dietSummary.totalCalories / 1800) * 100) : 0}%` }}></div>
                </div>
            </div>

            {/* Weight Chart Card */}
            <div className="bg-[#111] rounded-[32px] p-6 border border-white/5 mb-4 shadow-lg">
                <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold">体重变化</h2>
                        <button onClick={() => onNavigate?.(View.WeightRecord)} className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all">
                            <span className="material-icons-round text-xs text-primary">edit</span>
                        </button>
                    </div>
                    <div className="flex bg-white/5 rounded-lg p-1">
                        <button
                            onClick={() => setChartTab('weight')}
                            className={`px-3 py-1 text-xs rounded-md transition-all ${chartTab === 'weight' ? 'bg-white/10 text-white font-bold' : 'text-gray-500'}`}
                        >
                            体重
                        </button>
                        <button
                            onClick={() => setChartTab('fat')}
                            className={`px-3 py-1 text-xs rounded-md transition-all ${chartTab === 'fat' ? 'bg-white/10 text-white font-bold' : 'text-gray-500'}`}
                        >
                            体脂
                        </button>
                    </div>
                </div>

                <div className="h-[180px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <AreaChart data={weightChartData}>
                            <defs>
                                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#B8FF00" stopOpacity={0.2} />
                                    <stop offset="95%" stopColor="#B8FF00" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-[#222] border border-white/10 px-3 py-1.5 rounded-lg shadow-xl">
                                                <p className="text-xs font-bold text-white">{`${payload[0].value} 公斤`}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                                cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="val"
                                stroke="#B8FF00"
                                strokeWidth={3}
                                fill="url(#colorVal)"
                                activeDot={{ r: 6, fill: "#B8FF00", stroke: "black", strokeWidth: 2 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                    {/* Custom X Axis Labels (Dynamic) */}
                    <div className="flex justify-between text-[10px] text-gray-500 mt-2 px-2">
                        {weightChartData.map((item, index) => (
                            <span key={index}>{item.date}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Diet Card */}
            <div className="bg-[#111] rounded-[32px] p-6 border border-white/5 mb-4 shadow-lg">
                <div className="flex justify-between items-start mb-6">
                    <h2 className="text-lg font-bold">今日饮食</h2>
                    <button className="flex items-center gap-1 bg-[#2a2a2a] text-[#B8FF00] px-3 py-1 rounded-lg text-[10px] font-bold active:scale-95 transition-transform">
                        <span className="material-icons-round text-sm">filter_center_focus</span>
                        拍照识别
                    </button>
                </div>

                <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold font-serif text-white">{dietSummary ? dietSummary.totalCalories.toLocaleString() : '--'}</span>
                        <span className="text-sm text-gray-500">kcal</span>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Protein */}
                    <div>
                        <div className="flex justify-between text-xs mb-1.5">
                            <span className="font-bold text-gray-400">蛋白质</span>
                            <span className="text-gray-500">{dietSummary ? `${dietSummary.totalProtein}g` : '--'}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden flex">
                            <div className="h-full bg-[#4A90E2] rounded-full" style={{ width: `${dietSummary ? Math.min(100, (dietSummary.totalProtein / 120) * 100) : 0}%` }}></div>
                        </div>
                    </div>
                    {/* Fat */}
                    <div>
                        <div className="flex justify-between text-xs mb-1.5">
                            <span className="font-bold text-gray-400">脂肪</span>
                            <span className="text-gray-500">{dietSummary ? `${dietSummary.totalFat}g` : '--'}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden flex">
                            <div className="h-full bg-[#F5A623] rounded-full" style={{ width: `${dietSummary ? Math.min(100, (dietSummary.totalFat / 55) * 100) : 0}%` }}></div>
                        </div>
                    </div>
                    {/* Carbs */}
                    <div>
                        <div className="flex justify-between text-xs mb-1.5">
                            <span className="font-bold text-gray-400">碳水</span>
                            <span className="text-gray-500">{dietSummary ? `${dietSummary.totalCarbs}g` : '--'}</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden flex">
                            <div className="h-full bg-[#50E3C2] rounded-full" style={{ width: `${dietSummary ? Math.min(100, (dietSummary.totalCarbs / 200) * 100) : 0}%` }}></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Activity Heatmap */}
            <div className="bg-[#111] rounded-[32px] p-6 border border-white/5 mb-4 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-sm font-bold">活动热力图</h2>
                    <span className="text-[10px] text-gray-500">过去30天</span>
                </div>

                {/* Heatmap Grid */}
                <div className="grid grid-cols-7 gap-2 mb-4">
                    {['一', '二', '三', '四', '五', '六', '日'].map((d, i) => (
                        <span key={i} className="text-[10px] text-center text-gray-600">{d}</span>
                    ))}
                    {Array.from({ length: 28 }).map((_, i) => {
                        const date = new Date();
                        date.setDate(date.getDate() - (27 - i));
                        const dateStr = date.toISOString().split('T')[0];
                        const hasCheckin = checkinDays.has(dateStr);

                        return (
                            <div
                                key={i}
                                className="aspect-square rounded-md transition-all hover:scale-110"
                                style={{
                                    backgroundColor: hasCheckin ? '#B8FF00' : 'rgba(255,255,255,0.05)',
                                    opacity: hasCheckin ? 0.8 : 1
                                }}
                            ></div>
                        );
                    })}
                </div>

                <div className="flex justify-end items-center gap-2 text-[10px] text-gray-500">
                    <span>少</span>
                    <div className="flex gap-1">
                        <div className="w-3 h-3 rounded-sm bg-white/5"></div>
                        <div className="w-3 h-3 rounded-sm bg-[#4a5900] opacity-50"></div>
                        <div className="w-3 h-3 rounded-sm bg-[#4a5900]"></div>
                        <div className="w-3 h-3 rounded-sm bg-[#B8FF00]"></div>
                    </div>
                    <span>多</span>
                </div>
            </div>

            {/* AI Suggestions */}
            <div className="bg-[#111] rounded-[32px] p-6 border border-white/5 mb-4 shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                    <span className="material-icons-round text-primary text-lg">auto_awesome</span>
                    <h2 className="text-sm font-bold font-serif">AI 下一步建议</h2>
                </div>
                {aiLoading ? (
                    <div className="space-y-3">
                        <div className="h-4 bg-white/5 rounded-full w-4/5 animate-pulse"></div>
                        <div className="h-4 bg-white/5 rounded-full w-3/5 animate-pulse"></div>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {aiSuggestions.map((tip, i) => (
                            <li key={i} className="flex items-start gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0"></div>
                                <p className="text-xs text-gray-300 leading-relaxed">{tip}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default DataDashboard;