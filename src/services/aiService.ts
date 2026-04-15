import { Student, AnnualPlanData, MonthlyJournalData } from "../types";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function safeJsonParse(text: string) {
  try {
    // Attempt direct parse
    return JSON.parse(text);
  } catch (e) {
    // If it fails, try to extract JSON from markdown blocks
    const jsonMatch = text.match(/```json\s?([\s\S]*?)\s?```/) || text.match(/```\s?([\s\S]*?)\s?```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch (innerE) {
        throw new Error(`Failed to parse extracted JSON: ${innerE}`);
      }
    }
    
    // If no markdown blocks, try to find the first '{' and last '}'
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      try {
        return JSON.parse(text.substring(firstBrace, lastBrace + 1));
      } catch (innerE) {
        throw new Error(`Failed to parse braced JSON: ${innerE}`);
      }
    }
    
    throw e;
  }
}

export async function generateAnnualPlan(student: Student): Promise<AnnualPlanData> {
  try {
    const prompt = `
      너는 10년 차 1급 전문 언어재활사 및 미술치료사이다. 다음 학생의 정보를 바탕으로 교육청 제출용 '연간 계획서'를 작성해라.
      
      [학생 정보]
      - 이름: ${student.name}
      - 소속: ${student.school}
      - 장애 유형: ${student.disabilityType}
      - 치료 영역: ${student.treatmentArea}
      
      [시스템 지침]
      1. 핵심 임무: 학생의 정보를 바탕으로 공식 문서에 들어갈 '현행 수준', '장기 목표', '월별 치료 목표 및 내용'을 창작한다.
      2. 문체 및 어조: 주관적인 감정 표현은 철저히 배제하고, 객관적이고 임상적인 행동 관찰 위주로 서술한다.
      3. 종결어미: 모든 문장의 끝은 반드시 "-함", "-보임", "-관찰됨", "-향상됨", "-강화됨" 형태의 명사형으로 끝맺는다.
      4. 전문성: 전문가 수준의 단어와 문장 구조를 사용한다.
      
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
    return safeJsonParse(response.text);
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
}

export async function generateMonthlyJournal(student: Student, month: number, monthlyGoal?: string): Promise<MonthlyJournalData> {
  const effectiveGoal = monthlyGoal || "연간계획서에 목표가 설정되지 않았습니다.";
  
  try {
    const prompt = `
      너는 10년 차 1급 전문 언어재활사 및 미술치료사이다. 다음 학생의 정보를 바탕으로 ${month}월 '개별 치료 일지'를 작성해라.
      
      [학생 정보]
      - 이름: ${student.name}
      - 장애 유형: ${student.disabilityType}
      - 치료 영역: ${student.treatmentArea}
      - 결제 일자(세션 날짜): ${student.paymentDates.join(", ")}
      - 이번 달 치료 목표: ${effectiveGoal}
      
      [시스템 지침]
      1. 핵심 임무: 학생의 정보를 바탕으로 공식 문서에 들어갈 '치료 내용', '아동 반응', '월 치료 목표'를 창작한다.
      2. 컨텍스트 매핑 (절대 규칙): 
         - 반드시 전달받은 '이번 달 치료 목표(${effectiveGoal})'를 달성하기 위한 구체적인 치료 프로그램을 '치료 내용'으로 작성해라.
         - 해당 목표의 성취도와 부합하는 임상적 관찰 결과를 '아동 반응'으로 작성해라.
         - 만약 목표가 '연간계획서에 목표가 설정되지 않았습니다.'라면, 일반적인 영역별 기초 활동을 작성하되 목표 칸에는 해당 문구를 그대로 유지해라.
      3. 문체 및 어조: 주관적인 감정 표현은 철저히 배제하고, 객관적이고 임상적인 행동 관찰 위주로 서술한다.
      4. 종결어미: 모든 문장의 끝은 반드시 "-함", "-보임", "-관찰됨", "-향상됨", "-강화됨" 형태의 명사형으로 끝맺는다.
      5. 데이터 기반 매핑: 제공된 '결제 일자' 각 행마다 빈칸 없이 전문적인 내용을 작성한다.
      
      [논리적 일치 예시 (Few-shot)]
      - 목표가 "정서 표현의 다양화"인 경우:
        * 치료내용: "오늘 내 마음의 날씨 그리기, 감정 카드 게임을 통한 감정 변별 활동 실시함"
        * 아동반응: "다양한 감정 어휘 사용 빈도가 향상됨, 자신의 기분을 날씨에 비유하여 적절히 표현함"
      
      [월간일지 작성 샘플]
      - (미술/심리 치료내용) "내면 표현 감정 조절, 속마음 상자 꾸미기 상자 안에 감정 담기"
      - (미술/심리 아동반응) "다른 사람에게 보여주고 싶은 속마음, 나만 알고 싶은 마음을 적절히 구분하여 표현함"
      
      [응답 구조]
      {
        "currentLevel": "현행 수준 요약",
        "monthlyGoal": "${effectiveGoal}",
        "sessions": [
          { "date": "YYYY-MM-DD", "content": "치료 내용", "reaction": "아동 반응", "consultation": "가정 내 연계 활동 안내" }
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
    return safeJsonParse(response.text);
  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
}
