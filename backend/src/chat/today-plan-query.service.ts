import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReadOnlyIntentRoute } from '../agent/intent/intent-classifier.types';

interface PlanItem { title: string; completed: boolean }
export interface TodayPlanViewModel {
  date: string;
  training: PlanItem[];
  nutrition: PlanItem[];
  hydration: PlanItem[];
  source: 'active_plan' | 'todo' | 'fallback';
}
export interface WeeklyPlanViewModel {
  days: Array<{ day: number | null; focus: string; tasks: string[]; durationMinutes: number | null }>;
  source: 'profile' | 'fallback';
}

@Injectable()
export class TodayPlanQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, route: ReadOnlyIntentRoute): Promise<string> {
    if (route === 'weekly_plan') return this.formatWeekly(await this.weeklyPlan(userId));
    if (route === 'today_diet') return this.todayDiet(userId);
    if (route === 'training_history') return this.trainingHistory(userId);
    if (route === 'latest_weight') return this.latestWeight(userId);
    if (route === 'current_progress') return this.currentProgress(userId);
    const plan = await this.todayPlan(userId);
    if (route === 'pending_todos') return this.formatTodos(plan, true);
    if (route === 'today_todos') return this.formatTodos(plan, false);
    return this.formatTodayPlan(plan);
  }

  private async todayDiet(userId: string): Promise<string> {
    const date = this.shanghaiDate();
    const records = await this.prisma.dietRecord.findMany({ where: { userId, date }, orderBy: { createdAt: 'asc' } });
    if (!records.length) return `${date} 暂时没有饮食记录。`;
    const calories = records.reduce((sum, item) => sum + item.calories, 0);
    return `${date} 已记录 ${records.length} 项饮食，共约 ${calories} 千卡：\n${records.map((item) => `${item.mealType ? `${item.mealType}：` : ''}${item.name}（${item.calories} 千卡）`).join('\n')}`;
  }

  private async trainingHistory(userId: string): Promise<string> {
    const records = await this.prisma.trainingRecord.findMany({ where: { userId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 10 });
    if (!records.length) return '最近暂时没有训练记录。';
    return `最近训练记录：\n${records.map((item) => `${item.date}：${item.description}`).join('\n')}`;
  }

  private async latestWeight(userId: string): Promise<string> {
    const [record, user] = await Promise.all([
      this.prisma.weightRecord.findFirst({ where: { userId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { weight: true } }),
    ]);
    const weight = record?.weight ?? user?.weight;
    if (!Number.isFinite(weight)) return '暂时没有体重记录。';
    return `最新体重：${weight} kg${record?.date ? `（${record.date}）` : ''}。`;
  }

  private async currentProgress(userId: string): Promise<string> {
    const [progress, todoCounts] = await Promise.all([
      this.prisma.aiCoachProgress.findUnique({ where: { userId }, select: { dayIndex: true, streakDays: true, completedTasks: true, totalTasks: true } }),
      this.prisma.todo.groupBy({ by: ['completed'], where: { userId }, _count: { _all: true } }),
    ]);
    if (!progress && !todoCounts.length) return '暂时没有可汇总的健身进展。';
    const completed = todoCounts.find((item) => item.completed)?._count._all ?? 0;
    const total = todoCounts.reduce((sum, item) => sum + item._count._all, 0);
    return `当前进展：计划第 ${progress?.dayIndex ?? 1} 天，连续 ${progress?.streakDays ?? 0} 天；任务完成 ${completed}/${total || progress?.totalTasks || 0}。`;
  }

  async todayPlan(userId: string, date = this.shanghaiDate()): Promise<TodayPlanViewModel> {
    const [todos, progress] = await Promise.all([
      this.prisma.todo.findMany({ where: { userId, date }, orderBy: { createdAt: 'asc' } }),
      this.prisma.aiCoachProgress.findUnique({ where: { userId }, select: { activePlan: true } }),
    ]);
    const categorized = { training: [] as PlanItem[], nutrition: [] as PlanItem[], hydration: [] as PlanItem[] };
    for (const todo of todos) {
      const target = todo.category === 'diet' ? categorized.nutrition
        : todo.category === 'water' ? categorized.hydration : categorized.training;
      target.push({ title: todo.title, completed: todo.completed });
    }
    const activeTasks = this.activePlanTasks(progress?.activePlan);
    if (activeTasks.length > 0) {
      const existing = new Set([...categorized.training, ...categorized.nutrition, ...categorized.hydration].map((item) => item.title));
      for (const task of activeTasks) {
        if (existing.has(task.title)) continue;
        categorized[task.group].push({ title: task.title, completed: false });
      }
    }
    return {
      date, ...categorized,
      source: activeTasks.length > 0 ? 'active_plan' : todos.length > 0 ? 'todo' : 'fallback',
    };
  }

  async weeklyPlan(userId: string): Promise<WeeklyPlanViewModel> {
    const profile = await this.prisma.aiCoachProfile.findUnique({
      where: { userId }, select: { fitnessPlan: true },
    });
    const fitnessPlan = this.objectValue(profile?.fitnessPlan);
    const rawDays = Array.isArray(fitnessPlan?.weeklyTrainingPlan) ? fitnessPlan.weeklyTrainingPlan : [];
    const days = rawDays.flatMap((value: unknown) => {
      const day = this.objectValue(value);
      if (!day) return [];
      const tasks = Array.isArray(day.tasks)
        ? day.tasks.filter((task): task is string => typeof task === 'string' && Boolean(task.trim())).map((task) => task.trim())
        : [];
      if (!tasks.length && typeof day.focus !== 'string') return [];
      return [{
        day: Number.isFinite(Number(day.day)) ? Number(day.day) : null,
        focus: typeof day.focus === 'string' ? day.focus.trim() : '训练', tasks,
        durationMinutes: Number.isFinite(Number(day.durationMinutes)) ? Number(day.durationMinutes) : null,
      }];
    });
    return { days, source: days.length > 0 ? 'profile' : 'fallback' };
  }

  private activePlanTasks(activePlan: unknown): Array<{ title: string; group: 'training' | 'nutrition' | 'hydration' }> {
    const plan = this.objectValue(activePlan);
    if (!plan || !Array.isArray(plan.tasks)) return [];
    return plan.tasks.flatMap((value: unknown) => {
      const task = this.objectValue(value);
      const title = typeof task?.title === 'string' ? task.title.trim() : '';
      if (!title) return [];
      const category = task?.category;
      const text = `${title} ${typeof task?.detail === 'string' ? task.detail : ''}`.toLowerCase();
      const group = category === 'nutrition' ? 'nutrition'
        : category === 'recovery' && /(water|drink|hydration|ml|喝水|补水)/.test(text) ? 'hydration'
          : 'training';
      return [{ title, group }];
    });
  }

  private formatTodayPlan(plan: TodayPlanViewModel): string {
    const sections = [
      this.section('训练', plan.training), this.section('饮食', plan.nutrition), this.section('饮水', plan.hydration),
    ].filter(Boolean);
    return sections.length > 0 ? `${plan.date} 的计划：\n${sections.join('\n')}` : `${plan.date} 暂时没有可用计划。`;
  }

  private formatTodos(plan: TodayPlanViewModel, pendingOnly: boolean): string {
    const items = [...plan.training, ...plan.nutrition, ...plan.hydration]
      .filter((item) => !pendingOnly || !item.completed);
    if (!items.length) return pendingOnly ? '今天没有未完成的任务。' : '今天暂时没有任务。';
    return `${pendingOnly ? '今天未完成' : '今天的任务'}：\n${items.map((item) => `${item.completed ? '[已完成]' : '[待完成]'} ${item.title}`).join('\n')}`;
  }

  private formatWeekly(plan: WeeklyPlanViewModel): string {
    if (!plan.days.length) return '本周暂时没有可用训练计划。';
    return `本周训练安排：\n${plan.days.map((day) => {
      const label = day.day ? `第 ${day.day} 天` : '训练日';
      const duration = day.durationMinutes ? `，约 ${day.durationMinutes} 分钟` : '';
      return `${label}：${day.focus}${duration}${day.tasks.length ? `（${day.tasks.join('、')}）` : ''}`;
    }).join('\n')}`;
  }

  private section(label: string, items: PlanItem[]): string {
    return items.length ? `${label}：${items.map((item) => `${item.completed ? '[已完成]' : '[待完成]'} ${item.title}`).join('；')}` : '';
  }

  private objectValue(value: unknown): Record<string, any> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
  }

  private shanghaiDate(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  }
}
