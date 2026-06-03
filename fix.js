const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Extract getSessionTime
const funcRegex = /const getSessionTime = \([\s\S]*?return `\$\{fmt\(closestSlotStart\)\}~\$\{fmt\(closestSlotStart \+ 40\)\}`;[\s\S]*?};\n/;
const match = code.match(funcRegex);
if (match) {
  code = code.replace(match[0], '');
  // Insert it before fetchData
  code = code.replace(/const fetchData = async \(\) => \{/, match[0] + '\n  const fetchData = async () => {');
  fs.writeFileSync('src/App.tsx', code);
  console.log("Fixed!");
} else {
  console.log("Not found!");
}
