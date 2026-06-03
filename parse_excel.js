import * as xlsx from 'xlsx';
const workbook = xlsx.readFile('/Users/audifox/Downloads/MerchantTradeListExcel (2).xls');
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
for (const row of data) {
  if (row.join(',').includes('김서아')) {
    console.log(row);
  }
}
