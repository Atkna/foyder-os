// Panelin kullandığı Excel kitaplığını (SheetJS 0.20.3, npm'deki @e965/xlsx yansısı) testler için yerel önbelleğe alır.
// Dosya bir kez indirilir (tests/.cache, git'e girmez); tarayıcı testlerinde index.html'deki bütünlük karmasıyla doğrulanarak yüklenir.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

module.exports = function xlsxYerel() {
  const yol = path.join(__dirname, '.cache', 'xlsx.full.min.js');
  if (!fs.existsSync(yol)) {
    const dir = path.dirname(yol); fs.mkdirSync(dir, { recursive: true });
    execSync('npm pack @e965/xlsx@0.20.3 --silent', { cwd: dir });
    execSync('tar xzf e965-xlsx-0.20.3.tgz package/dist/xlsx.full.min.js && mv package/dist/xlsx.full.min.js . && rm -rf package e965-xlsx-0.20.3.tgz', { cwd: dir });
  }
  return fs.readFileSync(yol);
};
