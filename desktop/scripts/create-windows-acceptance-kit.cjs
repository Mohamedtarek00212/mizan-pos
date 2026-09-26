const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(desktopRoot, '..');
const releaseRoot = path.join(desktopRoot, 'release');
const deliveryRoot = path.join(repositoryRoot, 'delivery', 'windows-15.4');
const packagesRoot = path.join(deliveryRoot, 'packages');
const acceptanceNotesPath = path.join(deliveryRoot, 'ACCEPTANCE-NOTES.md');
const oldInstaller = path.join(releaseRoot, 'Mizan-POS-Setup-0.1.0-x64.exe');
const newInstaller = path.join(releaseRoot, 'Mizan-POS-Setup-0.1.2-x64.exe');

for (const installer of [oldInstaller, newInstaller]) {
  if (!fs.existsSync(installer)) throw new Error(`Required installer is missing: ${installer}`);
}

const css = `
  :root { color-scheme: light; font-family: "Segoe UI", Tahoma, Arial, sans-serif; }
  body { margin: 0; background: #eff7f3; color: #12372e; line-height: 1.75; }
  main { width: min(900px, calc(100% - 32px)); margin: 32px auto; background: #fff;
    border: 1px solid #cfe5dc; border-radius: 22px; padding: 32px; box-sizing: border-box;
    box-shadow: 0 18px 50px rgba(8, 54, 42, .10); }
  h1 { color: #087f5b; margin-top: 0; } h2 { margin-top: 28px; color: #145c48; }
  .hero { border-right: 6px solid #0ca678; background: #e9f8f1; padding: 16px 20px; border-radius: 14px; }
  .warning { border-right-color: #e67700; background: #fff4e6; }
  .success { border-right-color: #2b8a3e; background: #ebfbee; }
  code { background: #e9f2ee; padding: 2px 7px; border-radius: 6px; direction: ltr; unicode-bidi: embed; }
  li { margin: 8px 0; } .check { font-size: 1.08rem; }
  .meta { color: #58766c; font-size: .94rem; } table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #cfe5dc; padding: 10px; text-align: right; }
  @media print { body { background: white; } main { box-shadow: none; border: 0; margin: 0; width: 100%; } }
`;

function page(title, body) {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
  <style>${css}</style></head><body><main>${body}</main></body></html>`;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeText(file, content) {
  fs.writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
}

function copyInstaller(source, directory, fileName) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, fileName);
  fs.copyFileSync(source, destination);
  return { destination, digest: sha256(destination) };
}

function zipDirectory(directory, outputName) {
  const destination = path.join(packagesRoot, outputName);
  fs.rmSync(destination, { force: true });
  execFileSync('/usr/bin/zip', [
    '-r', '-X', destination, path.basename(directory),
  ], { cwd: path.dirname(directory), stdio: 'ignore' });
  return { destination, digest: sha256(destination) };
}

const freshDirectory = path.join(deliveryRoot, '01-fresh-install-test');
const updateDirectory = path.join(deliveryRoot, '02-update-test');
const clientDirectory = path.join(deliveryRoot, '03-current-client-delivery');
const expectedRoot = path.join(repositoryRoot, 'delivery', 'windows-15.4');
const preservedAcceptanceNotes = fs.existsSync(acceptanceNotesPath)
  ? fs.readFileSync(acceptanceNotesPath, 'utf8')
  : null;
if (deliveryRoot !== expectedRoot || !deliveryRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
  throw new Error('Refusing to replace an unexpected delivery directory');
}
fs.rmSync(deliveryRoot, { recursive: true, force: true });
fs.mkdirSync(packagesRoot, { recursive: true, mode: 0o700 });
if (preservedAcceptanceNotes !== null) {
  writeText(acceptanceNotesPath, preservedAcceptanceNotes);
}

const fresh = copyInstaller(oldInstaller, freshDirectory, 'Mizan-POS-Setup.exe');
const update = copyInstaller(newInstaller, updateDirectory, 'Mizan-POS-Update.exe');
const current = copyInstaller(newInstaller, clientDirectory, 'Mizan-POS-Setup.exe');

writeText(path.join(freshDirectory, 'START-HERE.html'), page('تثبيت ميزان', `
  <h1>تثبيت نظام ميزان</h1>
  <div class="hero"><strong>هذه الحزمة تحتوي على كل ما يحتاجه النظام.</strong><br>
  لا تحتاج إلى تثبيت PostgreSQL أو Docker أو Node.js أو أي أدوات برمجية.</div>
  <h2>خطوات التثبيت</h2><ol>
    <li>انقر مرتين على <code>Mizan-POS-Setup.exe</code>.</li>
    <li>إذا ظهرت رسالة Windows protected your PC اختر <strong>More info</strong> ثم <strong>Run anyway</strong>.</li>
    <li>أكمل خطوات التثبيت، ثم افتح <strong>Mizan POS</strong> من سطح المكتب.</li>
    <li>انتظر في التشغيل الأول؛ سيقوم ميزان بتجهيز قاعدة البيانات تلقائيًا.</li>
    <li>أدخل اسم المتجر، بيانات المدير، الخزينة ونسبة الضريبة في معالج الإعداد.</li>
  </ol>
  <div class="hero warning"><strong>مهم:</strong> احتفظ بكلمة مرور المدير في مكان آمن. مقدم النظام لا يستطيع استعادتها من داخل ملف التثبيت.</div>
  <h2>بعد التثبيت</h2><p>شغّل البرنامج دائمًا من اختصار Mizan POS. بيانات متجرك محفوظة على جهازك ولا تُحذف عند تحديث التطبيق.</p>
  <p class="meta">نسخة اختبار التثبيت الأول: 0.1.0 — Windows 10/11 x64</p>`));
writeText(path.join(freshDirectory, 'SHA256.txt'), `${fresh.digest}  Mizan-POS-Setup.exe\n`);

writeText(path.join(updateDirectory, 'UPDATE-INSTRUCTIONS.html'), page('تحديث ميزان', `
  <h1>تحديث نظام ميزان</h1>
  <div class="hero"><strong>لا تحذف النسخة القديمة.</strong> أغلق ميزان ثم شغّل ملف التحديث فوق التثبيت الحالي.</div>
  <h2>خطوات التحديث</h2><ol>
    <li>أغلق Mizan POS تمامًا.</li>
    <li>انقر مرتين على <code>Mizan-POS-Update.exe</code>.</li>
    <li>إذا ظهر SmartScreen اختر <strong>More info</strong> ثم <strong>Run anyway</strong>.</li>
    <li>أكمل التثبيت وافتح البرنامج من الاختصار المعتاد.</li>
    <li>سجل الدخول وتأكد من ظهور المنتجات والمبيعات القديمة.</li>
  </ol>
  <div class="hero success">هوية التطبيق ثابتة، لذلك يُحدّث الملف البرنامج نفسه دون إنشاء قاعدة بيانات جديدة.</div>
  <p class="meta">تحديث اختبار: 0.1.0/0.1.1 ← 0.1.2 — Windows 10/11 x64</p>`));
writeText(path.join(updateDirectory, 'SHA256.txt'), `${update.digest}  Mizan-POS-Update.exe\n`);

writeText(path.join(clientDirectory, 'START-HERE.html'), page('ابدأ من هنا — ميزان', `
  <h1>مرحبًا بك في نظام ميزان</h1>
  <div class="hero"><strong>ملف واحد فقط للتثبيت.</strong> النظام وقاعدة البيانات وكل المتطلبات موجودة داخل الحزمة.</div>
  <h2>التثبيت</h2><ol>
    <li>انقر مرتين على <code>Mizan-POS-Setup.exe</code>.</li>
    <li>عند ظهور حماية Windows اختر <strong>More info</strong> ثم <strong>Run anyway</strong>.</li>
    <li>أكمل التثبيت ثم افتح Mizan POS من سطح المكتب.</li>
    <li>اتبع معالج الإعداد الأول وأدخل بيانات متجرك.</li>
  </ol>
  <h2>ملاحظات مهمة</h2><ul>
    <li>لا تغلق الجهاز بالقوة أثناء تشغيل عملية بيع أو نسخة احتياطية.</li>
    <li>أنشئ Backup دوريًا من قائمة الإدارة واحفظ نسخة خارج الجهاز.</li>
    <li>لا ترسل كلمة مرور المدير لأي شخص.</li>
    <li>عند الحاجة للمساعدة تواصل مع مقدم النظام من خلال قناة المشروع الرسمية.</li>
  </ul>
  <p class="meta">Mizan POS 0.1.2 — Windows 10/11 x64</p>`));
writeText(path.join(clientDirectory, 'SHA256.txt'), `${current.digest}  Mizan-POS-Setup.exe\n`);

writeText(path.join(deliveryRoot, 'ACCEPTANCE-CHECKLIST.html'), page('قائمة قبول Windows — المرحلة 15.4', `
  <h1>قائمة قبول التسليم التجاري — Windows</h1>
  <p>الجهاز/البيئة: ____________________ &nbsp; إصدار Windows: ____________________ &nbsp; التاريخ: ____________________</p>
  <div class="hero warning">ابدأ من Snapshot نظيف. لا تثبّت Node.js أو PostgreSQL أو Docker أو أدوات تطوير.</div>
  <h2>أولًا: التثبيت النظيف</h2><ol class="check">
    <li>☐ تنزيل حزمة التثبيت الأول عبر Edge، وليس Shared Folder.</li>
    <li>☐ توثيق رسالة SmartScreen كما ظهرت.</li>
    <li>☐ نجاح التثبيت دون أدوات أو أوامر إضافية.</li>
    <li>☐ ظهور اختصار سطح المكتب وStart Menu.</li>
    <li>☐ فتح معالج الإعداد الأول وعدم ظهور شاشة بيضاء أو خطأ خدمة.</li>
  </ol>
  <h2>ثانيًا: التشغيل التجاري</h2><ol class="check">
    <li>☐ إنشاء المتجر والمدير والخزينة والضريبة.</li>
    <li>☐ تسجيل دخول المدير.</li><li>☐ إنشاء تصنيف ومنتج وكمية مخزون.</li>
    <li>☐ فتح خزينة وتنفيذ عملية بيع وإظهار الإيصال.</li>
    <li>☐ إنشاء Backup يدوي وحفظه خارج مجلد التطبيق.</li>
  </ol>
  <h2>ثالثًا: الاستمرارية والتحديث</h2><ol class="check">
    <li>☐ إعادة تشغيل Windows وبقاء البيانات.</li>
    <li>☐ تثبيت 0.1.2 فوق 0.1.0 أو 0.1.1 دون إزالة النسخة القديمة.</li>
    <li>☐ ظهور الإصدار 0.1.2 وبقاء المستخدم والمنتج والمبيعات.</li>
    <li>☐ وجود Backup ما قبل التحديث داخل بيانات التطبيق.</li>
  </ol>
  <h2>رابعًا: الإزالة والاستعادة</h2><ol class="check">
    <li>☐ إزالة التطبيق من Windows Apps دون حذف بيانات العميل.</li>
    <li>☐ إعادة تثبيت 0.1.2 وعودة البيانات القديمة.</li>
    <li>☐ تجربة Restore من النسخة الاحتياطية.</li>
    <li>☐ تسجيل أي مشكلة بصورة، وقت حدوثها، والخطوة السابقة لها.</li>
  </ol>
  <table><tr><th>النتيجة النهائية</th><td>☐ ناجح &nbsp; ☐ ناجح بملاحظات &nbsp; ☐ مرفوض</td></tr>
  <tr><th>الملاحظات</th><td style="height:120px"></td></tr></table>`));

const freshZip = zipDirectory(freshDirectory, 'Mizan-POS-Fresh-Install-Test-0.1.0.zip');
const updateZip = zipDirectory(updateDirectory, 'Mizan-POS-Update-Test-0.1.2.zip');
const clientZip = zipDirectory(clientDirectory, 'Mizan-POS-Client-Delivery-0.1.2.zip');
const manifest = {
  format: 'mizan-windows-acceptance-kit',
  createdAt: new Date().toISOString(),
  platform: 'windows',
  arch: 'x64',
  stableAppId: 'com.mizan.pos',
  unsigned: true,
  artifacts: [
    { purpose: 'fresh-install-test', version: '0.1.0', file: path.basename(freshZip.destination), sha256: freshZip.digest },
    { purpose: 'update-test', version: '0.1.2', file: path.basename(updateZip.destination), sha256: updateZip.digest },
    { purpose: 'current-client-delivery', version: '0.1.2', file: path.basename(clientZip.destination), sha256: clientZip.digest },
  ],
};
writeText(path.join(deliveryRoot, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeText(path.join(packagesRoot, 'SHA256SUMS.txt'), `${manifest.artifacts
  .map(({ sha256: digest, file }) => `${digest}  ${file}`).join('\n')}\n`);

console.log(`Windows 15.4 acceptance kit created at ${deliveryRoot}`);
