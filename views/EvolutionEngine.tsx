import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View } from '../types';
import { chatWithGemini, chatWithImage, GUIDED_QUESTIONS, FITNESS_COACH_PROMPT } from '../services/gemini';
import { fitnessPlanApi } from '../api/fitness-plan';
import { imageGenApi } from '../api/image-gen';
import type { AuthUser } from '../api';

interface Props {
  userImage?: string | null;
  userFaceImage?: string | null;
  bodyStyle?: string;
  gender?: 'male' | 'female';
  authUser?: AuthUser | null;
  onComplete: () => void;
  onNavigate?: (view: View) => void;
}

interface ChatMsg {
  id: number;
  text: string;
  sender: 'user' | 'ai';
  image?: string;
  tags?: string[];
  isTyping?: boolean;
  quickReplies?: string[];
}

const bodyStyleLabels: Record<string, string> = {
  slim: '薄肌型 · 线条分明',
  athletic: '力量型 · 均衡发展',
  muscular: '健美型 · 大框架',
  comic: '漫画型 · 轻盈纤细',
  custom: '自定义理想体型',
};

const EvolutionEngine: React.FC<Props> = ({
  userImage, userFaceImage, bodyStyle, gender, authUser, onComplete, onNavigate,
}) => {
  const [sliderVal, setSliderVal] = useState(50);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [guidedStep, setGuidedStep] = useState(-1); // -1 = initial analysis, 0-3 = guided questions
  const [collectedInfo, setCollectedInfo] = useState<Record<string, string>>({});
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [imageGenStatus, setImageGenStatus] = useState<'idle' | 'generating' | 'done'>('idle');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);

  const beforeSrc = userImage || '/ori.png';
  const afterSrc = userFaceImage || '/Z.png';

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMsg = useCallback((msg: Omit<ChatMsg, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now() + Math.random() }]);
  }, []);

  const addTyping = useCallback(() => {
    const id = Date.now() + Math.random();
    setMessages(prev => [...prev, { id, text: '...', sender: 'ai', isTyping: true }]);
    return id;
  }, []);

  const removeTyping = useCallback((typingId: number) => {
    setMessages(prev => prev.filter(m => m.id !== typingId));
  }, []);

  // Initial AI analysis on mount
  useEffect(() => {
    const styleLabel = bodyStyleLabels[bodyStyle || ''] || bodyStyle || '均衡健康';
    const intro = `正在分析你的身体数据，目标方向：「${styleLabel}」...`;
    addMsg({ text: intro, sender: 'ai' });

    const timer = setTimeout(async () => {
      if (userImage) {
        const typingId = addTyping();
        const analysis = await chatWithImage(
          `请分析这张身体照片，用户目标是「${styleLabel}」体型。给出简短的身体评估（2-3句话），然后告诉用户你已经开始为他生成理想身材图。`,
          userImage,
        );
        removeTyping(typingId);
        addMsg({
          text: analysis,
          sender: 'ai',
          tags: ['✨ 体态分析', '💪 目标锁定', '🎯 开始显化'],
        });
      } else {
        addMsg({
          text: `好的，你的目标是「${styleLabel}」体型。我已经开始为你生成理想身材的预览图。在等待的过程中，我想更了解你，这样才能给你最精准的方案。`,
          sender: 'ai',
        });
      }

      // Start guided conversation
      setTimeout(() => {
        setGuidedStep(0);
        addMsg({
          text: GUIDED_QUESTIONS[0].question,
          sender: 'ai',
          quickReplies: ['完全没有运动基础', '偶尔运动', '有规律运动习惯'],
        });
      }, 1500);
    }, 1200);

    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle sending messages
  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    addMsg({ text, sender: 'user' });
    setInputValue('');

    // If in guided conversation mode
    if (guidedStep >= 0 && guidedStep < GUIDED_QUESTIONS.length) {
      const field = GUIDED_QUESTIONS[guidedStep].field;
      setCollectedInfo(prev => ({ ...prev, [field]: text }));

      const nextStep = guidedStep + 1;

      if (nextStep < GUIDED_QUESTIONS.length) {
        // Ask next question
        const typingId = addTyping();
        const ack = await chatWithGemini(
          `用户回答了"${GUIDED_QUESTIONS[guidedStep].question}"，他的回答是："${text}"。请简短确认收到（1句话），然后自然地过渡到下一个问题："${GUIDED_QUESTIONS[nextStep].question}"`,
        );
        removeTyping(typingId);
        setGuidedStep(nextStep);
        addMsg({
          text: ack,
          sender: 'ai',
          quickReplies: getQuickReplies(nextStep),
        });
      } else {
        // All questions answered, generate plan
        setGuidedStep(-2); // -2 = plan generation mode
        const typingId = addTyping();
        addMsg({ text: '太好了，信息收集完毕！正在为你生成专属健身方案...', sender: 'ai' });
        setIsGeneratingPlan(true);

        const allInfo = { ...collectedInfo, [field]: text };
        try {
          const planText = await chatWithGemini(
            `基于以下用户信息生成健身方案摘要（3-4句话，包含饮食和训练的核心建议）：
性别：${gender === 'male' ? '男' : '女'}
目标体型：${bodyStyleLabels[bodyStyle || ''] || bodyStyle}
运动基础：${allInfo.exerciseBase || '未知'}
饮食习惯：${allInfo.dietHabit || '未知'}
作息：${allInfo.sleepPattern || '未知'}
职业：${allInfo.occupation || '未知'}`,
          );
          removeTyping(typingId);
          addMsg({ text: planText, sender: 'ai' });
          addMsg({
            text: '你的专属方案已生成！点击下方按钮确认，开始你的显化之旅。',
            sender: 'ai',
            tags: ['🍽️ 饮食方案', '💧 喝水计划', '🏋️ 训练计划'],
          });

          // Save plan to backend
          fitnessPlanApi.upsert({
            exerciseBase: allInfo.exerciseBase,
            dietHabit: allInfo.dietHabit,
            sleepPattern: allInfo.sleepPattern,
            occupation: allInfo.occupation,
            aiSummary: planText,
          }).catch(() => {});
        } catch {
          removeTyping(typingId);
          addMsg({ text: '方案生成遇到问题，但不影响你开始！', sender: 'ai' });
        }
        setIsGeneratingPlan(false);
      }
    } else {
      // Free chat mode (refinement)
      const typingId = addTyping();
      const reply = await chatWithGemini(text);
      removeTyping(typingId);
      addMsg({ text: reply, sender: 'ai' });
    }
  };

  const getQuickReplies = (step: number): string[] => {
    switch (step) {
      case 0: return ['完全没有运动基础', '偶尔运动', '有规律运动习惯'];
      case 1: return ['三餐规律，偏清淡', '经常外卖，不太规律', '有在控制饮食'];
      case 2: return ['早睡早起，睡眠好', '经常熬夜', '作息不太规律'];
      case 3: return ['办公室久坐', '需要经常走动', '体力劳动为主'];
      default: return [];
    }
  };

  const renderBottomActions = () => (
    <div className="shrink-0 pb-4">
      <button
        onClick={onComplete}
        disabled={isGeneratingPlan}
        className={`w-full py-3 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-all ${
          isGeneratingPlan
            ? 'bg-white/10 text-white/30 cursor-not-allowed'
            : 'bg-[#B8FF00] text-black shadow-[0_0_25px_rgba(184,255,0,0.3)]'
        }`}
      >
        <span>{isGeneratingPlan ? '方案生成中...' : '确认，开始显化之旅'}</span>
        <span className="material-icons-round text-lg">arrow_forward</span>
      </button>
    </div>
  );

  const renderComparison = () => (
    <div className="flex-1 relative w-full overflow-hidden bg-black" style={{ minHeight: '35%' }}>
      <div className="absolute inset-0">
        {/* Future layer (background) */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-[#B8FF00]/20 rounded-full blur-[80px]" />
          <img src={afterSrc} className="absolute inset-0 w-full h-full object-contain" alt="Ideal" />
          <div className="absolute top-16 right-5 bg-black/60 px-3 py-1 rounded-full text-[10px] text-[#B8FF00] border border-[#B8FF00]/30 z-10">未来</div>
        </div>

        {/* Current layer (foreground, clipped by slider) */}
        <div className="absolute inset-y-0 left-0 overflow-hidden border-r border-white/30" style={{ width: `${sliderVal}%`, zIndex: 10 }}>
          <div className="absolute inset-0 w-screen h-full bg-gradient-to-br from-gray-800 to-gray-900">
            <img src={beforeSrc} className="absolute inset-0 w-full h-full object-contain opacity-80" alt="Current" />
          </div>
          <div className="absolute top-16 left-5 bg-black/60 px-3 py-1 rounded-full text-[10px] text-gray-400 border border-white/10 z-10">现在</div>
        </div>

        {/* Slider handle */}
        <div
          className="absolute top-0 bottom-0 w-10 flex items-center justify-center -ml-5 z-20 cursor-ew-resize touch-none"
          style={{ left: `${sliderVal}%` }}
          onTouchMove={(e) => {
            const val = Math.min(100, Math.max(0, (e.touches[0].clientX / window.innerWidth) * 100));
            setSliderVal(val);
          }}
        >
          <div className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/50 flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            <span className="material-icons-round text-white text-sm">code</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderInput = () => (
    <div className="shrink-0 mb-2">
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-2 py-1.5">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(inputValue)}
          placeholder="告诉我你的想法..."
          className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none px-2"
        />
        <button
          onClick={() => handleSend(inputValue)}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            inputValue.trim() ? 'bg-[#B8FF00] text-black' : 'text-gray-500 bg-white/5'
          }`}
        >
          <span className="material-icons-round text-base">send</span>
        </button>
      </div>
    </div>
  );

  const renderChatPanel = () => (
    <div className={`bg-[#030305] border-t border-white/10 transition-all duration-300 ${isChatOpen ? 'h-[50%]' : 'h-14'}`}>
      {/* Drag handle */}
      <div className="flex justify-center pt-2 pb-1 cursor-pointer" onClick={() => setIsChatOpen(!isChatOpen)}>
        <div className="w-10 h-1 bg-white/20 rounded-full" />
      </div>

      {isChatOpen && (
        <div className="flex flex-col h-[calc(100%-20px)] px-4">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 mb-2 no-scrollbar">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} max-w-[90%]`}>
                  {msg.sender === 'ai' && (
                    <div className="w-5 h-5 rounded-full bg-[#B8FF00]/20 flex items-center justify-center mr-1.5 mt-1 shrink-0">
                      <span className="material-icons-round text-[9px] text-[#B8FF00]">smart_toy</span>
                    </div>
                  )}
                  <div className={`p-2.5 rounded-2xl text-xs leading-relaxed ${
                    msg.isTyping ? 'bg-white/5 text-gray-400 animate-pulse' :
                    msg.sender === 'user' ? 'bg-[#B8FF00] text-black rounded-tr-none' :
                    'bg-white/10 text-gray-200 rounded-tl-none'
                  }`}>
                    {msg.text}
                    {msg.image && <img src={msg.image} className="mt-2 w-14 h-14 object-cover rounded-lg" alt="" />}
                  </div>
                </div>

                {/* Tags */}
                {msg.tags && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5 ml-7">
                    {msg.tags.map((tag, i) => (
                      <span key={i} className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-full text-[10px] text-gray-300">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Quick replies */}
                {msg.quickReplies && (
                  <div className="flex flex-wrap gap-1.5 mt-2 ml-7">
                    {msg.quickReplies.map((reply, i) => (
                      <button key={i} onClick={() => handleSend(reply)}
                        className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-[10px] text-white hover:bg-white/10 transition-colors">
                        {reply}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          {renderInput()}

          {/* Bottom actions */}
          {renderBottomActions()}
        </div>
      )}
    </div>
  );

  // RENDER
  return (
    <div className="h-screen bg-[#030303] flex flex-col relative overflow-hidden">
      <input type="file" ref={faceInputRef} accept="image/*" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => {
            addMsg({ text: '已上传参考照片', sender: 'user', image: reader.result as string });
            addMsg({ text: '收到，正在融合特征...', sender: 'ai' });
          };
          reader.readAsDataURL(file);
        }
        e.target.value = '';
      }} />

      {/* Top Bar */}
      <div className="px-5 pt-4 pb-2 z-20 flex justify-between items-center bg-black/60 backdrop-blur-md">
        <h1 className="text-base font-bold text-white tracking-wide">AI 共创 · 理想态</h1>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/10">
          <span className="w-2 h-2 bg-[#B8FF00] rounded-full animate-pulse" />
          <span className="text-[10px] text-gray-300">显化中</span>
        </div>
      </div>

      {/* Image Comparison Area */}
      {renderComparison()}

      {/* Chat Panel */}
      {renderChatPanel()}
    </div>
  );
};

export default EvolutionEngine;
