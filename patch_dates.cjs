const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Add normalizeDateStr right before formatSessionDate
const normalizeFunc = `
        const normalizeDateStr = (dStr: string) => {
          const str = String(dStr).trim();
          if (/^\\d{5}$/.test(str)) {
            const serial = parseInt(str, 10);
            const dateObj = new Date((serial - 25569) * 86400 * 1000);
            const y = dateObj.getUTCFullYear();
            const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getUTCDate()).padStart(2, '0');
            return \`\${y}-\${m}-\${d}\`;
          }
          return str;
        };

        // 날짜 문자열 포맷: M/D(요일)\\n수업시간`;

code = code.replace(/\/\/ 날짜 문자열 포맷: M\/D\(요일\)\\n수업시간/, normalizeFunc);

// 2. Fix formatSessionDate to use normalizeDateStr
code = code.replace(/const formatSessionDate = \(dateStr: string, txTime\?: string\): string => \{/, 
  'const formatSessionDate = (dateStr: string, txTime?: string): string => {\n          const normDateStr = normalizeDateStr(dateStr);');
code = code.replace(/const match = String\(dateStr\)\.match\(\/\(\\d\{4\}\)\[\-\.\/\\s년\]\+\(\\d\{1,2\}\)\[\-\.\/\\s월\]\+\(\\d\{1,2\}\)\/\);/, 
  'const match = normDateStr.match(/(\\d{4})[-./\\s년]+(\\d{1,2})[-./\\s월]+(\\d{1,2})/);');
code = code.replace(/const time = getSessionTime\(currentStudentInfo, dateStr, txTime \|\| ""\);/, 
  'const time = getSessionTime(currentStudentInfo, normDateStr, txTime || "");');
code = code.replace(/return dateStr;/g, 'return normDateStr;');

// 3. Fix monthlyRecords filter
code = code.replace(/const dStr = String\(r\.transactionDate\)\.trim\(\);/g, 'const dStr = normalizeDateStr(r.transactionDate);');

// 4. Update XLSX read option
code = code.replace(/const rows = XLSX\.utils\.sheet_to_json\(worksheet, \{ header: 1 \}\) as any\[\]\[\];/g, 
  'const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];');

fs.writeFileSync('src/App.tsx', code);
