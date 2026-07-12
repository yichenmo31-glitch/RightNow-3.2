import { Injectable } from '@nestjs/common';
import {
  MemoryCandidate,
  MemoryCategory,
  MemorySource,
} from './dto/memory.dto';

const DYNAMIC_FACT_PATTERNS = [
  /(?:今天|当前|现在).{0,8}(?:体重|重)[^，。！？]*/u,
  /(?:早餐|午饭|午餐|晚饭|晚餐|加餐|这顿|刚才).{0,12}(?:吃|喝)[^，。！？]*/u,
  /(?:今天|刚才|这次).{0,12}(?:训练|练了|练完|跑了|做了)[^，。！？]*/u,
];

@Injectable()
export class MemoryCandidateService {
  extract(message: string): MemoryCandidate[] {
    const content = message.trim();
    if (!content || DYNAMIC_FACT_PATTERNS.some((pattern) => pattern.test(content))) {
      return [];
    }

    if (/(?:以后|今后).{0,8}(?:回答|回复).{0,12}(?:直接|简短|详细|精简)/u.test(content)) {
      return [this.candidate(MemoryCategory.ResponseStyle, content, false, 0.95)];
    }

    if (/(?:膝盖|腰|肩|颈|脚踝).{0,8}(?:伤|疼|痛|不适)/u.test(content)) {
      return [this.candidate(MemoryCategory.HealthRisk, content, true, 0.6)];
    }

    if (/(?:过敏|不能吃|吃了会过敏)/u.test(content)) {
      return [this.candidate(MemoryCategory.Allergy, content, true, 0.7)];
    }

    if (/(?:(?:我|本人)(?:很|更|最|现在)?(?:喜欢|偏好|不喜欢|讨厌)|^(?:喜欢|不喜欢|讨厌)).{0,12}(?:跑步|游泳|骑车|椭圆机|力量|有氧|训练)/u.test(content)) {
      return [this.candidate(MemoryCategory.ExercisePreference, content, false, 0.85)];
    }

    return [];
  }

  private candidate(
    category: MemoryCategory,
    content: string,
    riskSensitive: boolean,
    confidence: number,
  ): MemoryCandidate {
    return {
      category,
      content,
      source: MemorySource.UserExplicit,
      confidence,
      riskSensitive,
    };
  }
}
