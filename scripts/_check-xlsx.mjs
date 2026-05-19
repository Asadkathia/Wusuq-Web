import XLSX from 'xlsx';
const old = XLSX.readFile('/Users/asad/Projects/Wusuq-Web/apps/api/data/pricing-sheet.xlsx');
const neu = XLSX.readFile('/Users/asad/Downloads/For Development Team (1).xlsx');
console.log('OLD tabs:', old.SheetNames);
console.log('NEW tabs:', neu.SheetNames);
