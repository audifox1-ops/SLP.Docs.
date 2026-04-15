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
      너는 10년 차 1급 전문 언어재활사 및 미술치료사이다. 전달받은 '월 치료 목표'를 바탕으로 아래의 [차윤우 월간일지 샘플]과 완벽하게 동일한 문장 구조, 어조, 명사형 종결어미를 사용하여 치료 내용과 아동 반응을 창작해라.
      
      [학생 정보]
      - 이름: ${student.name}
      - 장애 유형: ${student.disabilityType}
      - 치료 영역: ${student.treatmentArea}
      - 결제 일자(세션 날짜): ${student.paymentDates.join(", ")}
      - 이번 달 치료 목표: ${effectiveGoal}
      
      [시스템 지침]
      1. 핵심 임무: 학생의 정보를 바탕으로 공식 문서에 들어갈 '치료 내용', '아동 반응', '월 치료 목표'를 창작한다.
      2. 컨텍스트 매핑 (절대 규칙): 
         - 반드시 전달받은 '이번 달 치료 목표(${effectiveGoal})'를 직접적으로 지원하고 달성하기 위한 **임상적으로 타당한** 치료 프로그램을 '치료 내용'으로 작성해라.
         - '치료 내용'은 해당 목표를 달성하기 위한 구체적인 중재 활동(예: 특정 음소의 조음점 지시법, 특정 화용 기술 훈련 등)을 상세히 기술해야 한다.
         - '아동 반응'은 해당 회기의 활동을 통해 나타난 아동의 구체적인 행동 변화, 목표 음소/기술의 성취도, 임상적 향상 정도를 정밀하게 기술해라.
      3. 전문성 및 어조: 10년 차 전문가로서의 임상적 식견이 드러나는 전문 용어를 사용하고, 주관적 감정은 배제한 채 객관적 사실 위주로 서술한다.
      4. 종결어미: 반드시 "-해봄.", "-표현함.", "-시도하려고 함.", "-모습보임.", "-높아짐.", "-관찰됨.", "-강화됨." 등 명사형으로 끝맺는다.
      5. 데이터 기반 매핑: 제공된 '결제 일자' 각 행마다 빈칸 없이 전문적인 내용을 작성한다.
      
      [논리적 일치 예시 (Few-shot)]
      - 목표가 "정서 표현의 다양화"인 경우:
        * 치료내용: "오늘 내 마음의 날씨 그리기, 감정 카드 게임을 통한 감정 변별 활동 실시함"
        * 아동반응: "다양한 감정 어휘 사용 빈도가 향상됨, 자신의 기분을 날씨에 비유하여 적절히 표현함"
      - 목표가 "'ㅅ' 조음 개선"인 경우:
        * 치료내용: "'ㅅ' 음소 산출을 위한 설단 거상 및 기류 조절 연습, 단어 수준에서의 'ㅅ' 산출 훈련함"
        * 아동반응: "단어 초성에서의 'ㅅ' 정조음률이 70% 이상으로 향상됨, 설단의 위치가 점차 안정화되는 모습보임"
      
      [차윤우 2025년 월간일지 완벽 모방 샘플 (Few-Shot)]
      - (월 치료목표 예시): 가족관계 이해, 다양한 미술 매체를 활용하여 감정과 생각을 시각적으로 표현할 수 있도록 돕는다. 자기와 가족에 대한 관심을 바탕으로 자기인식과 자기표현을 확장한다.
      - (치료 내용 예시): "가족 이름 쓰기 + 가족 놀이 상황 표현", "가족의 하루 그리기", "가족에게 하고 싶은 말 말풍선 만들기", "가족 상징 만들기 (문장, 문양, 색 등으로)"
      - (아동 반응 예시): "가족 이름을 하나하나 부르며 놀이 장면 구성해서 표현해봄. 할머니와 장난감 놀이 장면 그리며 웃음 표현함.", "아침부터 저녁까지 가족의 하루 일과를 장면별로 표현해봄. '아빠는 아침에 출근해요' 등 문장 표현 시도하려고 함.", "'엄마 사랑해요' 말풍선 직접 쓰는 모습보임."
      - (월 치료결과 예시): "가족에 대한 자기 표현이 크게 나타나고 있음."
      
      [응답 구조]
      {
        "currentLevel": "현행 수준 요약",
        "monthlyGoal": "${effectiveGoal}",
        "sessions": [
          { "date": "YYYY-MM-DD", "content": "치료 내용", "reaction": "아동 반응", "consultation": "가정 내 연계 활동 및 지도 방법 안내함." }
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
