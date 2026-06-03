const getSessionTime = (info: any, dateStr: string, txTime: string): string => {
  if (!txTime) return info?.scheduleTime || '';
  
  const parts = String(txTime).split(':');
  if (parts.length < 2) return '';
  const txMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);

  let fixedTime = '';
  if (info?.scheduleTimeHistory?.length > 0) {
    const m = String(dateStr).match(/(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
    if (m) {
      const y = parseInt(m[1]);
      const mo = parseInt(m[2]);
      const matched = info.scheduleTimeHistory.find((h: any) => {
        const from = h.fromYear * 100 + h.fromMonth;
        const cur = y * 100 + mo;
        if (h.toYear && h.toMonth) return cur >= from && cur <= (h.toYear * 100 + h.toMonth);
        return cur >= from;
      });
      if (matched) fixedTime = matched.time;
    }
  }
  if (!fixedTime) fixedTime = info?.scheduleTime || '';

  if (fixedTime && fixedTime !== '정보 없음') {
    const [start] = fixedTime.split('~');
    if (start) {
      const sParts = start.split(':');
      if (sParts.length >= 2) {
        const startMin = parseInt(sParts[0]) * 60 + parseInt(sParts[1]);
        const expectedTxMin = startMin + 50; 
        if (Math.abs(txMin - expectedTxMin) <= 60) {
          return fixedTime;
        }
      }
    }
  }

  let closestSlotStart = 9 * 60;
  let minDiff = 9999;
  for (let i = 0; i < 15; i++) {
    const slotStart = 9 * 60 + i * 50;
    const expectedTx = slotStart + 50;
    const diff = Math.abs(txMin - expectedTx);
    if (diff < minDiff) {
      minDiff = diff;
      closestSlotStart = slotStart;
    }
  }
  
  const fmt = (min: number) => `${Math.floor(min/60).toString().padStart(2, '0')}:${(min%60).toString().padStart(2, '0')}`;
  return `${fmt(closestSlotStart)}~${fmt(closestSlotStart + 40)}`;
};

console.log(getSessionTime(undefined, '2026-06-02', '17:15:43'));
console.log(getSessionTime(undefined, '2026-06-02', undefined as any));
