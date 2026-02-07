
import { GoogleGenAI } from "@google/genai";

export const getMotivationalMessage = async (percentage: number) => {
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `사용자가 현재 성경 읽기표에서 ${percentage.toFixed(1)}%를 읽었습니다. 성경 읽기를 독려하는 짧고 따뜻한 응원 메시지(또는 관련 성경 구절)를 한국어로 1-2문장으로 작성해 주세요.`,
    });
    return response.text || "오늘도 하나님의 말씀을 통해 평안한 하루 되시길 축복합니다.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "주의 말씀은 내 발에 등이요 내 길에 빛이니이다. (시편 119:105)";
  }
};
