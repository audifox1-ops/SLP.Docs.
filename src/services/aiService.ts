import { Student, AnnualPlanData, MonthlyJournalData, JournalTone } from "../types";
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

export async function generateAnnualPlan(student: Student, tone: JournalTone = 'expert'): Promise<AnnualPlanData> {
  const areaInfo = student.monthlyAreas 
    ? Object.entries(student.monthlyAreas).map(([m, a]) => `${m}월: ${a}`).join(", ")
    : student.treatmentArea;

  let toneInstruction = "";
  if (tone === 'normal') {
    toneInstruction = `[문체 지침: 일반 치료사 모드] 
부모님(보호자)이 읽고 치료의 방향성과 목표를 쉽게 공감할 수 있도록 친절하고 부드러운 평어체(~합니다, ~할 계획입니다)를 적극 사용하여 작성하세요. 
극단적인 전문 용어의 나열보다는 일상적인 관찰에 기반한 쉬운 말로 풀어서 현행 수준과 목표를 서술하세요.`;
  } else if (tone === 'academic') {
    toneInstruction = `[문체 지침: 극강의 전문/학술 모드] 
임상적이고 전문적인 치료 용어(예: 화용론적 기능, 수용/표현 언어 발달, 감각 통합 기제 등)를 과감하게 사용하고, 학술적인 보고서 어투로 작성하세요. 
현행 수준과 목표는 논문 수준의 객관적이고 분석적인 문장으로 작성하며, 종결어미는 '~임.', '~함.', '~으로 판단됨.' 등 건조하게 통일하세요.`;
  } else if (tone === 'expert') {
    toneInstruction = `[문체 지침: 10년 차 전문가 모방 모드 (기본값)] 
기존에 주입된 완벽한 전문가 작성 샘플 데이터에 기반하여 관찰 중심의 분석을 수행하세요. 
주관적 해석이나 감정 표현은 단 하나도 허용하지 않고, 행동과 기제(Mechanism) 관점에서 작성하며, 모든 종결어미는 반드시 '-함', '-음', '-도모함' 등 엄격한 명사형으로 처리하세요.`;
  }

  try {
    const prompt = `
      당신은 10년 차 1급 전문 언어재활사 및 미술치료사입니다. 아래 학생의 정보를 바탕으로 교육청 제출용 '연간 계획서'를 작성하세요.
      
      ${toneInstruction}
      
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
      3. 전문성: 현행 수준과 장기 목표를 작성할 때 대상 학생의 수준에 맞는 전문적 평가 요소들을 적재적소에 사용한다.
      4. 영역 전환 대응: 만약 월별 치료 영역이 변경되는 경우(예: 5월까지 미술, 6월부터 언어), 해당 월부터는 변경된 영역에 적합한 목표와 내용을 작성해라.
      
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

export async function generateMonthlyJournal(student: Student, month: number, monthlyGoal: string, tone: JournalTone = 'normal'): Promise<MonthlyJournalData> {
  const effectiveGoal = monthlyGoal || "연간계획서에 목표가 설정되지 않았습니다.";
  const currentArea = student.monthlyAreas?.[month] || student.treatmentArea;
  
  let toneInstruction = "";
  if (tone === 'normal') {
    toneInstruction = `[문체 옵션: 일반 치료사 모드] 
자연스럽고 부드러우며 보호자가 이해하기 쉬운 인간적인 어투를 사용하세요. 
종결어미는 '~했습니다.', '~하는 모습을 보였습니다.', '~할 수 있었습니다.'와 같이 친절하고 존중하는 경어체를 적극 활용하세요.`;
  } else if (tone === 'academic') {
    toneInstruction = `[문체 옵션: 극강의 전문/학술 모드] 
대학병원 임상 보고서나 논문 수준의 매우 전문적이고 객관적인 통계적/학술적 문체를 강제합니다. 
주관적 감정이나 부사 사용을 철저히 배제하고, 해당 분야의 극단적 고급 전문 용어를 적극적으로 삽입하세요. 
종결어미는 '~임.', '~함.', '~으로 사료됨.', '~결과를 도출함.'으로 간결하게 작성하세요.`;
  } else if (tone === 'expert') {
    toneInstruction = `[문체 옵션: 차윤우/주하준 전문가 샘플 모드] 
10년 차 수석급 전문가의 날카로운 통찰력과 군더더기 없는 객관성이 바탕이 된 문체입니다. 
주관적 감정은 배제하되, 행동의 전후 맥락을 인지행동치료/언어재활의 핵심 메커니즘 관점에서 서술하세요. 
종결어미는 반드시 '-해봄.', '-표현함.', '-시도함.', '-모습보임.', '-관찰됨.', '-나타남.' 등 명사형으로 끊어지게 강제하세요.`;
  }

  try {
    const prompt = `
      당신은 10년 차 1급 전문 언어재활사 및 미술치료사입니다. 전달받은 '월 치료 목표'를 바탕으로 주어진 [학생 정보]를 활용해 월간 치료 일지를 작성하세요.
      
      ${toneInstruction}
      
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
         - **반응의 현실성 및 다양성**: 매 회기마다 단순히 "긍정적"이거나 "향상됨"만 반복하지 마라. 치료 과정에서 나타나는 **저항, 거부, 불편함, 좌절감, 흥미 저하** 등 부정적이거나 복합적인 반응을 구체적인 상황과 함께 묘사해라.
         - **상태 변화 묘사**: 탐색, 시도, 저항, 회피, 수용, 숙달 등 아동의 심리적/행동적 변화 과정을 다채롭게 표현해라.
         - **구체적 기법**: 촉구(Prompting), 모델링(Modeling), 비계 설정(Scaffolding), 용암법(Fading), PECS, 사회적 상황 이야기 등 전문적인 치료 기법을 구체적으로 언급해라.

      
      [현실적인 반응 예시 (Few-shot)]
      - (저항 및 회피): "치료사의 지시를 따르는 데 어려움을 보이며 머뭇거리는 모습보임. 과제 수행을 회피하기 위해 다른 사물에 집착하거나 시선을 돌리는 행동 관찰됨."
      - (흥미 저하 및 좌절): "활동 중반부에 흥미를 잃고 바닥을 굴러다니거나 활동 거부 의사를 비언어적으로 표현함. 의도대로 되지 않자 소리를 지르며 좌절감을 나타내기도 함."
      - (복합적 반응): "초기에는 새로운 교구에 대해 경계심을 보이며 탐색에 소극적이었으나, 점진적인 촉구를 통해 조심스럽게 시도하는 모습보임."
      
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
