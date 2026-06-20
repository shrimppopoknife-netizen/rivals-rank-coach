// api/chat.js
// Vercel 서버리스 함수: 브라우저는 이 함수만 호출하고, 이 함수가 Gemini API를 대신 호출합니다.
// 키는 Vercel 프로젝트의 "Environment Variables"에만 저장되며, 브라우저에는 절대 노출되지 않습니다.
// 시스템 프롬프트(코칭 지시문)도 여기에만 존재하며, 프론트엔드로 전송되지 않습니다.

const TACTICAL_PROMPT = `[SYSTEM_INSTRUCTION: 당신은 로블록스 'Rivals'의 전술 코치 AI입니다.
최상위 랭커들의 플레이 패턴과 게임 메커니즘(무빙, 에임, 무기 스왑, 포지셔닝, 콤보)에 대한 깊은 지식을 갖고 있습니다.

[핵심 조건]
1. 정중하고 친근한 존댓말(~요, ~습니다)을 사용하세요.
2. 특정 랭커의 실명은 언급하지 말고, 그들의 기술과 노하우를 당신의 고유 지식으로 자연스럽게 풀어서 설명하세요.
3. "연습하세요" 같은 추상적인 조언 대신, 구체적인 행동을 제시하세요.
4. 장황하지 않게 핵심만 명쾌하게, 5~8문장 이내로 전달하세요.
5. 사용자가 이미지를 올리면 화면 속 상황을 분석해서 코칭하세요.]`;

const CASUAL_PROMPT = `[SYSTEM_INSTRUCTION: 당신은 친근한 AI 친구입니다. Rivals 게임 지식도 있지만, 지금은 격식 없이 편하게 대화하는 모드입니다.
자유롭게 캐주얼한 말투로 친구처럼 자연스럽게 대답하세요. 분석 포맷을 강제로 쓰지 말고, 답변은 짧고 가볍게 해주세요.]`;

export default async function handler(req, res) {
  // CORS 허용 (필요시 도메인을 좁혀서 보안 강화 가능)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'POST 요청만 허용됩니다.' } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가해주세요.' }
    });
  }

  const { contents, mode, isFirstMessage } = req.body || {};
  if (!contents || !Array.isArray(contents)) {
    return res.status(400).json({ error: { message: 'contents 필드가 필요합니다.' } });
  }

  // 요청 데이터 기본 검증 (너무 큰 요청 방지 — 대략 10MB 제한)
  const bodySize = JSON.stringify(contents).length;
  if (bodySize > 10 * 1024 * 1024) {
    return res.status(413).json({ error: { message: '요청 데이터가 너무 큽니다.' } });
  }

  // 서버에서 시스템 프롬프트를 첫 메시지에 주입 (프론트는 모드 이름만 보냄)
  const finalContents = JSON.parse(JSON.stringify(contents)); // deep copy
  if (isFirstMessage && finalContents.length > 0) {
    const sysPrompt = mode === 'casual' ? CASUAL_PROMPT : TACTICAL_PROMPT;
    const firstMsg = finalContents[0];
    if (firstMsg.role === 'user' && firstMsg.parts && firstMsg.parts[0] && typeof firstMsg.parts[0].text === 'string') {
      firstMsg.parts[0].text = sysPrompt + '\n\n' + firstMsg.parts[0].text;
    }
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: finalContents })
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return res.status(upstream.status).json(data);
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: { message: 'Gemini API 호출 중 오류가 발생했습니다.' } });
  }
}
