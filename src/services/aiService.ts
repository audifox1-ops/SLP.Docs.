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
    const areaInfo = student.monthlyAreas 
      ? Object.entries(student.monthlyAreas).map(([m, a]) => `${m}월: ${a}`).join(", ")
      : student.treatmentArea;

    const prompt = `
      너는 10년 차 1급 전문 언어재활사 및 미술치료사이다. 다음 학생의 정보를 바탕으로 교육청 제출용 '연간 계획서'를 작성해라.
      
      [학생 정보]
      - 이름: ${student.name}
      - 소속: ${student.school}
      - 장애 유형: ${student.disabilityType}
      - 치료 영역: ${areaInfo} (월별로 영역이 다를 경우 해당 영역에 맞는 목표를 수립할 것)
      
      [시스템 지침]
      1. 핵심 임무: 학생의 정보를 바탕으로 공식 문서에 들어갈 '현행 수준', '장기 목표', '월별 치료 목표 및 내용'을 창작한다.
      2. 장애 특성 반영 (중요): 반드시 제공된 **장애 유형(${student.disabilityType})**의 전형적인 특성과 개별 학생의 예상되는 어려움을 연계하여 서술해라. 
         - 예: 자폐성 장애의 경우 사회적 상호작용 및 의사소통의 질적 결함, 제한적이고 반복적인 관심사 등을 반영.
         - 예: 지적 장애의 경우 인지 발달 지체로 인한 학습 및 적응 행동의 어려움을 반영.
      3. 문체 및 어조: 주관적인 감정 표현은 철저히 배제하고, 객관적이고 임상적인 행동 관찰 위주로 서술한다.
      4. 종결어미: 모든 문장의 끝은 반드시 "-함", "-보임", "-관찰됨", "-향상됨", "-강화됨" 형태의 명사형으로 끝맺는다.
      5. 전문성: 전문가 수준의 임상 용어(예: 공동주의, 화용론적 결함, 소근육 발달, 정서 조절 등)를 적재적소에 사용한다.
      6. 영역 전환 대응: 만약 월별 치료 영역이 변경되는 경우(예: 5월까지 미술, 6월부터 언어), 해당 월부터는 변경된 영역에 적합한 목표와 내용을 작성해라.
      
      [응답 구조]
      {
        "currentLevel": ["현행 수준 1", "현행 수준 2"],
        "longTermGoals": ["장기 목표 1", "장기 목표 2"],
        "monthlyGoals": [
          { "month": 3, "goal": "3월 목표", "content": "3월 치료 내용", "area": "해당월 치료영역" },
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
  const currentArea = student.monthlyAreas?.[month] || student.treatmentArea;
  
  try {
    const prompt = `
      너는 10년 차 1급 전문 언어재활사 및 미술치료사이다. 전달받은 '월 치료 목표'를 바탕으로 아래의 [차윤우 월간일지 샘플]과 완벽하게 동일한 문장 구조, 어조, 명사형 종결어미를 사용하여 치료 내용과 아동 반응을 창작해라.
      
      [학생 정보]
      - 이름: ${student.name}
      - 장애 유형: ${student.disabilityType}
      - 치료 영역: ${currentArea}
      - 결제 일자(세션 날짜): ${student.paymentDates.join(", ")}
      - 이번 달 치료 목표: ${effectiveGoal}
      
      [시스템 지침]
      1. 핵심 임무: 학생의 정보를 바탕으로 공식 문서에 들어갈 '치료 내용', '아동 반응', '월 치료 목표'를 창작한다.
      2. 장애 특성 기반 개별화 (필수): 반드시 **장애 유형(${student.disabilityType})**에 따른 아동의 전형적인 반응 양상을 포함해라.
         - 예: 자폐성 장애 아동의 경우 시선 접촉의 변화, 반향어 사용 여부, 감각 추구 행동, 특정 사물에 대한 집착 등을 구체적으로 묘사.
         - 예: ADHD 아동의 경우 주의 집중 시간의 변화, 충동 조절 양상, 과잉 행동의 빈도 등을 반영.
      3. 컨텍스트 매핑 및 다양성 (절대 규칙): 
         - 반드시 전달받은 '이번 달 치료 목표(${effectiveGoal})'를 직접적으로 지원하는 **임상적으로 타당한** 중재 활동을 작성해라.
         - **내용의 다양성**: 매 회기마다 단순히 "향상됨"만 반복하지 말고, 치료의 단계(도입-심화-일반화)나 아동의 상태 변화(탐색, 시도, 저항, 수용, 숙달)를 다채롭게 묘사해라.
         - **구체적 기법**: 촉구(Prompting), 모델링(Modeling), 비계 설정(Scaffolding), 용암법(Fading), PECS, 사회적 상황 이야기 등 전문적인 치료 기법을 구체적으로 언급해라.
      4. 전문성 및 어조: 10년 차 전문가로서의 임상적 식견이 드러나는 전문 용어를 사용하고, 주관적 감정은 배제한 채 객관적 사실 위주로 서술한다.
      5. 종결어미: 반드시 "-해봄.", "-표현함.", "-시도함.", "-모습보임.", "-관찰됨.", "-나타남.", "-유지됨." 등 명사형으로 끝맺는다.
      
      [장애 유형별/영역별 예시 (Few-shot)]
      - (자폐성 장애 / 언어치료 / 목표: 공동주의 집중력 향상):
        * 치료내용: "아동이 선호하는 비눗방울 놀이를 통해 치료사와 시선 맞추기 및 손가락 지시(Pointing) 유도 활동 실시함."
        * 아동반응: "비눗방울이 터질 때 치료사를 쳐다보며 즐거움을 공유하려는 사회적 미소 보임. 자발적인 포인팅 빈도가 증가함."
      - (지적 장애 / 미술치료 / 목표: 소근육 조절 및 자기 표현):
        * 치료내용: "점토를 활용한 음식 만들기 활동을 통해 손가락 힘 조절 및 형태 모방 훈련 실시함."
        * 아동반응: "초기에는 점토를 뭉치는 것에 어려움 보였으나, 신체적 촉구(Hand-over-hand)를 통해 점진적으로 형태를 구성함."
      - (ADHD / 인지치료 / 목표: 작업 기억력 및 주의 집중):
        * 치료내용: "순차적 지시 따르기 게임 및 시각적 변별 과제를 통해 주의 지속 시간 연장 훈련함."
        * 아동반응: "과제 수행 중 이탈 행동이 관찰되었으나, 시각적 스케줄러를 활용하여 끝까지 완수하려는 노력 보임."
      
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
