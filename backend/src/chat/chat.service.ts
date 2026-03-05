import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class ChatService {
  private genAI: GoogleGenerativeAI;

  constructor(private prisma: PrismaService) {
    this.genAI = new GoogleGenerativeAI(
      process.env.GEMINI_API_KEY || '',
    );
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
  }

  async sendMessage(userId: string, content: string) {
    const userMsg = await this.prisma.chatMessage.create({
      data: { content, sender: 'user', userId },
    });

    let aiReply = 'Sorry, AI is not available right now.';
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-pro',
      });
      const prompt = `You are a professional fitness coach AI assistant for the RightNow app. Reply in the user's language. User message: ${content}`;
      const result = await model.generateContent(prompt);
      aiReply = result.response.text();
    } catch (e) {
      // fallback if Gemini API fails
    }

    const aiMsg = await this.prisma.chatMessage.create({
      data: { content: aiReply, sender: 'ai', userId },
    });

    return { userMessage: userMsg, aiMessage: aiMsg };
  }
}
