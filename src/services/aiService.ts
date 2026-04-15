import { Student, AnnualPlanData, MonthlyJournalData } from "../types";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateAnnualPlan(student: Student): Promise<AnnualPlanData> {
  try {
    const prompt = `
      너는 10년 차 1급 전문 언어재활사/미술치료사이다. 다음 학생의 정보를 바탕으로 교육청 제출용 '연간 계획서'를 작성해라.
      
      [학생 정보]
      - 이름: ${student.name}
      - 소속: ${student.school}
      - 장애 유형: ${student.disabilityType}
      - 치료 영역: ${student.treatmentArea}
      
      [작성 규칙]
      1. 임상적이고 객관적인 전문 용어를 사용한다.
      2. 문장의 끝은 반드시 "-함", "-보임", "-관찰됨", "-향상됨" 형태의 명사형으로 종결한다.
      3. JSON 형식으로 응답해라.
      
      [응답 구조]
      {
        "currentLevel": ["현행 수준 1", "현행 수준 2"],
        "longTermGoals": ["장기 목표 1", "장기 목표 2"],
        "monthlyGoals": [
          { "month": 3, "goal": "3월 목표", "content": "3월 치료 내용" },
          ... (3월부터 차년도 2월까지 12개월분)
        ]
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    if (!response.text) throw new Error('Empty response from AI');
    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
}

export async function generateMonthlyJournal(student: Student, month: number): Promise<MonthlyJournalData> {
  try {
    const prompt = `
      너는 10년 차 1급 전문 언어재활사/미술치료사이다. 다음 학생의 정보를 바탕으로 ${month}월 '개별 치료 일지'를 작성해라.
      
      [학생 정보]
      - 이름: ${student.name}
      - 치료 영역: ${student.treatmentArea}
      - 결제 일자(세션 날짜): ${student.paymentDates.join(", ")}
      
      [작성 규칙]
      1. 임상적이고 객관적인 전문 용어를 사용한다.
      2. 문장의 끝은 반드시 "-함", "-보임", "-관찰됨", "-향상됨" 형태의 명사형으로 종결한다.
      3. JSON 형식으로 응답해라.
      
      [응답 구조]
      {
        "currentLevel": "현행 수준 요약",
        "monthlyGoal": "${month}월 치료 목표",
        "sessions": [
          { "date": "YYYY-MM-DD", "content": "치료 내용", "reaction": "아동 반응", "consultation": "부모 상담" }
        ],
        "result": "${month}월 치료 결과 요약"
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });

    if (!response.text) throw new Error('Empty response from AI');
    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
}
