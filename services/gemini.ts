/**
 * Gemini AI Service
 * 对话模型: Gemini 3 Flash (gemini-3-flash-preview)
 * 图像生成: Nano Banana 2 (gemini-3.1-flash-image-preview)
 */

const API_KEY = () => import.meta.env.VITE_GEMINI_API_KEY || '';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const CHAT_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

// 健身教练 system prompt
export const FITNESS_COACH_PROMPT = `你是 RightNow Fitness 的 AI 健身教练「显化引擎」。
你的核心理念是"宇宙吸引力法则"——以终为始，帮助用户看见未来理想的自己，再拆解为可执行路径。

你的职责：
1. 分析用户的身体数据和目标，给出专业、个性化的建议
2. 用简短、有激励性的语气回答，像一个懂你的私人教练
3. 基于用户的运动基础、饮食习惯、作息和职业，制定量身定制的方案
4. 方案包括：每日三餐具体食谱、喝水时间表、训练计划

回答风格：专业但不冷冰冰，有温度，有激励性。用中文回答。`;

// 引导式对话问题序列
export const GUIDED_QUESTIONS = [
  {
    id: 'exercise_base',
    question: '你之前有运动基础吗？比如健身、跑步、球类运动等，大概持续了多久？',
    field: 'exerciseBase',
  },
  {
    id: 'diet_habit',
    question: '聊聊你目前的饮食习惯吧？一天几餐，喜欢吃什么类型的食物？有没有特别偏好或忌口？',
    field: 'dietHabit',
  },
  {
    id: 'sleep_pattern',
    question: '你的作息是怎样的？一般几点睡几点起？睡眠质量如何？',
    field: 'sleepPattern',
  },
  {
    id: 'occupation',
    question: '你从事什么工作？日常是久坐多还是活动多？这会影响我给你安排的训练强度。',
    field: 'occupation',
  },
];

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }>;
}

/**
 * 调用 Gemini 文本对话
 */
export async function chatWithGemini(
  userText: string,
  systemPrompt: string = FITNESS_COACH_PROMPT,
  history: GeminiMessage[] = [],
): Promise<string> {
  const key = API_KEY();
  if (!key || key === 'PLACEHOLDER_API_KEY') {
    return '请先配置 VITE_GEMINI_API_KEY。';
  }

  try {
    const contents: GeminiMessage[] = [
      ...history,
      { role: 'user', parts: [{ text: userText }] },
    ];

    const res = await fetch(
      `${GEMINI_BASE}/models/${CHAT_MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          system_instruction: { parts: [{ text: systemPrompt }] },
        }),
      },
    );

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '收到，让我想想...';
  } catch {
    return '网络连接失败，请稍后重试。';
  }
}

/**
 * 调用 Gemini 多模态（带图片）
 */
export async function chatWithImage(
  userText: string,
  imageBase64: string,
  systemPrompt: string = FITNESS_COACH_PROMPT,
): Promise<string> {
  const key = API_KEY();
  if (!key || key === 'PLACEHOLDER_API_KEY') {
    return '请先配置 VITE_GEMINI_API_KEY。';
  }

  try {
    const base64Data = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;
    const mimeType = imageBase64.includes(';')
      ? imageBase64.split(';')[0].split(':')[1]
      : 'image/jpeg';

    const res = await fetch(
      `${GEMINI_BASE}/models/${CHAT_MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: userText },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          }],
          system_instruction: { parts: [{ text: systemPrompt }] },
        }),
      },
    );

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '收到，让我分析一下...';
  } catch {
    return '网络连接失败，请稍后重试。';
  }
}

/**
 * 基于用户信息生成个性化健身方案
 */
export async function generateFitnessPlan(userInfo: {
  gender: string;
  height: number;
  weight: number;
  age: number;
  bodyStyle: string;
  exerciseBase: string;
  dietHabit: string;
  sleepPattern: string;
  occupation: string;
}): Promise<string> {
  const prompt = `基于以下用户信息，生成一份详细的个性化健身方案：

用户信息：
- 性别：${userInfo.gender === 'male' ? '男' : '女'}
- 身高：${userInfo.height}cm，体重：${userInfo.weight}kg，年龄：${userInfo.age}岁
- 目标体型：${userInfo.bodyStyle}
- 运动基础：${userInfo.exerciseBase}
- 饮食习惯：${userInfo.dietHabit}
- 作息规律：${userInfo.sleepPattern}
- 职业：${userInfo.occupation}

请生成包含以下内容的方案（用JSON格式）：
1. mealPlan: 每日三餐具体食谱（早/中/晚+加餐）
2. waterPlan: 喝水时间表（具体时间点和量）
3. trainingPlan: 每周训练计划（每天的训练内容、组数、时长）
4. summary: 一段鼓励性的总结（2-3句话）

请直接返回JSON，不要加markdown代码块。`;

  return chatWithGemini(prompt);
}

/**
 * Nano Banana 2 图像生成 — 基于用户照片+目标体型生成理想身材
 * 返回 base64 图片数据或 null
 */
export async function generateIdealBody(params: {
  currentImageBase64?: string;
  targetStyle: string;
  gender: string;
  refinement?: string;
}): Promise<string | null> {
  const key = API_KEY();
  if (!key || key === 'PLACEHOLDER_API_KEY') return null;

  const styleDesc = params.gender === 'male'
    ? { slim: '精瘦有型，线条分明', athletic: '肌肉均衡，运动员体型', muscular: '大块肌肉，健美体型' }
    : { comic: '纤细匀称，线条柔和', athletic: '紧致有力，运动感', muscular: '力量感，肌肉轮廓明显' };

  const target = styleDesc[params.targetStyle as keyof typeof styleDesc] || params.targetStyle;

  const prompt = params.refinement
    ? `基于这张人物照片，按照用户要求进行调整：${params.refinement}。保持人物面部特征不变，只调整身材体型。输出一张高质量的全身照。`
    : `基于这张人物照片，将其身材转变为「${target}」体型。保持面部特征和肤色不变，调整身体比例和肌肉线条，使其呈现理想的${params.gender === 'male' ? '男性' : '女性'}${target}身材。输出一张高质量的全身照，背景简洁。`;

  try {
    const parts: any[] = [{ text: prompt }];

    if (params.currentImageBase64) {
      const base64Data = params.currentImageBase64.includes(',')
        ? params.currentImageBase64.split(',')[1]
        : params.currentImageBase64;
      const mimeType = params.currentImageBase64.includes(';')
        ? params.currentImageBase64.split(';')[0].split(':')[1]
        : 'image/jpeg';
      parts.push({ inline_data: { mime_type: mimeType, data: base64Data } });
    }

    const res = await fetch(
      `${GEMINI_BASE}/models/${IMAGE_MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseModalities: ['image', 'text'] },
        }),
      },
    );

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts;
    if (!candidate) return null;

    // 找到图片 part
    const imgPart = candidate.find((p: any) => p.inline_data?.mime_type?.startsWith('image/'));
    if (imgPart) {
      return `data:${imgPart.inline_data.mime_type};base64,${imgPart.inline_data.data}`;
    }
    return null;
  } catch (err) {
    console.error('Image generation failed:', err);
    return null;
  }
}

// ─── 饮食分析 ───

export interface FoodAnalysis {
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  mealType: string;
}

const FOOD_ANALYSIS_PROMPT = `你是一个专业营养师。根据用户描述的食物，估算营养成分。
必须返回纯 JSON（不要 markdown 代码块），格式：
{"name":"食物名","calories":数字,"protein":数字,"fat":数字,"carbs":数字,"mealType":"早餐|午餐|晚餐|加餐"}
所有数值为整数，单位：calories=千卡，其余=克。`;

function parseFoodJSON(text: string): FoodAnalysis {
  const cleaned = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    return {
      name: obj.name || '未知食物',
      calories: Math.round(Number(obj.calories) || 0),
      protein: Math.round(Number(obj.protein) || 0),
      fat: Math.round(Number(obj.fat) || 0),
      carbs: Math.round(Number(obj.carbs) || 0),
      mealType: obj.mealType || '加餐',
    };
  } catch {
    return { name: '未知食物', calories: 0, protein: 0, fat: 0, carbs: 0, mealType: '加餐' };
  }
}

/**
 * 文字描述 → AI 分析营养成分
 */
export async function analyzeFoodText(foodName: string, description?: string): Promise<FoodAnalysis> {
  const query = description ? `${foodName}（${description}）` : foodName;
  const reply = await chatWithGemini(`分析这个食物的营养成分：${query}`, FOOD_ANALYSIS_PROMPT);
  return parseFoodJSON(reply);
}

/**
 * 食物照片 → AI 多模态识别 + 营养分析
 */
export async function analyzeFoodImage(imageBase64: string): Promise<FoodAnalysis> {
  const reply = await chatWithImage(
    '识别这张照片中的食物，估算营养成分。返回纯 JSON。',
    imageBase64,
    FOOD_ANALYSIS_PROMPT,
  );
  return parseFoodJSON(reply);
}

// ─── 数据看板 AI 建议 ───

/**
 * 根据用户数据生成个性化 AI 建议
 */
export async function generateDataInsights(context: {
  totalCalories?: number;
  totalProtein?: number;
  totalFat?: number;
  totalCarbs?: number;
  latestWeight?: number;
  weightTrend?: string;
  checkinCount?: number;
}): Promise<string[]> {
  const prompt = `你是健身营养顾问。根据以下用户今日数据，给出 2-3 条简短、具体、可执行的建议（每条不超过 30 字）。
直接返回 JSON 数组，如 ["建议1","建议2"]，不要 markdown。

用户数据：
- 今日摄入：${context.totalCalories ?? '未记录'} 千卡
- 蛋白质：${context.totalProtein ?? '--'}g，脂肪：${context.totalFat ?? '--'}g，碳水：${context.totalCarbs ?? '--'}g
- 最新体重：${context.latestWeight ?? '未记录'} kg
- 体重趋势：${context.weightTrend || '暂无数据'}
- 近 30 天打卡：${context.checkinCount ?? 0} 天`;

  const reply = await chatWithGemini(prompt, FITNESS_COACH_PROMPT);
  try {
    const cleaned = reply.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const arr = JSON.parse(cleaned);
    if (Array.isArray(arr)) return arr.map(String).slice(0, 3);
  } catch { /* fallback */ }
  return ['记录今日饮食，让 AI 为你生成个性化建议'];
}
