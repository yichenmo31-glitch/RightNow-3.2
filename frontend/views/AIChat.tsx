import React, { useEffect, useRef, useState } from 'react';
import { aiCoachApi, authApi, trainingSessionApi } from '../api';
import type {
  CoachAssessment,
  CoachIntakePayload,
  FirstDayPlan,
  FirstDayPlanContext,
  OnboardingProfile,
  OnboardingProfileInput,
  StrengthAnchor,
} from '../api/ai-coach';
import { onboardingApi } from '../api/ai-coach';
import {
  chatWithGemini,
  buildPersonalizedCoachPrompt,
  FITNESS_COACH_PROMPT,
  generateFirstDayPlan,
  COACH_WELCOME_MESSAGE,
  STAGE1_ASSESSMENT_PROMPT,
  STAGE2_EXPECTATION_PROMPT,
  STAGE3_NUTRITION_PROMPT,
  STAGE4_TRAINING_PROMPT,
} from '../services/gemini';
import type { GeminiMessage, UserProfileContext } from '../services/gemini';
import { View } from '../types';
import AssessmentCard, { type AssessmentData } from '../components/coach/AssessmentCard';
import FirstDayPlanCard, { type FirstDayPlanData } from '../components/coach/FirstDayPlanCard';
import IntakeQuestion, { type QuestionType } from '../components/coach/IntakeQuestion';

interface Props {
  onBack: () => void;
  coachTrigger?: boolean;
  mode?: 'coach' | 'training';
  sessionId?: string;
  onNavigate?: (view: View, data?: any) => void;
}

interface DisplayMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  time: string;
}

interface IntakeAnswerState {
  trainingExperience?: string;
  injuryHistory?: string;
  trainingDaysPerWeek?: number;
  sessionDurationMinutes?: number;
  trainingEnvironment?: string;
  timePreference?: string;
  strengthAnchorsRaw?: string;
  dietEnvironment?: string;
  typicalBreakfast?: string;
  typicalLunch?: string;
  typicalDinner?: string;
  alcoholFrequency?: string;
  snackFrequency?: string;
  diningOutFrequency?: string;
  sleepHours?: number;
  sleepQuality?: string;
  stressLevel?: string;
  cardioType?: string;
  cardioFrequency?: string;
  stepsPerDay?: number;
  motivationLevel?: string;
  biggestChallenge?: string;
  targetAreas?: string[];
}

type IntakeCategory =
  | 'training_background'
  | 'training_conditions'
  | 'strength_anchors'
  | 'diet_environment'
  | 'recovery_lifestyle'
  | 'goals_motivation';

interface CoachIntakeStep {
  key: keyof IntakeAnswerState;
  category: IntakeCategory;
  question: string;
  type: QuestionType;
  options: string[];
  mapAnswer: (answer: string | string[]) => string | number | string[];
}

const INTAKE_CATEGORY_LABELS: Record<IntakeCategory, string> = {
  training_background: '训练背景',
  training_conditions: '训练条件',
  strength_anchors: '力量锚点',
  diet_environment: '饮食环境',
  recovery_lifestyle: '恢复与生活',
  goals_motivation: '目标与动机',
};

const EXTENDED_INTAKE_STEPS: CoachIntakeStep[] = [
  // ── 训练背景 (2题) ──
  {
    key: 'trainingExperience',
    category: 'training_background',
    question: '你现在的训练经验更接近哪种情况？',
    type: 'single',
    options: ['零基础，刚开始接触', '练过但不稳定，断断续续', '训练较稳定，能独立安排', '经验丰富，系统训练2年以上'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '练过但不稳定'),
  },
  {
    key: 'injuryHistory',
    category: 'training_background',
    question: '目前最需要我重点规避的身体限制是？',
    type: 'single',
    options: ['无明显限制', '膝关节不适', '腰背不适', '肩颈不适', '手腕/手肘不适', '其他需要注意'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '无明显限制'),
  },

  // ── 训练条件 (4题) ──
  {
    key: 'trainingDaysPerWeek',
    category: 'training_conditions',
    question: '你每周能稳定训练几天？（现实一点）',
    type: 'frequency',
    options: ['每周3天', '每周4天', '每周5天', '每周6天'],
    mapAnswer: (answer) => {
      const raw = typeof answer === 'string' ? answer : '';
      const days = Number(raw.replace(/[^0-9]/g, ''));
      return Number.isFinite(days) && days >= 3 ? days : 3;
    },
  },
  {
    key: 'sessionDurationMinutes',
    category: 'training_conditions',
    question: '每次训练你平均能投入多长时间？',
    type: 'single',
    options: ['30分钟', '45分钟', '60分钟', '75分钟', '90分钟'],
    mapAnswer: (answer) => {
      const raw = typeof answer === 'string' ? answer : '';
      const minutes = Number(raw.replace(/[^0-9]/g, ''));
      return Number.isFinite(minutes) && minutes > 0 ? minutes : 45;
    },
  },
  {
    key: 'trainingEnvironment',
    category: 'training_conditions',
    question: '你主要在哪里训练？',
    type: 'single',
    options: ['商业健身房', '居家训练', '两者都有'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '商业健身房'),
  },
  {
    key: 'timePreference',
    category: 'training_conditions',
    question: '你一般计划在什么时候训练？',
    type: 'single',
    options: ['早饭前', '早饭后', '午饭前', '午饭后', '晚饭前', '晚饭后', '不固定'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '晚饭后'),
  },

  // ── 力量锚点 (1题，自由输入) ──
  {
    key: 'strengthAnchorsRaw',
    category: 'strength_anchors',
    question: '说说你近期的力量水平吧——比如卧推/深蹲/下拉能做多重、几次、是否接近力竭？\n\n（例如："卧推60kg 8次接近力竭，高位下拉50kg 12次"）',
    type: 'text',
    options: [],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : ''),
  },

  // ── 饮食环境 (6题) ──
  {
    key: 'dietEnvironment',
    category: 'diet_environment',
    question: '你的日常饮食主要靠什么？',
    type: 'single',
    options: ['主要在家自己做', '主要吃食堂', '主要点外卖', '混合，差不多各占一半'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '混合'),
  },
  {
    key: 'typicalBreakfast',
    category: 'diet_environment',
    question: '你早餐一般吃什么？',
    type: 'single',
    options: ['包子/油条/煎饼等中式早餐', '面包/牛奶/麦片等西式', '经常不吃早餐', '不固定'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '不固定'),
  },
  {
    key: 'typicalLunch',
    category: 'diet_environment',
    question: '午餐一般怎么解决？',
    type: 'single',
    options: ['食堂/公司餐', '外卖', '自带便当', '不固定'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '外卖'),
  },
  {
    key: 'typicalDinner',
    category: 'diet_environment',
    question: '晚餐通常怎么吃？',
    type: 'single',
    options: ['在家做', '外卖', '外食/聚餐', '吃得很少或不吃'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '在家做'),
  },
  {
    key: 'alcoholFrequency',
    category: 'diet_environment',
    question: '喝酒的频率大概是？',
    type: 'single',
    options: ['基本不喝', '偶尔社交喝一点', '每周都喝', '几乎天天喝'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '基本不喝'),
  },
  {
    key: 'snackFrequency',
    category: 'diet_environment',
    question: '零食/夜宵的频率？',
    type: 'single',
    options: ['基本不吃', '偶尔吃', '经常吃', '每天都吃'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '偶尔吃'),
  },

  // ── 恢复与生活 (5题) ──
  {
    key: 'sleepHours',
    category: 'recovery_lifestyle',
    question: '你平均每天睡几个小时？',
    type: 'single',
    options: ['5小时以下', '5-6小时', '6-7小时', '7-8小时', '8小时以上'],
    mapAnswer: (answer) => {
      const raw = typeof answer === 'string' ? answer : '6-7小时';
      const h = Number(raw.replace(/[^0-9]/g, ''));
      return Number.isFinite(h) ? h : 6.5;
    },
  },
  {
    key: 'sleepQuality',
    category: 'recovery_lifestyle',
    question: '睡眠质量怎么样？',
    type: 'single',
    options: ['很好，一觉到天亮', '还行，偶尔醒', '一般，入睡困难或易醒', '很差，长期睡眠不足'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '还行'),
  },
  {
    key: 'stressLevel',
    category: 'recovery_lifestyle',
    question: '最近压力大吗？（工作/学业/生活）',
    type: 'single',
    options: ['压力很小', '正常水平', '有点大', '非常大'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '正常水平'),
  },
  {
    key: 'cardioType',
    category: 'recovery_lifestyle',
    question: '平时有做有氧/户外运动吗？',
    type: 'single',
    options: ['跑步', '骑车', '游泳', '球类运动', '基本不做有氧'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '基本不做有氧'),
  },
  {
    key: 'stepsPerDay',
    category: 'recovery_lifestyle',
    question: '每天大概走多少步？',
    type: 'single',
    options: ['3000步以下', '3000-6000步', '6000-10000步', '10000步以上'],
    mapAnswer: (answer) => {
      const raw = typeof answer === 'string' ? answer : '6000-10000步';
      const s = Number(raw.replace(/[^0-9]/g, ''));
      return Number.isFinite(s) ? s : 8000;
    },
  },

  // ── 目标与动机 (3题) ──
  {
    key: 'motivationLevel',
    category: 'goals_motivation',
    question: '你对这次健身改变的决心有多大？',
    type: 'single',
    options: ['试试看，不一定坚持', '有一定决心，但怕坚持不了', '比较坚定，会努力执行', '非常坚定，这次一定要做到'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '比较坚定'),
  },
  {
    key: 'biggestChallenge',
    category: 'goals_motivation',
    question: '你觉得坚持健身最大的挑战会是什么？',
    type: 'single',
    options: ['工作/学习太忙，没时间', '管不住嘴，饮食难控', '容易懒，缺乏动力', '不知道练得对不对', '应酬/社交太多'],
    mapAnswer: (answer) => (typeof answer === 'string' ? answer : '工作太忙'),
  },
  {
    key: 'targetAreas',
    category: 'goals_motivation',
    question: '最想优先改善哪些部位？（可多选）',
    type: 'multi',
    options: ['胸部', '背部', '肩部', '手臂', '腹部/核心', '腿部', '臀部'],
    mapAnswer: (answer) => (Array.isArray(answer) ? answer : typeof answer === 'string' ? [answer] : []),
  },
];

const TOTAL_INTAKE_STEPS = EXTENDED_INTAKE_STEPS.length;

const getMuscleLabel = (muscle?: string): string => {
  if (!muscle) {
    return MUSCLE_LABELS.general;
  }
  const key = muscle.toLowerCase();
  return MUSCLE_LABELS[key] || muscle;
};

const parsePercent = (value: string): number | null => {
  const numberValue = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numberValue) ? numberValue : null;
};

const formatPercent = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  return `${Math.round(value * 10) / 10}%`;
};

const buildTrainingModePrompt = (session: any, profile: UserProfileContext): string => {
  const todos = Array.isArray(session?.contextData?.todayTodos)
    ? session.contextData.todayTodos
        .map((t: any) => (typeof t?.title === 'string' ? t.title.trim() : ''))
        .filter((t: string) => t.length > 0)
    : [];
  const targetMuscle = getMuscleLabel(session?.contextData?.targetMuscle || 'general');
  const lastCycleHistory = session?.contextData?.lastCycleHistory
    ? JSON.stringify(session.contextData.lastCycleHistory)
    : '无';

  return buildPersonalizedCoachPrompt(
    [
      FITNESS_COACH_PROMPT,
      '你现在处于训练模式，请严格按训练教练角色输出。',
      `本次目标肌群：${targetMuscle}`,
      `今日训练任务：${todos.length > 0 ? todos.join('，') : '暂无'}`,
      `最近训练历史：${lastCycleHistory}`,
      '回答要求：中文、简洁、可执行、优先给出当前一组训练指令。',
      FREE_CHAT_PROMPT_SUFFIX,
    ].join('\n'),
    profile,
  );
};

const mapAssessmentToCardData = (assessment: CoachAssessment): AssessmentData => {
  const currentBodyFat =
    typeof assessment.bodyFatEstimate === 'number' ? assessment.bodyFatEstimate : Math.max(12, assessment.bmi * 0.9);
  const defaultTarget =
    assessment.goalDirection === 'muscle_gain'
      ? currentBodyFat
      : Math.max(10, currentBodyFat - (assessment.goalDirection === 'recomposition' ? 3 : 5));
  const targetBodyFat =
    typeof assessment.targetBodyFatEstimate === 'number'
      ? assessment.targetBodyFatEstimate
      : defaultTarget;
  const minWeeks = Math.max(8, assessment.targetWeeks || 12);

  return {
    currentBodyFat: formatPercent(currentBodyFat),
    targetBodyFat: formatPercent(targetBodyFat),
    goalDirection: GOAL_DIRECTION_LABELS[assessment.goalDirection] || '综合优化',
    bmr: Number.isFinite(assessment.bmr) ? assessment.bmr : 0,
    bmi: Number.isFinite(assessment.bmi) ? assessment.bmi : 0,
    tdee: Number.isFinite(assessment.tdee) ? assessment.tdee : 0,
    phaseJudgment: STAGE_LABELS[assessment.stage] || '评估中',
    recommendedCycle: `${minWeeks}周`,
    minWeeks,
    isVisualAssessment: Boolean(assessment.isVisualAssessment),
  };
};

const toFirstDayCardData = (plan: FirstDayPlan): FirstDayPlanData => ({
  title: plan.headline || '今日训练计划',
  description: plan.coachMessage || '计划已生成，按顺序完成即可。',
  tasks: (Array.isArray(plan.tasks) ? plan.tasks : []).map((task, index) => ({
    id: task.id || `task-${index + 1}`,
    title: task.title || `任务 ${index + 1}`,
    subtitle: task.detail || '',
    icon: TASK_ICON_MAP[task.category] || 'task_alt',
    type:
      task.category === 'nutrition'
        ? 'diet'
        : task.category === 'recovery'
          ? 'hydration'
          : 'workout',
  })),
});

const buildAssessmentSummary = (assessment: CoachAssessment): string => {
  const currentBodyFat =
    typeof assessment.bodyFatEstimate === 'number' ? `${assessment.bodyFatEstimate}%` : '未知';
  const targetBodyFat =
    typeof assessment.targetBodyFatEstimate === 'number' ? `${assessment.targetBodyFatEstimate}%` : '待确认';

  return [
    `当前体脂：${currentBodyFat}`,
    `目标体脂：${targetBodyFat}`,
    `BMI：${assessment.bmi}`,
    `BMR：${assessment.bmr}`,
    `TDEE：${assessment.tdee}`,
    `目标方向：${GOAL_DIRECTION_LABELS[assessment.goalDirection] || assessment.goalDirection}`,
    `目标周期：${assessment.targetWeeks}周`,
  ].join('；');
};

const buildIntakeSummary = (context: FirstDayPlanContext): string | undefined => {
  if (!context.intake) {
    return undefined;
  }

  return [
    `训练经验：${context.intake.trainingExperience}`,
    `限制情况：${context.intake.injuryHistory}`,
    `每周训练：${context.intake.trainingDaysPerWeek}天`,
    `单次时长：${context.intake.sessionDurationMinutes}分钟`,
  ].join('；');
};

const buildConstraintList = (context: FirstDayPlanContext): string[] => {
  const constraints: string[] = [];
  if (typeof context.constraints?.minTrainingDays === 'number') {
    constraints.push(`每周训练天数不低于 ${context.constraints.minTrainingDays} 天`);
  }
  if (context.constraints?.hardRejectUnderMinDays) {
    constraints.push('低于最低训练频率时，需要先做频率纠偏');
  }
  return constraints;
};

const AIChat: React.FC<Props> = ({
  onBack,
  coachTrigger,
  mode = 'coach',
  sessionId,
  onNavigate,
}) => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [trainingSession, setTrainingSession] = useState<any>(null);
  const [coachStage, setCoachStage] = useState<CoachFlowStage>('idle');
  const [coachError, setCoachError] = useState<string | null>(null);
  const [assessmentData, setAssessmentData] = useState<AssessmentData | null>(null);
  const [assessmentConfirmed, setAssessmentConfirmed] = useState(false);
  const [intakeStepIndex, setIntakeStepIndex] = useState(0);
  const [intakeAnswers, setIntakeAnswers] = useState<IntakeAnswerState>({});
  const [firstDayPlanData, setFirstDayPlanData] = useState<FirstDayPlanData | null>(null);
  const [onboardingStarted, setOnboardingStarted] = useState(false);
  const [onboardingProfile, setOnboardingProfile] = useState<OnboardingProfile | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const freeChatHistoryRef = useRef<GeminiMessage[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfileContext>({});

  const addMessage = (sender: 'user' | 'ai', text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${sender}-${Date.now()}-${Math.random()}`,
        sender,
        text,
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ]);
  };

  const appendTrainingLog = async (role: 'user' | 'assistant', content: string) => {
    if (mode !== 'training' || !sessionId) {
      return;
    }

    try {
      await trainingSessionApi.updateLog(sessionId, { role, content });
    } catch {
      // Best effort only: chat should continue even if log write fails.
    }
  };

  const prepareAndSaveFirstPlan = async (preparedContext?: FirstDayPlanContext) => {
    setCoachStage('generating');
    setCoachError(null);

    const context = preparedContext || (await aiCoachApi.prepareFirstPlan());
    const generatedPlan: FirstDayPlan = await generateFirstDayPlan({
      assessmentSummary: buildAssessmentSummary(context.assessment),
      intakeSummary: buildIntakeSummary(context),
      dayIndex: 1,
      constraints: buildConstraintList(context),
    });

    const saveResult = await aiCoachApi.saveFirstPlan(generatedPlan);
    const finalPlan = saveResult?.plan || generatedPlan;
    setFirstDayPlanData(toFirstDayCardData(finalPlan));
    setCoachStage('first_plan');
    addMessage('ai', finalPlan.coachMessage || '首日计划已完成，先做第一项，我们一会儿复盘。');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, coachStage, firstDayPlanData, assessmentData, intakeStepIndex]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setMessages([]);
      setInputValue('');
      setSending(false);
      setTrainingSession(null);
      setCoachStage('idle');
      setCoachError(null);
      setAssessmentData(null);
      setAssessmentConfirmed(false);
      setIntakeStepIndex(0);
      setIntakeAnswers({});
      setFirstDayPlanData(null);
      setOnboardingStarted(false);
      setOnboardingProfile(null);
      freeChatHistoryRef.current = [];

      // Fetch user profile + coach assessment for personalized AI context
      try {
        const [authUser, coachAssessment] = await Promise.all([
          authApi.me(),
          aiCoachApi.getAssessment().catch(() => null),
        ]);
        if (!cancelled) {
          setUserProfile({
            gender: authUser.gender,
            height: authUser.height,
            weight: authUser.weight,
            age: authUser.age,
            bodyStyle: authUser.bodyStyle,
            goalWeight: authUser.goalWeight,
            goalDirection: (coachAssessment as CoachAssessment | null)?.goalDirection,
            stage: (coachAssessment as CoachAssessment | null)?.stage,
            bmi: (coachAssessment as CoachAssessment | null)?.bmi,
            bmr: (coachAssessment as CoachAssessment | null)?.bmr,
            tdee: (coachAssessment as CoachAssessment | null)?.tdee,
            bodyFatEstimate: (coachAssessment as CoachAssessment | null)?.bodyFatEstimate,
          });
        }
      } catch {
        // Non-critical: chat works without personalized context
      }

      if (mode === 'training' && sessionId) {
        try {
          const session = await trainingSessionApi.get(sessionId);
          if (cancelled) {
            return;
          }

          setTrainingSession(session);
          addMessage('ai', '训练模式已开启，我会根据今日计划带你完成训练。');

          const todos = Array.isArray(session?.contextData?.todayTodos)
            ? session.contextData.todayTodos
                .map((t: any) => (typeof t?.title === 'string' ? t.title.trim() : ''))
                .filter((t: string) => t.length > 0)
            : [];
          addMessage('ai', `今日训练任务：${todos.length > 0 ? todos.join('，') : '暂无'}`);

          const targetMuscle = session?.contextData?.targetMuscle || 'general';
          addMessage('ai', `本次目标肌群：${getMuscleLabel(targetMuscle)}`);
        } catch {
          if (!cancelled) {
            addMessage('ai', '训练会话加载失败，但你仍可以继续聊天。');
          }
        }
        return;
      }

      // ── 加载用户建档数据 ──
      try {
        const profile = await onboardingApi.getProfile();
        if (!cancelled && profile) {
          setOnboardingProfile(profile);
          // 将建档数据注入 userProfile
          setUserProfile(prev => ({
            ...prev,
            trainingExperience: profile.trainingExperience,
            injuryHistory: profile.injuryHistory,
            trainingDaysPerWeek: profile.weeklyTrainingDays,
            sessionDurationMinutes: profile.sessionDurationMinutes,
            trainingEnvironment: profile.trainingEnvironment,
            timePreference: profile.timePreference,
            strengthAnchors: profile.strengthAnchors ? JSON.stringify(profile.strengthAnchors) : undefined,
            dietEnvironment: profile.dietEnvironment,
            typicalBreakfast: profile.typicalBreakfast,
            typicalLunch: profile.typicalLunch,
            typicalDinner: profile.typicalDinner,
            alcoholFrequency: profile.alcoholFrequency,
            snackFrequency: profile.snackFrequency,
            diningOutFrequency: profile.diningOutFrequency,
            sleepHours: profile.sleepHours,
            sleepQuality: profile.sleepQuality,
            stressLevel: profile.stressLevel,
            cardioType: profile.cardioType,
            cardioFrequency: profile.cardioFrequency,
            stepsPerDay: profile.stepsPerDay,
            motivationLevel: profile.motivationLevel,
            biggestChallenge: profile.biggestChallenge,
            targetAreas: profile.targetAreas?.join('、'),
            onboardingCompleted: profile.onboardingCompleted,
          }));
        }
      } catch {
        // Non-critical: works without onboarding data
      }

      if (!coachTrigger) {
        setCoachStage('welcome');
        addMessage('ai', COACH_WELCOME_MESSAGE);
        return;
      }

      // ── coachTrigger 路径：已建档直接激活，未建档显示欢迎 ──
      if (onboardingProfile?.onboardingCompleted) {
        setCoachStage('coaching_active');
        addMessage('ai', '欢迎回来！你的档案已经完善，有什么想聊的直接告诉我。');
        return;
      }

      setCoachStage('welcome');
      addMessage('ai', COACH_WELCOME_MESSAGE);
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [mode, sessionId, coachTrigger]);

  // ── 开始私教建档 ──
  const startOnboarding = () => {
    setOnboardingStarted(true);
    setCoachStage('intake');
    setIntakeStepIndex(0);
    setIntakeAnswers({});
    setCoachError(null);
    addMessage('ai', '好，那我来了解一下你的情况。一共 ' + TOTAL_INTAKE_STEPS + ' 个问题，大概 3 分钟。');
  };

  const handleAssessmentConfirm = (selectedWeeks: number) => {
    if (!assessmentData) {
      return;
    }

    setAssessmentConfirmed(true);
    setCoachError(null);

    void (async () => {
      try {
        const bodyFatEstimate = parsePercent(assessmentData.currentBodyFat);
        const targetBodyFatEstimate = parsePercent(assessmentData.targetBodyFat);

        await aiCoachApi.updateAssessment({
          bodyFatEstimate: bodyFatEstimate ?? undefined,
          targetBodyFatEstimate: targetBodyFatEstimate ?? undefined,
          bmi: Number.isFinite(assessmentData.bmi) ? assessmentData.bmi : undefined,
          bmr: Number.isFinite(assessmentData.bmr) ? assessmentData.bmr : undefined,
          tdee: Number.isFinite(assessmentData.tdee) ? assessmentData.tdee : undefined,
          targetWeeks: selectedWeeks,
          isVisualAssessment: assessmentData.isVisualAssessment,
        });

        const context = await aiCoachApi.prepareFirstPlan();
        if (context.intake) {
          await prepareAndSaveFirstPlan(context);
          return;
        }

        setCoachStage('intake');
        setIntakeStepIndex(0);
        setIntakeAnswers({});
        addMessage('ai', '还差 4 个小问题，答完我就生成你的首日计划。');
      } catch {
        setAssessmentConfirmed(false);
        setCoachStage('assessment');
        setCoachError('保存体测失败，请再试一次。');
      }
    })();
  };

  // ── 扩展建档完成 → 保存数据 + 启动四段式交付 ──
  // ── 安全取数：处理 sleepHours / stepsPerDay 中可能的多数字字符串 ──
  const safeSleepHours = (raw: unknown): number | undefined => {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw < 24) return raw;
    if (typeof raw === 'string') {
      // 取第一个数字（例如 "5-6小时" → 5）
      const m = raw.match(/(\d+)/);
      if (m) {
        const v = Number(m[1]);
        if (Number.isFinite(v) && v > 0 && v < 24) return v;
      }
    }
    return undefined; // fallback to 6.5 in the caller
  };

  const safeStepsPerDay = (raw: unknown): number | undefined => {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0 && raw < 100000) return raw;
    if (typeof raw === 'string') {
      const m = raw.match(/(\d+)/);
      if (m) {
        const v = Number(m[1]);
        if (Number.isFinite(v) && v > 0 && v < 100000) return v;
      }
    }
    return undefined;
  };

  const submitExtendedIntake = (answers: IntakeAnswerState) => {
    setCoachError(null);
    setCoachStage('generating');

    void (async () => {
      // ── Phase 1: 保存数据 ──
      try {
        await aiCoachApi.saveIntake({
          trainingExperience: answers.trainingExperience || '练过但不稳定',
          injuryHistory: answers.injuryHistory || '无明显限制',
          trainingDaysPerWeek: Math.max(3, Number(answers.trainingDaysPerWeek || 3)),
          sessionDurationMinutes: Math.max(20, Number(answers.sessionDurationMinutes || 45)),
        });

        const onboardingInput: OnboardingProfileInput = {
          trainingExperience: answers.trainingExperience,
          injuryHistory: answers.injuryHistory,
          weeklyTrainingDays: Number(answers.trainingDaysPerWeek || 3),
          sessionDurationMinutes: Number(answers.sessionDurationMinutes || 45),
          trainingEnvironment: answers.trainingEnvironment,
          timePreference: answers.timePreference,
          strengthAnchors: null,
          dietEnvironment: answers.dietEnvironment,
          typicalBreakfast: answers.typicalBreakfast,
          typicalLunch: answers.typicalLunch,
          typicalDinner: answers.typicalDinner,
          alcoholFrequency: answers.alcoholFrequency,
          snackFrequency: answers.snackFrequency,
          diningOutFrequency: answers.diningOutFrequency,
          sleepHours: safeSleepHours(answers.sleepHours) ?? 6.5,
          sleepQuality: answers.sleepQuality,
          stressLevel: answers.stressLevel,
          cardioType: answers.cardioType,
          cardioFrequency: answers.cardioFrequency,
          stepsPerDay: safeStepsPerDay(answers.stepsPerDay) ?? 8000,
          motivationLevel: answers.motivationLevel,
          biggestChallenge: answers.biggestChallenge,
          targetAreas: Array.isArray(answers.targetAreas) ? answers.targetAreas : [],
          goalDirection: undefined,
          onboardingCompleted: true,
          onboardingStep: TOTAL_INTAKE_STEPS,
        };

        const savedProfile = await onboardingApi.saveProfile(onboardingInput);
        setOnboardingProfile(savedProfile);

        setUserProfile(prev => ({
          ...prev,
          trainingExperience: savedProfile.trainingExperience,
          injuryHistory: savedProfile.injuryHistory,
          trainingDaysPerWeek: savedProfile.weeklyTrainingDays,
          sessionDurationMinutes: savedProfile.sessionDurationMinutes,
          trainingEnvironment: savedProfile.trainingEnvironment,
          timePreference: savedProfile.timePreference,
          dietEnvironment: savedProfile.dietEnvironment,
          typicalBreakfast: savedProfile.typicalBreakfast,
          typicalLunch: savedProfile.typicalLunch,
          typicalDinner: savedProfile.typicalDinner,
          alcoholFrequency: savedProfile.alcoholFrequency,
          snackFrequency: savedProfile.snackFrequency,
          diningOutFrequency: savedProfile.diningOutFrequency,
          sleepHours: savedProfile.sleepHours,
          sleepQuality: savedProfile.sleepQuality,
          stressLevel: savedProfile.stressLevel,
          cardioType: savedProfile.cardioType,
          cardioFrequency: savedProfile.cardioFrequency,
          stepsPerDay: savedProfile.stepsPerDay,
          motivationLevel: savedProfile.motivationLevel,
          biggestChallenge: savedProfile.biggestChallenge,
          targetAreas: savedProfile.targetAreas?.join('、'),
          onboardingCompleted: true,
        }));

        addMessage('ai', '✅ 建档数据已保存！现在给你做私教评估...');
      } catch (saveErr: any) {
        console.error('Onboarding save failed', saveErr);
        setCoachStage('intake');
        setCoachError('建档保存失败：' + (saveErr?.response?.data?.message || saveErr?.message || '网络异常，请重试'));
        return;
      }

      // ── Phase 2: AI 生成 Stage 1 ──
      try {
        const profile = {
          ...userProfile,
          trainingExperience: answers.trainingExperience,
          injuryHistory: answers.injuryHistory,
          trainingDaysPerWeek: Number(answers.trainingDaysPerWeek || 3),
          sessionDurationMinutes: Number(answers.sessionDurationMinutes || 45),
          trainingEnvironment: answers.trainingEnvironment,
          timePreference: answers.timePreference,
          dietEnvironment: answers.dietEnvironment,
          typicalBreakfast: answers.typicalBreakfast,
          typicalLunch: answers.typicalLunch,
          typicalDinner: answers.typicalDinner,
          alcoholFrequency: answers.alcoholFrequency,
          snackFrequency: answers.snackFrequency,
          sleepHours: safeSleepHours(answers.sleepHours) ?? 6.5,
          sleepQuality: answers.sleepQuality,
          stressLevel: answers.stressLevel,
          cardioType: answers.cardioType,
          stepsPerDay: safeStepsPerDay(answers.stepsPerDay) ?? 8000,
          motivationLevel: answers.motivationLevel,
          biggestChallenge: answers.biggestChallenge,
          targetAreas: Array.isArray(answers.targetAreas) ? answers.targetAreas.join('、') : undefined,
          onboardingCompleted: true,
        };

        const stage1Prompt = buildPersonalizedCoachPrompt(
          STAGE1_ASSESSMENT_PROMPT + FREE_CHAT_PROMPT_SUFFIX,
          profile,
        );
        const stage1Reply = await chatWithGemini('请给我现状评估。', stage1Prompt, []);
        setCoachStage('delivery_stage1');
        addMessage('ai', stage1Reply?.trim() || '评估生成中，请稍等...');
      } catch (aiErr: any) {
        console.error('AI generation failed', aiErr);
        setCoachStage('coaching_active');
        addMessage('ai', '好的，你的数据我已经记下了！不过 AI 生成暂时有点慢，你可以先跟我聊聊——比如今天想练什么、吃什么，我会基于你的数据给你建议。稍后再试试生成完整方案。');
      }
    })();
  };

  const handleIntakeAnswer = (answer: string | string[]) => {
    const step = EXTENDED_INTAKE_STEPS[intakeStepIndex];
    if (!step) {
      return;
    }

    const mapped = step.mapAnswer(answer);
    const nextAnswers: IntakeAnswerState = {
      ...intakeAnswers,
      [step.key]: mapped as never,
    };
    setIntakeAnswers(nextAnswers);

    if (intakeStepIndex < EXTENDED_INTAKE_STEPS.length - 1) {
      setIntakeStepIndex((prev) => prev + 1);
      return;
    }

    submitExtendedIntake(nextAnswers);
  };

  // ── 判断用户是否在确认当前阶段 ──
  const isDeliveryConfirmation = (text: string): boolean => {
    const confirmPatterns = /^(确认|继续|下一步|好的|可以|行|嗯|对|没问题|ok|OK|好|是的|没错|下一段|来吧|开始吧)[!！。.]*$/;
    return confirmPatterns.test(text.trim());
  };

  const handleSendText = () => {
    const userText = inputValue.trim();
    const isCoachLocked =
      mode === 'coach' &&
      (coachStage === 'loading' ||
        coachStage === 'assessment' ||
        coachStage === 'intake' ||
        coachStage === 'generating');

    if (!userText || sending || isCoachLocked) {
      return;
    }

    addMessage('user', userText);
    void appendTrainingLog('user', userText);

    setInputValue('');
    setSending(true);

    void (async () => {
      try {
        // ── 四段式交付：Stage 1 → Stage 2 → Stage 3 → Stage 4 ──
        const deliveryStages: CoachFlowStage[] = [
          'delivery_stage1',
          'delivery_stage2',
          'delivery_stage3',
          'delivery_stage4',
        ];
        const stagePrompts: Record<string, string> = {
          delivery_stage1: STAGE1_ASSESSMENT_PROMPT,
          delivery_stage2: STAGE2_EXPECTATION_PROMPT,
          delivery_stage3: STAGE3_NUTRITION_PROMPT,
          delivery_stage4: STAGE4_TRAINING_PROMPT,
        };

        const currentStageIdx = deliveryStages.indexOf(coachStage);
        if (currentStageIdx >= 0 && isDeliveryConfirmation(userText)) {
          // 用户确认当前阶段 → 推进到下一阶段
          const nextStageIdx = currentStageIdx + 1;
          if (nextStageIdx < deliveryStages.length) {
            const nextStage = deliveryStages[nextStageIdx];
            const nextPrompt = buildPersonalizedCoachPrompt(
              stagePrompts[nextStage] + FREE_CHAT_PROMPT_SUFFIX,
              userProfile,
            );
            setCoachStage('generating');
            const reply = await chatWithGemini('请继续下一阶段。', nextPrompt, []);
            setCoachStage(nextStage);
            addMessage('ai', reply?.trim() || '下一阶段准备中...');
          } else {
            // 所有阶段完成 → 进入日常陪伴
            setCoachStage('coaching_active');
            addMessage('ai', '方案交付完毕！从今天开始，我就是你的日常私教了。有什么问题随时找我，比如今天吃什么、怎么练、状态不好怎么办——我都会基于你的数据给你具体建议。');
          }
        } else if (currentStageIdx >= 0) {
          // 在交付阶段但用户没有确认 → 在当前阶段上下文中回复
          const stagePrompt = buildPersonalizedCoachPrompt(
            stagePrompts[coachStage] + '\n用户尚未确认，请在当前阶段上下文中回答用户的问题，回答完毕后提醒用户确认以进入下一阶段。' + FREE_CHAT_PROMPT_SUFFIX,
            userProfile,
          );
          const reply = await chatWithGemini(userText, stagePrompt, freeChatHistoryRef.current);
          const assistantText = reply?.trim() || '请确认是否继续。';
          freeChatHistoryRef.current = [
            ...freeChatHistoryRef.current,
            { role: 'user', parts: [{ text: userText }] },
            { role: 'model', parts: [{ text: assistantText }] },
          ].slice(-16);
          addMessage('ai', assistantText);
        } else {
          // ── 正常聊天模式 ──
          const modePrompt =
            mode === 'training'
              ? buildTrainingModePrompt(trainingSession, userProfile)
              : buildPersonalizedCoachPrompt(
                  `${FITNESS_COACH_PROMPT}${FREE_CHAT_PROMPT_SUFFIX}`,
                  userProfile,
                );

          const reply = await chatWithGemini(userText, modePrompt, freeChatHistoryRef.current);
          const assistantText =
            reply?.trim() || '我在，告诉我你今天的训练目标和状态。';

          freeChatHistoryRef.current = [
            ...freeChatHistoryRef.current,
            { role: 'user', parts: [{ text: userText }] },
            { role: 'model', parts: [{ text: assistantText }] },
          ].slice(-16);

          addMessage('ai', assistantText);
          void appendTrainingLog('assistant', assistantText);
        }
      } catch {
        addMessage('ai', '网络波动，请稍后再试。');
      } finally {
        setSending(false);
      }
    })();
  };

  const currentIntakeStep = EXTENDED_INTAKE_STEPS[intakeStepIndex];
  const isCoachInputLocked =
    mode === 'coach' &&
    (coachStage === 'loading' ||
      coachStage === 'assessment' ||
      coachStage === 'intake' ||
      coachStage === 'generating');
  const isDeliveryStage =
    coachStage === 'delivery_stage1' ||
    coachStage === 'delivery_stage2' ||
    coachStage === 'delivery_stage3' ||
    coachStage === 'delivery_stage4';

  const inputPlaceholder =
    mode === 'training'
      ? '请输入训练相关问题...'
      : isCoachInputLocked
        ? '请先完成上方教练流程...'
        : isDeliveryStage
          ? '输入"确认"进入下一阶段，或提出你的疑问...'
          : '告诉我你今天的训练目标或状态...';

  return (
    <div className="h-screen bg-bg-dark flex flex-col relative z-50 animate-fade-in">
      <div className="px-4 py-4 flex items-center gap-3 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-10">
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-95 transition-transform"
        >
          <span className="material-icons-round text-white">arrow_back</span>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden border border-primary/30 flex-shrink-0">
            <img src="/xiaozhao-avatar.png" alt="小爪" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">小爪</h1>
            <p className="text-[10px] text-primary font-medium tracking-wider">AI 私教 · 在线</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-b from-[#050505] to-[#0A0A0A]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-primary text-black rounded-tr-none'
                  : 'bg-[#1A1A1A] text-gray-200 rounded-tl-none border border-white/5'
              }`}
            >
              {msg.text}
              <div className="text-[10px] text-gray-500 mt-2">{msg.time}</div>
            </div>
          </div>
        ))}

        {/* ── 欢迎界面：开始私教评估按钮 ── */}
        {mode === 'coach' && coachStage === 'welcome' && !onboardingStarted && (
          <div className="flex justify-center mt-2">
            <button
              onClick={startOnboarding}
              className="w-full max-w-sm bg-primary hover:bg-primary/90 text-black font-bold text-lg py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_25px_rgba(184,255,0,0.3)] active:scale-[0.98] transition-all"
            >
              <span className="material-icons-round text-xl">fitness_center</span>
              开始私教评估
            </button>
          </div>
        )}

        {/* ── 扩展建档进度条 ── */}
        {mode === 'coach' && coachStage === 'intake' && onboardingStarted && (
          <div className="flex justify-center mt-2">
            <div className="w-full max-w-sm">
              <div className="flex justify-between items-center mb-2 px-1">
                <span className="text-[10px] text-primary font-bold tracking-wider">
                  {INTAKE_CATEGORY_LABELS[currentIntakeStep?.category || 'training_background']}
                </span>
                <span className="text-[10px] text-gray-500">
                  {intakeStepIndex + 1}/{TOTAL_INTAKE_STEPS}
                </span>
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${((intakeStepIndex + 1) / TOTAL_INTAKE_STEPS) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── 四段式交付阶段提示 ── */}
        {mode === 'coach' && isDeliveryStage && (
          <div className="flex justify-center mt-2">
            <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-2 text-center">
              <p className="text-xs text-primary font-bold">
                📋 {
                  coachStage === 'delivery_stage1' ? '第1段：现状评估' :
                  coachStage === 'delivery_stage2' ? '第2段：预期管理' :
                  coachStage === 'delivery_stage3' ? '第3段：饮食建议' :
                  '第4段：训练框架'
                }
              </p>
              <p className="text-[10px] text-gray-400 mt-1">确认后自动进入下一阶段</p>
            </div>
          </div>
        )}

        {mode === 'coach' && coachStage === 'loading' && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl p-4 text-sm bg-[#1A1A1A] border border-white/5 text-gray-300">
              正在为你准备体测报告和教练计划...
            </div>
          </div>
        )}

        {mode === 'coach' && coachStage === 'assessment' && assessmentData && (
          <div className="flex justify-start">
            <div className="w-full max-w-[94%]">
              <AssessmentCard
                data={assessmentData}
                onDataUpdate={setAssessmentData}
                onConfirm={handleAssessmentConfirm}
                isConfirmed={assessmentConfirmed}
              />
            </div>
          </div>
        )}

        {mode === 'coach' && coachStage === 'intake' && currentIntakeStep && (
          <div className="flex justify-start">
            <IntakeQuestion
              key={`${currentIntakeStep.key}-${intakeStepIndex}`}
              question={currentIntakeStep.question}
              type={currentIntakeStep.type}
              options={currentIntakeStep.options}
              onAnswer={handleIntakeAnswer}
            />
          </div>
        )}

        {mode === 'coach' && coachStage === 'generating' && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl p-4 text-sm bg-[#1A1A1A] border border-primary/30 text-gray-200">
              正在生成你的首日计划，请稍等...
            </div>
          </div>
        )}

        {mode === 'coach' && coachStage === 'first_plan' && firstDayPlanData && (
          <div className="flex justify-start">
            <div className="w-full max-w-[94%]">
              <FirstDayPlanCard
                data={firstDayPlanData}
                onCheckInClick={() => {
                  setCoachStage('coaching_active');
                  addMessage('ai', '完成任一任务后告诉我，我会立刻给你下一步反馈。');
                  onNavigate?.(View.ActionCenter);
                }}
              />
            </div>
          </div>
        )}

        {coachError && (
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl p-3 text-xs bg-red-500/10 border border-red-500/40 text-red-300">
              {coachError}
            </div>
          </div>
        )}

        {sending && (
          <div className="flex justify-start">
            <div className="p-4 rounded-2xl rounded-tl-none bg-[#1A1A1A] border border-white/5">
              <div className="flex gap-1.5">
                <div
                  className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: '0ms' }}
                />
                <div
                  className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: '150ms' }}
                />
                <div
                  className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="p-4 bg-black/80 backdrop-blur-md border-t border-white/5 pb-safe relative z-20">
        {mode === 'training' && sessionId && (
          <button
            onClick={() =>
              onNavigate?.(View.TrainingConfirm, {
                sessionId,
                sessionData: trainingSession,
              })
            }
            className="w-full mb-3 bg-[#B8FF00] hover:bg-[#a3e000] text-black font-bold py-3 rounded-full transition-all flex justify-center items-center gap-2"
          >
            <span className="material-icons-round">check_circle</span>
            结束训练
          </button>
        )}

        <div className="flex gap-2 items-end">
          <div className="flex-1 bg-white/[0.03] rounded-2xl flex items-center px-4 py-2 border border-white/5 focus-within:border-primary/50 focus-within:bg-white/[0.05] transition-all duration-300">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder={inputPlaceholder}
              disabled={isCoachInputLocked || sending}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none min-h-[40px] font-medium disabled:opacity-60"
            />
          </div>
          <button
            onClick={handleSendText}
            disabled={!inputValue.trim() || sending || isCoachInputLocked}
            className={`p-3 rounded-full flex items-center justify-center transition-all duration-300 ${
              inputValue.trim() && !sending && !isCoachInputLocked
                ? 'bg-primary text-black hover:bg-primary-dark shadow-[0_0_15px_rgba(184,255,0,0.3)] transform active:scale-95'
                : 'bg-white/5 text-gray-600'
            }`}
          >
            <span className="material-icons-round">send</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChat;
