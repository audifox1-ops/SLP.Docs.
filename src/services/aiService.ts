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
      너는 10년 차 1급 전문 언어재활사 및 미술치료사야. 전달받은 '월 치료 목표'를 바탕으로 아래의 **[실제 개별치료일지 샘플]**과 완벽하게 동일한 문장 구조, 어조, 명사형 종결어미를 사용하여 '치료 내용'과 '아동 반응'을 창작해.

      [작성 규칙 (엄격 준수)]
      1. 주관적인 감정 표현은 철저히 배제하고, 임상적이고 객관적인 행동 관찰 위주로 서술할 것.
      2. 종결어미: 반드시 "-함.", "-음.", "-높아짐.", "-자연스러움.", "-양호." 등 명사형으로 끝맺을 것.
      3. 구체성 및 발화 인용: 아동의 구체적인 행동 단계(예: '2단계 이상 순서로')를 묘사하고, 아동이 실제로 발화한 내용(예: "무서워요", "괜찮아? 내가 도와줄게")을 따옴표를 사용하여 적극적으로 인용할 것.
      4. 컨텍스트 연계: 생성되는 일지의 내용은 반드시 '이번 달 치료 목표: ${effectiveGoal}'와 직접적으로 이어지게 작성할 것.
      5. 날짜 매핑 원칙: '결제 일자(세션 날짜)'에 명시된 모든 날짜 항목 각각에 대해 빠짐 없이 매치되는 세션을 만들 것. 절대 날짜를 지어내거나 누락시키지 말 것.

      [학생 정보]
      - 이름: ${student.name}
      - 장애 유형: ${student.disabilityType}
      - 치료 영역: ${currentArea}
      - 결제 일자(세션 날짜): ${student.paymentDates.join(", ")}
      - 이번 달 치료 목표: ${effectiveGoal}

      [월간일지 완벽 모방 샘플 (Few-Shot)]
      1. 언어치료 샘플 (윤휘 스타일)
      (월 치료목표): 어휘력 향상
      (치료 내용): 그림에 맞는 어휘 표현 및 문장 만들기
      (아동 반응): "치료사가 제시한 과제에 집중력도 좋고 재미있게 참여하여 그림에 맞는 어휘 표현 및 문장으로 표현하였음."

      2. 미술치료 샘플 (주하준 스타일)
      (월 치료목표): 다양한 미술 매체를 통해 감정 표현을 유도한다. 자기표현의 폭을 넓히고 자존감을 높이는 활동을 진행한다. 치료자와의 상호작용을 통해 정서적 안정감을 경험한다.
      (치료 내용 예시): "이야기 듣고 장면 그리기", "감정표정 따라 그리기 + 감정 단어 말하기", "도와주는 상황 말풍선 넣기", "감정카드 게임 (기분 경험 연결)"
      (아동 반응 예시):
      - "들은 내용을 2단계 이상 순서로 그림으로 표현. 장면 간 연결 이해도 양호. '○○가 넘어졌어요' 등 상황을 언어로 표현함."
      - "다양한 표정을 그리며 감정 단어 연결. '무서워요', '놀랐어요' 표현 가능. 감정과 표정 간 매칭 정확도가 높아짐."
      - "친구가 넘어졌을 때 할 말을 말풍선으로 표현. '괜찮아? 내가 도와줄게' 등 치료사의 도움을 받으며 작성하였음. 타인의 감정을 고려한 표현이 자연스러움."
      - "카드 속 표정을 보고 유사한 자신의 경험을 떠올려 그림과 말로 표현함. '나도 무서웠어' 등 공감 표현 시도 증가함."

      [응답 구조]
      {
        "currentLevel": "현행 수준 요약 (이번 달 치료 목표와 연계하여 1~2문장)",
        "monthlyGoal": "${effectiveGoal}",
        "sessions": [
          { "date": "실제 결제 일자", "content": "치료 내용", "reaction": "아동 반응", "consultation": "가정 내 연계 활동 및 지도 방법 안내함." }
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
