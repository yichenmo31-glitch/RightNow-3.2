import { IntentClassifierInput, IntentDecision, RiskLevel } from './intent-classifier.types';

type PartialDecision = Omit<IntentDecision, 'classifier' | 'entities'> & { entities?: Record<string, unknown> };

const HIGH_RISK = /(胸痛|昏厥|晕倒|头晕|剧烈不适|疼|痛|受伤|伤恢复期|术后|慢性病|每天只吃一顿|绝食|断食|快速瘦|继续冲)/;
const MEDIUM_RISK = /(疲劳|很累|有点累|睡不好|失眠|没睡够|没动力|失败了|只想躺)/;
const PAIN = /(膝盖|膝|腰|肩|关节|脚踝|胸)(?:.{0,5})(疼|痛|不舒服|受伤)|(?:疼|痛|不舒服)(?:.{0,5})(膝盖|膝|腰|肩|关节|脚踝|胸)/;
const ADVICE = /(怎么|如何|怎么办|要不要|能不能|还能|适合吗|应该|比较合适|会影响|够吗|可以加|怎么排|怎么搭配)/;
const PLAN = /(之前.*计划|计划.*(?:调|改|换)|调轻|改一下计划|替换动作|动作换成|(?:深蹲|卧推|硬拉|动作).{0,4}(?:换成|替换为)|只能练.{0,4}天|饮食计划.*调)/;
const FOOD = /(鸡胸|米饭|牛肉饭|燕麦|牛奶|鸡蛋|面包|拿铁|早餐|午餐|晚餐|加餐|这顿饭|吃了|吃多了|蛋白质|热量)/;
const TRAINING = /(训练|练完|刚练|一周练|练几次|跑步|跳绳|卧推|深蹲|硬拉|有氧|力量训练|做了|\d+\s*(?:组|次)|\d+(?:\.\d+)?\s*kg)/i;
const OUT_OF_DOMAIN = /(typescript|javascript|python|java|代码|编程|文件|文档|readme|合同|发票|报销|股票|天气|翻译|写邮件|会议纪要|旅行|酒店|机票)/i;
const STRONG_OUT_OF_DOMAIN = /(typescript|javascript|python|java|代码|编程|文件|文档|readme|合同|发票|报销|股票|翻译|写邮件|会议纪要|酒店|机票)/i;

function decision(value: PartialDecision): IntentDecision {
  return { ...value, entities: value.entities ?? {}, classifier: 'rule' };
}

function riskOf(message: string): RiskLevel {
  if (HIGH_RISK.test(message) || PAIN.test(message)) return 'high';
  if (MEDIUM_RISK.test(message)) return 'medium';
  return 'low';
}

function extractEntities(message: string): Record<string, unknown> {
  const entities: Record<string, unknown> = {};
  const weight = message.match(/(\d+(?:\.\d+)?)\s*(kg|公斤|斤)/i);
  if (weight) entities.weightKg = Number(weight[1]) * (weight[2] === '斤' ? 0.5 : 1);
  const sets = message.match(/(\d+)\s*组/);
  if (sets) entities.sets = Number(sets[1]);
  const reps = message.match(/(\d+)\s*次/);
  if (reps) entities.reps = Number(reps[1]);
  const exercise = message.match(/(深蹲|卧推|硬拉|跳绳|跑步)/);
  if (exercise) entities.exercise = exercise[1];
  const bodyPart = message.match(/(膝盖|膝|腰|肩|关节|脚踝|胸)/);
  if (bodyPart) entities.bodyPart = bodyPart[1];
  return entities;
}

export function classifyByRules(input: IntentClassifierInput): IntentDecision | null {
  const message = input.message.trim();
  if (!message) return null;
  const risk = riskOf(message);
  const entities = extractEntities(message);
  const asksAdvice = ADVICE.test(message);

  if (STRONG_OUT_OF_DOMAIN.test(message) ||
      (OUT_OF_DOMAIN.test(message) && !FOOD.test(message) && !TRAINING.test(message) && !PLAN.test(message))) {
    return decision({ intent: 'out_of_domain', subIntent: null, confidence: 0.98, riskLevel: 'low', requiresContext: false, requiresKnowledge: false, requiresWriteTool: false, suggestedTools: [], responseMode: 'clarify', clarifyingQuestion: null, entities });
  }

  if (input.hasImage && input.imageType === 'food') {
    return decision({ intent: 'diet_log', subIntent: 'food_image_log', confidence: 0.99, riskLevel: 'low', requiresContext: true, requiresKnowledge: false, requiresWriteTool: /(记|记录|保存)/.test(message), suggestedTools: ['diet.analyze.image'], responseMode: 'short_confirm', clarifyingQuestion: null, entities });
  }

  if (/吃多了/.test(message) && /(没练|还没练)/.test(message)) {
    return decision({ intent: 'unknown_mixed', subIntent: 'diet_and_training_advice', confidence: 0.95, riskLevel: risk, requiresContext: true, requiresKnowledge: true, requiresWriteTool: false, suggestedTools: ['memory.context.assemble', 'knowledge.search'], responseMode: 'medium_advice', clarifyingQuestion: null, entities });
  }
  if (FOOD.test(message) && TRAINING.test(message) && /(记|记录)/.test(message)) {
    return decision({ intent: 'unknown_mixed', subIntent: 'diet_and_training_log', confidence: 0.96, riskLevel: risk, requiresContext: true, requiresKnowledge: false, requiresWriteTool: true, suggestedTools: ['memory.context.assemble'], responseMode: 'clarify', clarifyingQuestion: '你希望我先记录饮食，还是先记录训练？', entities });
  }
  if (/(记得|之前说过)/.test(message)) {
    return decision({ intent: 'unknown_mixed', subIntent: 'memory_check', confidence: 0.94, riskLevel: 'low', requiresContext: true, requiresKnowledge: false, requiresWriteTool: false, suggestedTools: ['memory.context.assemble'], responseMode: 'clarify', clarifyingQuestion: '我先核对已有记录，可以吗？', entities });
  }
  if (/(创建|提醒)/.test(message) && /(喝水|待办|TODO)/i.test(message)) {
    return decision({ intent: 'unknown_mixed', subIntent: 'todo_create_request', confidence: 0.93, riskLevel: 'low', requiresContext: true, requiresKnowledge: false, requiresWriteTool: true, suggestedTools: ['memory.context.assemble'], responseMode: 'clarify', clarifyingQuestion: '需要我把它创建为明天的待办吗？', entities });
  }
  if (PLAN.test(message)) {
    const subIntent = /调轻|累/.test(message) ? 'reduce_intensity' : /只能练|频率|两天/.test(message) ? 'change_frequency' : /饮食计划|外卖/.test(message) ? 'adjust_diet_plan' : 'replace_exercise';
    return decision({ intent: 'plan_adjustment', subIntent, confidence: 0.95, riskLevel: subIntent === 'reduce_intensity' && risk === 'low' ? 'medium' : risk, requiresContext: true, requiresKnowledge: true, requiresWriteTool: false, suggestedTools: ['memory.context.assemble', 'knowledge.search'], responseMode: 'plan_adjustment', clarifyingQuestion: null, entities });
  }
  if (PAIN.test(message) || /(恢复期|每天只吃一顿|绝食|快速瘦)/.test(message)) {
    const advice = asksAdvice || TRAINING.test(message) || /减脂/.test(message);
    return decision({ intent: advice ? 'fitness_advice' : 'body_data_update', subIntent: advice ? (/每天只吃一顿|绝食|快速瘦/.test(message) ? 'diet_advice' : 'injury_risk_advice') : 'pain_or_injury_update', confidence: 0.98, riskLevel: 'high', requiresContext: true, requiresKnowledge: true, requiresWriteTool: !advice, suggestedTools: ['memory.context.assemble', 'knowledge.search'], responseMode: 'short_risk', clarifyingQuestion: null, entities });
  }
  if (/体重/.test(message) && /\d+(?:\.\d+)?\s*(?:kg|公斤|斤)?/i.test(message)) {
    return decision({ intent: 'body_data_update', subIntent: 'weight_update', confidence: 0.98, riskLevel: 'low', requiresContext: true, requiresKnowledge: false, requiresWriteTool: true, suggestedTools: ['memory.context.assemble'], responseMode: 'short_confirm', clarifyingQuestion: null, entities });
  }
  if (/(睡不好|失眠)/.test(message)) {
    return decision({ intent: 'body_data_update', subIntent: 'sleep_recovery_update', confidence: 0.95, riskLevel: 'medium', requiresContext: true, requiresKnowledge: true, requiresWriteTool: false, suggestedTools: ['memory.context.assemble', 'knowledge.search'], responseMode: 'short_risk', clarifyingQuestion: null, entities });
  }
  if (/(没动力|失败了|只想躺|不想动)/.test(message)) {
    const context = !/没动力/.test(message);
    return decision({ intent: 'social_chat', subIntent: /没动力/.test(message) ? 'motivation' : 'emotion_support', confidence: 0.94, riskLevel: /没动力/.test(message) ? 'low' : risk, requiresContext: context, requiresKnowledge: false, requiresWriteTool: false, suggestedTools: context ? ['memory.context.assemble'] : [], responseMode: 'social_support', clarifyingQuestion: null, entities });
  }
  if (/(蛋白质|热量|饮食|吃)/.test(message) && asksAdvice) {
    return decision({ intent: 'fitness_advice', subIntent: 'diet_advice', confidence: 0.94, riskLevel: risk, requiresContext: true, requiresKnowledge: true, requiresWriteTool: false, suggestedTools: ['memory.context.assemble', 'knowledge.search'], responseMode: risk === 'high' ? 'short_risk' : 'medium_advice', clarifyingQuestion: null, entities });
  }
  if (TRAINING.test(message) && asksAdvice) {
    const subIntent = /平台期/.test(message) ? 'plateau_advice' : 'training_advice';
    return decision({ intent: 'fitness_advice', subIntent, confidence: 0.94, riskLevel: risk, requiresContext: true, requiresKnowledge: true, requiresWriteTool: false, suggestedTools: ['memory.context.assemble', 'knowledge.search'], responseMode: risk === 'high' ? 'short_risk' : 'medium_advice', clarifyingQuestion: null, entities });
  }
  if (/(平台期)/.test(message)) {
    return decision({ intent: 'fitness_advice', subIntent: 'plateau_advice', confidence: 0.95, riskLevel: risk, requiresContext: true, requiresKnowledge: true, requiresWriteTool: false, suggestedTools: ['memory.context.assemble', 'knowledge.search'], responseMode: 'medium_advice', clarifyingQuestion: null, entities });
  }
  if (FOOD.test(message) && asksAdvice && !/(早餐|午餐|晚餐|吃了|这顿)/.test(message)) {
    return decision({ intent: 'fitness_advice', subIntent: 'diet_advice', confidence: 0.92, riskLevel: risk, requiresContext: true, requiresKnowledge: true, requiresWriteTool: false, suggestedTools: ['memory.context.assemble', 'knowledge.search'], responseMode: risk === 'high' ? 'short_risk' : 'medium_advice', clarifyingQuestion: null, entities });
  }
  if (FOOD.test(message)) {
    const explicitWrite = /(记|记录|吃了)/.test(message) && !asksAdvice;
    return decision({ intent: 'diet_log', subIntent: 'food_text_log', confidence: 0.93, riskLevel: risk, requiresContext: true, requiresKnowledge: false, requiresWriteTool: explicitWrite, suggestedTools: ['diet.analyze.text', ...(explicitWrite ? ['diet.log.create', 'diet.gap.today'] : [])], responseMode: 'short_confirm', clarifyingQuestion: null, entities });
  }
  if (TRAINING.test(message)) {
    const complete = /(练完|做完)/.test(message) && !/刚做完(?:卧推|深蹲|硬拉)/.test(message);
    return decision({ intent: 'training_log', subIntent: complete ? 'complete_training' : 'update_training', confidence: 0.93, riskLevel: risk, requiresContext: true, requiresKnowledge: false, requiresWriteTool: true, suggestedTools: ['training.session.current', complete ? 'training.session.complete' : 'training.session.update'], responseMode: 'short_confirm', clarifyingQuestion: null, entities });
  }
  return null;
}
