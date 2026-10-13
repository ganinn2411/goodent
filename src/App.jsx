import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { supabase as sb } from './supabase'
import ScanPage from './ScanPage'
import { printCaseLabel, caseQrUrl } from './printCaseLabel'
import { STAGE_CODES, STAGE_DEF, STAGE_NAME_MAX, stageLabel } from './stages'

// Telefonun normal kamerasıyla okunan QR: https://site/?scan=1042
// Numarayı sakla, adresi hemen temizle (sayfa yenilenince tekrar taranmasın).
{
  const sp = new URLSearchParams(location.search).get('scan')
  if (sp && /^\d{1,12}$/.test(sp)) {
    sessionStorage.setItem('pendingScan', sp)
    history.replaceState(null, '', location.pathname + location.hash)
  }
}

// Şifre sıfırlama e-postasındaki bağlantı ile gelindi mi? (supabase adresi temizlemeden önce yakala)
if (/type=recovery/.test(location.hash + location.search)) sessionStorage.setItem('recovering', '1')
const RECOVERY = sessionStorage.getItem('recovering') === '1'
// E-postadaki bağlantının döneceği adres: .env'deki VITE_PUBLIC_URL, yoksa açık olan sayfa
const siteUrl = () => {
  const e = (import.meta.env.VITE_PUBLIC_URL || '').trim().replace(/\/+$/, '')
  return (e || (/^https?:$/.test(location.protocol) ? location.origin + location.pathname.replace(/\/[^/]*$/, '') : '')) + '/'
}

// Aşama adı: yöneticinin Ayarlar'da girdiği özel ad (SN) -> yoksa dilin varsayılanı. Bkz. stages.js
let SN = {}
const stg = k => stageLabel(k, LANG, SN)
const CS = { acik:'Açık', laboratuvarda:'Laboratuvarda', provada:'Provada', teslim_edildi:'Teslim edildi', iptal:'İptal' }
const TX = { satis_faturasi:'Satış faturası', alis_faturasi:'Alış faturası', tahsilat:'Tahsilat', odeme:'Ödeme', gider:'Gider' }
const WORK = ['Zirkon','Rezin','Veneer','Geçici Protez','Gece Plağı','Implant Üstü']
const ROLES = ['admin','receptionist','designer','technician','ceramist','qc','accountant']
const NAV = [['dash','📊','Dashboard'],['stat','📈','İstatistikler'],['isler','🦷','İşler'],['gorev','✅','Görevlerim'],['tara','📷','Barkod okut'],['randevu','📅','Randevular'],['cari','🏢','Cari Hesaplar'],['kasa','💰','Kasa & İşlemler'],['stok','📦','Stok'],['ekip','👥','Personel'],['ayar','⚙️','Ayarlar']]
const ROLE_DEF = {
  tr: { admin:'Yönetici', receptionist:'Resepsiyon', designer:'Tasarımcı', technician:'Teknisyen', ceramist:'Seramist', qc:'Kalite Kontrol', accountant:'Muhasebe' },
  en: { admin:'Admin', receptionist:'Reception', designer:'Designer', technician:'Technician', ceramist:'Ceramist', qc:'Quality control', accountant:'Accountant' },
  ar: { admin:'مدير', receptionist:'استقبال', designer:'مصمم', technician:'فني', ceramist:'سيراميست', qc:'مراقبة الجودة', accountant:'محاسب' } }
let RN = {}, LANG = 'tr'
const rn = r => (RN[LANG] || {})[r] || ROLE_DEF[LANG][r] || r
const DEF = { receptionist:['isler','gorev','randevu','stok'], designer:['isler','gorev'], technician:['isler','gorev','stok'], ceramist:['isler','gorev'], qc:['isler','gorev'], accountant:['stat'] }
const today = () => new Date().toISOString().slice(0, 10)
const fmt = d => d ? new Date(d).toLocaleString('tr-TR', { dateStyle:'short', timeStyle:'short' }) : '—'
const money = n => Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits:2 })
const stages = c => [...(c.case_stages || [])].sort((a, b) => a.seq - b.seq)
const done = c => ['teslim_edildi','iptal'].includes(c.status)
const late = c => c.due_date && !done(c) && c.due_date < today()

const loc = d => { const x = new Date(d); return new Date(x - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) }
const AR = {
'Aşama adları':'أسماء المراحل','Varsayılana dön':'استعادة الافتراضي','Aynı ada sahip iki aşama olamaz.':'لا يمكن أن يكون لمرحلتين الاسم نفسه.','Aşama adları varsayılana dönsün mü?':'هل تريد إعادة أسماء المراحل إلى الافتراضي؟',
'Malzeme talepleri':'طلبات المواد','＋ Malzeme iste':'＋ طلب مادة','Malzeme iste':'طلب مادة','📝 İste':'📝 اطلب','İsteyen':'الطالب','Durum':'الحالة','Bekliyor':'قيد الانتظار','Onaylandı':'تمت الموافقة','Sipariş verildi':'تم الطلب من المورد','Geldi':'وصلت','Reddedildi':'مرفوض','Açık talepler':'الطلبات المفتوحة','Talep yok':'لا توجد طلبات','— listede yok, elle yaz —':'— غير موجودة بالقائمة، اكتب الاسم —','Talebi gönder':'إرسال الطلب','Talebi iptal et':'إلغاء الطلب',
'Arşiv':'الأرشيف','🗄 Arşiv':'🗄 الأرشيف','♻ Geri yükle':'♻ استعادة','Bu iş arşivde':'هذه الشغلة في الأرشيف',
'Barkod okut':'مسح الباركود','🏷 Etiket yazdır':'🏷 طباعة الملصق',
'Dashboard':'لوحة المعلومات','İstatistikler':'الإحصائيات','İşler':'الأعمال','Görevlerim':'مهامي','Randevular':'المواعيد','Cari Hesaplar':'الحسابات الجارية','Kasa & İşlemler':'الصندوق والمعاملات','Stok':'المخزون','Personel':'الموظفون','🚪 Çıkış':'🚪 خروج',
'Kabul':'الاستلام','Tasarım':'التصميم','Üretim':'التصنيع','Porselen':'البورسلين','Kalite':'الجودة','Prova':'التجربة','Sevkiyat':'الشحن','Teslim':'التسليم',
'Açık':'مفتوح','Laboratuvarda':'في المختبر','Provada':'في التجربة','Teslim edildi':'تم التسليم','İptal':'ملغى',
'Satış faturası':'فاتورة مبيعات','Alış faturası':'فاتورة مشتريات','Tahsilat':'تحصيل','Ödeme':'دفع','Gider':'مصروف',
'Zirkon':'زركون','Rezin':'ريزن','Veneer':'فينير','Geçici Protez':'تركيبة مؤقتة','Gece Plağı':'واقي ليلي','Implant Üstü':'فوق الزرعة',
'admin':'مدير','receptionist':'استقبال','designer':'مصمم','technician':'فني','ceramist':'سيراميست','qc':'مراقبة الجودة','accountant':'محاسب',
'Yükleniyor…':'جارٍ التحميل…','Giriş':'دخول','Kayıt ol':'تسجيل','Yeni hesap':'حساب جديد','Girişe dön':'العودة للدخول','Ad Soyad':'الاسم الكامل','E-posta':'البريد الإلكتروني','Şifre':'كلمة المرور','Kayıt tamam, giriş yapabilirsin.':'تم التسجيل، يمكنك الدخول.',
'Şifremi unuttum':'نسيت كلمة المرور','Sıfırlama bağlantısını gönder':'إرسال رابط إعادة التعيين','E-posta adresini yaz, şifre sıfırlama bağlantısı gönderelim.':'اكتب بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور.','Bağlantı e-postana gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.':'تم إرسال الرابط إلى بريدك الإلكتروني. تحقق من صندوق الوارد (والرسائل غير المرغوبة).','Yeni şifre belirle':'تعيين كلمة مرور جديدة','Yeni şifre (tekrar)':'كلمة المرور الجديدة (تكرار)','Şifreyi kaydet':'حفظ كلمة المرور','Şifre en az 6 karakter olmalı':'يجب ألا تقل كلمة المرور عن 6 أحرف','Şifreler aynı değil':'كلمتا المرور غير متطابقتين','Şifre değişti. Giriş ekranına yönlendiriliyorsunuz…':'تم تغيير كلمة المرور. جارٍ تحويلك إلى شاشة الدخول…','Şifre değişti. Yeni şifrenle giriş yap.':'تم تغيير كلمة المرور. سجّل الدخول بكلمة المرور الجديدة.','Bağlantı geçersiz veya süresi dolmuş. Yeniden sıfırlama isteyin.':'الرابط غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.',
'Açık işler':'الأعمال المفتوحة','Geciken işler':'الأعمال المتأخرة','Bugün teslim':'تسليم اليوم','Bu ay teslim edilen':'المسلَّم هذا الشهر','Aşamalara göre işler':'الأعمال حسب المرحلة','İş türü dağılımı':'توزيع أنواع العمل','Personel yükü':'عبء الموظفين','Bugün teslim / geciken':'تسليم اليوم / المتأخر','Gecikti':'متأخر','Bugün':'اليوم','Veri yok':'لا توجد بيانات','Atanmamış':'غير معيّن','Bugün teslim veya geciken iş yok 🎉':'لا توجد أعمال متأخرة أو تسلَّم اليوم 🎉',
'Ara: hasta, doktor, no…':'بحث: مريض، طبيب، رقم…','Hepsi':'الكل','＋ Yeni iş':'＋ عمل جديد','No':'الرقم','Hasta':'المريض','Doktor':'الطبيب','İş':'العمل','İlerleme':'التقدم','Sorumlu':'المسؤول','İş bulunamadı':'لا توجد أعمال','— atanmadı —':'— غير معيّن —','✔ Bitir':'✔ إنهاء','🗄 Arşivle':'🗄 أرشفة','Yeni iş kabul':'استلام عمل جديد',
'— yeni doktor —':'— طبيب جديد —','Yeni doktor adı':'اسم الطبيب الجديد','Hasta adı':'اسم المريض','İş türü':'نوع العمل','Diş numaraları':'أرقام الأسنان','Renk':'اللون','Teslim tarihi':'تاريخ التسليم','Not':'ملاحظة','Kaydet':'حفظ','Fiyat (TL)':'السعر (TL)',
'Sana atanmış devam eden iş yok 👍':'لا توجد أعمال معيّنة لك 👍','Boşta':'متفرغ','Ara…':'بحث…','Kayıt yok':'لا توجد سجلات','Düzenle':'تعديل','Kayıt silinsin mi? (Veri tamamen silinmez, arşivlenir)':'حذف السجل؟',
'Yeni randevu':'موعد جديد','Başlık':'العنوان','Tarih':'التاريخ','Tarih / saat':'التاريخ / الوقت',
'Cari Hesaplar (klinikler & tedarikçiler)':'الحسابات الجارية (عيادات وموردون)','Yeni cari':'حساب جديد','Ad':'الاسم','Tür':'النوع','Müşteri':'عميل','Tedarikçi':'مورد','Telefon':'الهاتف','Adres':'العنوان','Müşteri (klinik)':'عميل (عيادة)',
'Yeni işlem':'معاملة جديدة','Cari':'الحساب','Tutar':'المبلغ','Açıklama':'الوصف','İşlem türü':'نوع المعاملة','Cari hesap':'الحساب الجاري','Para birimi':'العملة',
'Yeni malzeme':'مادة جديدة','Malzeme':'المادة','Marka':'الماركة','Miktar':'الكمية','Min.':'الحد الأدنى','Malzeme adı':'اسم المادة','Minimum stok':'الحد الأدنى للمخزون','± Hareket':'± حركة',
'Filtre':'تصفية','Tüm doktorlar':'كل الأطباء','Toplam iş':'إجمالي الأعمال','Teslim edilen':'المسلَّمة','Teslim edilmeyen':'غير المسلَّمة','Ciro (TL)':'الإيرادات (TL)','İş türüne göre':'حسب نوع العمل','Doktora göre':'حسب الطبيب','Tasarımcı performansı':'أداء المصممين','Teknisyen performansı':'أداء الفنيين','Teslim edilen iş türleri':'أنواع الأعمال المسلَّمة','Teslim edilmeyen iş türleri':'أنواع الأعمال غير المسلَّمة',
'Ayarlar':'الإعدادات','Genel':'عام','Laboratuvar adı':'اسم المختبر','Hesabım':'حسابي','Yeni şifre':'كلمة مرور جديدة','Şifreyi değiştir':'تغيير كلمة المرور','Yetkiler':'الصلاحيات','Rol':'الدور','Yedek':'نسخة احتياطية','Yedek indir (JSON)':'تنزيل نسخة احتياطية (JSON)','Dil':'اللغة','Hoş geldin,':'أهلاً بك،','Dental laboratuvar yönetim paneli':'لوحة إدارة مختبر الأسنان','Dental Laboratuvar Yönetimi':'إدارة مختبر الأسنان','Hangi rol hangi sayfayı görebilir. Kasa ve Cari sadece admin ile muhasebe rolüne açılabilir.':'أي دور يستطيع رؤية أي صفحة. الصندوق والحسابات الجارية للمدير والمحاسب فقط.','Tarih aralığı':'الفترة الزمنية','Tüm cariler':'كل الحسابات','🧾 Fatura / Ekstre':'🧾 فاتورة / كشف حساب','Tümü':'الكل','🖨 Yazdır / PDF':'🖨 طباعة / PDF','Fatura / Ekstre':'فاتورة / كشف حساب','Fatura / Hesap Ekstresi':'فاتورة / كشف حساب','Yönetici':'مدير','Resepsiyon':'استقبال','Tasarımcı':'مصمم','Teknisyen':'فني','Seramist':'سيراميست','Kalite Kontrol':'مراقبة الجودة','Muhasebe':'محاسب','Rol adları':'أسماء الأدوار','GG.AA.YYYY':'DD.MM.YYYY','SS:DD':'HH:MM','Dosyalar':'الملفات','＋ Dosya yükle':'＋ رفع ملف','Dosya yok':'لا توجد ملفات','👁 Aç':'👁 فتح'}
const EN = {
'Aşama adları':'Stage names','Varsayılana dön':'Reset to default','Aynı ada sahip iki aşama olamaz.':'Two stages cannot have the same name.','Aşama adları varsayılana dönsün mü?':'Reset stage names to default?',
'Malzeme talepleri':'Material requests','＋ Malzeme iste':'＋ Request material','Malzeme iste':'Request material','📝 İste':'📝 Request','İsteyen':'Requested by','Durum':'Status','Bekliyor':'Pending','Onaylandı':'Approved','Sipariş verildi':'Ordered','Geldi':'Arrived','Reddedildi':'Rejected','Açık talepler':'Open requests','Talep yok':'No requests','— listede yok, elle yaz —':'— not in list, type name —','Talebi gönder':'Send request','Talebi iptal et':'Cancel request',
'Arşiv':'Archive','🗄 Arşiv':'🗄 Archive','♻ Geri yükle':'♻ Restore','Bu iş arşivde':'This job is archived',
'Barkod okut':'Scan barcode','🏷 Etiket yazdır':'🏷 Print label',
'Dashboard':'Dashboard','İstatistikler':'Statistics','İşler':'Jobs','Görevlerim':'My Tasks','Randevular':'Appointments','Cari Hesaplar':'Accounts','Kasa & İşlemler':'Cash & Transactions','Stok':'Stock','Personel':'Staff','Ayarlar':'Settings','🚪 Çıkış':'🚪 Sign out',
'Kabul':'Intake','Tasarım':'Design','Üretim':'Production','Porselen':'Porcelain','Kalite':'Quality','Prova':'Try-in','Sevkiyat':'Shipping','Teslim':'Delivery',
'Açık':'Open','Laboratuvarda':'In lab','Provada':'In try-in','Teslim edildi':'Delivered','İptal':'Cancelled',
'Satış faturası':'Sales invoice','Alış faturası':'Purchase invoice','Tahsilat':'Collection','Ödeme':'Payment','Gider':'Expense',
'Zirkon':'Zirconia','Rezin':'Resin','Veneer':'Veneer','Geçici Protez':'Temporary prosthesis','Gece Plağı':'Night guard','Implant Üstü':'Implant crown',
'Yönetici':'Admin','Resepsiyon':'Reception','Tasarımcı':'Designer','Teknisyen':'Technician','Seramist':'Ceramist','Kalite Kontrol':'Quality control','Muhasebe':'Accountant',
'Yükleniyor…':'Loading…','Giriş':'Sign in','Kayıt ol':'Sign up','Yeni hesap':'New account','Girişe dön':'Back to sign in','Ad Soyad':'Full name','E-posta':'Email','Şifre':'Password','Kayıt tamam, giriş yapabilirsin.':'Registered, you can sign in now.',
'Şifremi unuttum':'Forgot password','Sıfırlama bağlantısını gönder':'Send reset link','E-posta adresini yaz, şifre sıfırlama bağlantısı gönderelim.':'Enter your email and we will send you a password reset link.','Bağlantı e-postana gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.':'Link sent to your email. Check your inbox (and spam folder).','Yeni şifre belirle':'Set a new password','Yeni şifre (tekrar)':'New password (repeat)','Şifreyi kaydet':'Save password','Şifre en az 6 karakter olmalı':'Password must be at least 6 characters','Şifreler aynı değil':'Passwords do not match','Şifre değişti. Giriş ekranına yönlendiriliyorsunuz…':'Password changed. Redirecting to sign in…','Şifre değişti. Yeni şifrenle giriş yap.':'Password changed. Sign in with your new password.','Bağlantı geçersiz veya süresi dolmuş. Yeniden sıfırlama isteyin.':'The link is invalid or expired. Request a new one.',
'Açık işler':'Open jobs','Geciken işler':'Late jobs','Bugün teslim':'Due today','Bu ay teslim edilen':'Delivered this month','Aşamalara göre işler':'Jobs by stage','İş türü dağılımı':'Job type distribution','Personel yükü':'Staff workload','Bugün teslim / geciken':'Due today / late','Gecikti':'Late','Bugün':'Today','Veri yok':'No data','Atanmamış':'Unassigned','Bugün teslim veya geciken iş yok 🎉':'Nothing due today or late 🎉',
'Ara: hasta, doktor, no…':'Search: patient, doctor, no…','Hepsi':'All','＋ Yeni iş':'＋ New job','No':'No','Hasta':'Patient','Doktor':'Doctor','İş':'Job','İlerleme':'Progress','Sorumlu':'Assigned to','İş bulunamadı':'No jobs found','— atanmadı —':'— unassigned —','✔ Bitir':'✔ Finish','🗄 Arşivle':'🗄 Archive','Yeni iş kabul':'New job intake',
'— yeni doktor —':'— new doctor —','Yeni doktor adı':'New doctor name','Hasta adı':'Patient name','İş türü':'Job type','Diş numaraları':'Tooth numbers','Renk':'Shade','Teslim tarihi':'Due date','Not':'Note','Kaydet':'Save','Fiyat (TL)':'Price (TL)',
'Sana atanmış devam eden iş yok 👍':'No active jobs assigned to you 👍','Boşta':'Idle','Ara…':'Search…','Kayıt yok':'No records','Düzenle':'Edit',
'Yeni randevu':'New appointment','Başlık':'Title','Tarih':'Date','Tarih / saat':'Date / time',
'Cari Hesaplar (klinikler & tedarikçiler)':'Accounts (clinics & suppliers)','Yeni cari':'New account','Ad':'Name','Tür':'Type','Müşteri':'Customer','Tedarikçi':'Supplier','Telefon':'Phone','Adres':'Address','Müşteri (klinik)':'Customer (clinic)',
'Yeni işlem':'New transaction','Cari':'Account','Tutar':'Amount','Açıklama':'Description','İşlem türü':'Transaction type','Cari hesap':'Account','Para birimi':'Currency',
'Yeni malzeme':'New item','Malzeme':'Item','Marka':'Brand','Miktar':'Quantity','Min.':'Min.','Malzeme adı':'Item name','Minimum stok':'Minimum stock','± Hareket':'± Movement',
'Filtre':'Filter','Tüm doktorlar':'All doctors','Toplam iş':'Total jobs','Teslim edilen':'Delivered','Teslim edilmeyen':'Not delivered','Ciro (TL)':'Revenue (TL)','İş türüne göre':'By job type','Doktora göre':'By doctor','Tasarımcı performansı':'Designer performance','Teknisyen performansı':'Technician performance','Teslim edilen iş türleri':'Delivered job types','Teslim edilmeyen iş türleri':'Undelivered job types',
'Genel':'General','Laboratuvar adı':'Lab name','Hesabım':'My account','Yeni şifre':'New password','Şifreyi değiştir':'Change password','Yetkiler':'Permissions','Rol':'Role','Rol adları':'Role names','Yedek':'Backup','Yedek indir (JSON)':'Download backup (JSON)','Dil':'Language','Hoş geldin,':'Welcome,','Dental laboratuvar yönetim paneli':'Dental laboratory management panel','Dental Laboratuvar Yönetimi':'Dental Laboratory Management','Hangi rol hangi sayfayı görebilir. Kasa ve Cari sadece admin ile muhasebe rolüne açılabilir.':'Which role can see which page. Cash and Accounts can only be opened to admin and accountant roles.',
'Tarih aralığı':'Date range','Tüm cariler':'All accounts','🧾 Fatura / Ekstre':'🧾 Invoice / Statement','Tümü':'All','🖨 Yazdır / PDF':'🖨 Print / PDF','Fatura / Ekstre':'Invoice / Statement','Fatura / Hesap Ekstresi':'Invoice / Account Statement',
'Dosyalar':'Files','＋ Dosya yükle':'＋ Upload file','Dosya yok':'No files','👁 Aç':'👁 Open','GG.AA.YYYY':'DD.MM.YYYY','SS:DD':'HH:MM'}
const DICT = { ar: AR, en: EN }
const orig = new WeakMap()
function trNode(n, D) {
  let cur = n.nodeValue; const o = orig.get(n)
  if (o && o.t === cur) { if (o.d === D) return; n.nodeValue = cur = o.s; orig.delete(n) }
  if (!D) return
  const t = cur.trim(); let out = D[t]
  if (!out) { const m = t.match(/^(.+?)( \(.*|\s·.*)$/); if (m && D[m[1]]) out = D[m[1]] + m[2] }
  if (out) { const v = cur.replace(t, out); orig.set(n, { s: cur, t: v, d: D }); n.nodeValue = v }
}
function trAttr(el, D) {
  let v = el.getAttribute('placeholder'); const o = el._o
  if (o && o.t === v) { if (o.d === D) return; el.setAttribute('placeholder', v = o.s); el._o = null }
  if (!D) return
  const out = D[v]; if (out) { el._o = { s: v, t: out, d: D }; el.setAttribute('placeholder', out) }
}
function useTr(lang) {
  useEffect(() => {
    const D = DICT[lang] || null; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lang
    const root = document.getElementById('root')
    const walk = n => { if (n.nodeType === 3) return trNode(n, D); if (n.nodeType !== 1) return
      if (n.hasAttribute('placeholder')) trAttr(n, D); n.childNodes.forEach(walk) }
    walk(root)
    const mo = new MutationObserver(ms => ms.forEach(m => { if (m.type === 'characterData') trNode(m.target, D); else if (m.type === 'attributes') trAttr(m.target, D); else m.addedNodes.forEach(walk) }))
    mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder'] })
    return () => mo.disconnect()
  }, [lang])
}

export default function App() {
  const [s, setS] = useState(null), [ok, setOk] = useState(false), [lang, setLang] = useState(localStorage.getItem('lang') || 'tr'), [rec, setRec] = useState(RECOVERY), [notice, setNotice] = useState('')
  useTr(lang); useTilt()
  const setL = n => { localStorage.setItem('lang', n); setLang(n) }
  // Şifre sıfırlama bitince: oturumu KAPAT, giriş ekranına dön (otomatik giriş yok)
  const finishRec = async msg => {
    sessionStorage.removeItem('recovering')
    await sb.auth.signOut({ scope: 'local' })
    setNotice(msg || ''); setS(null); setRec(false)
  }
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setS(data.session); setOk(true) })
    const { data } = sb.auth.onAuthStateChange((ev, x) => { if (ev === 'PASSWORD_RECOVERY') { sessionStorage.setItem('recovering', '1'); setRec(true) } setS(x) })
    return () => data.subscription.unsubscribe()
  }, [])
  if (!ok) return <div className="boot">Yükleniyor…</div>
  if (rec) return <Recovery lang={lang} setL={setL} hasSession={!!s} onDone={finishRec} />
  return s ? <Shell user={s.user} lang={lang} setL={setL} /> : <Login lang={lang} setL={setL} notice={notice} />
}

function Login({ lang, setL, notice }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [name, setName] = useState(''), [up, setUp] = useState(false)
  const [msg, setMsg] = useState(notice || ''), [bad, setBad] = useState(false), [busy, setBusy] = useState(false), [show, setShow] = useState(false), [fg, setFg] = useState(false)
  async function go(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setMsg('')
    if (fg) {
      const r = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: siteUrl() })
      setBad(!!r.error)
      setMsg(r.error ? r.error.message : 'Bağlantı e-postana gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.')
      setBusy(false); return
    }
    const r = up ? await sb.auth.signUp({ email: email.trim(), password: pw, options: { data: { full_name: name } } }) : await sb.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBad(!!r.error)
    setMsg(r.error ? r.error.message : up ? 'Kayıt tamam, giriş yapabilirsin.' : '')
    setBusy(false)
  }
  const tab = u => { setUp(u); setFg(false); setMsg('') }
  return <div className="auth">
    <div className="auth-lang"><LangPick lang={lang} setL={setL} /></div>
    <div className="auth-hero"><Tooth3D /><h1>Goodent</h1><p>Dental Laboratuvar Yönetimi</p></div>
    <form className="auth-card" onSubmit={go}>
      {!fg && <div className="auth-tabs"><button type="button" className={up ? '' : 'on'} onClick={() => tab(false)}>Giriş</button><button type="button" className={up ? 'on' : ''} onClick={() => tab(true)}>Yeni hesap</button></div>}
      {up && !fg && <label>Ad Soyad<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></label>}
      <label>E-posta<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
      {!fg && <label>Şifre<div className="auth-pw"><input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} autoComplete={up ? 'new-password' : 'current-password'} required />
        <button type="button" className="auth-eye" onClick={() => setShow(!show)} aria-label="👁">{show ? '🙈' : '👁'}</button></div></label>}
      {fg && <p className="auth-msg" style={{ color: 'var(--mut)' }}>E-posta adresini yaz, şifre sıfırlama bağlantısı gönderelim.</p>}
      {!fg && !up && <button type="button" className="auth-link" onClick={() => { setFg(true); setMsg('') }}>Şifremi unuttum</button>}
      <button className="btn btn-p auth-go" disabled={busy}>{busy ? '…' : fg ? 'Sıfırlama bağlantısını gönder' : up ? 'Kayıt ol' : 'Giriş'}</button>
      {fg && <button type="button" className="auth-link" onClick={() => { setFg(false); setMsg('') }}>Girişe dön</button>}
      {msg && <p className={'auth-msg ' + (bad ? 'bad' : 'ok')}>{msg}</p>}
    </form>
  </div>
}

function Recovery({ lang, setL, hasSession, onDone }) {
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState(''), [show, setShow] = useState(false)
  const [msg, setMsg] = useState(''), [bad, setBad] = useState(false), [busy, setBusy] = useState(false)
  async function go(e) {
    e.preventDefault()
    if (busy) return
    if (pw.length < 6) { setBad(true); return setMsg('Şifre en az 6 karakter olmalı') }
    if (pw !== pw2) { setBad(true); return setMsg('Şifreler aynı değil') }
    setBusy(true)
    const { error } = await sb.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setBad(true); return setMsg(error.message) }
    setBad(false); setMsg('Şifre değişti. Giriş ekranına yönlendiriliyorsunuz…')
    setTimeout(() => onDone('Şifre değişti. Yeni şifrenle giriş yap.'), 1200)
  }
  return <div className="auth">
    <div className="auth-lang"><LangPick lang={lang} setL={setL} /></div>
    <div className="auth-hero"><Tooth3D /><h1>Goodent</h1><p>Dental Laboratuvar Yönetimi</p></div>
    {hasSession ? <form className="auth-card" onSubmit={go}>
      <h3 style={{ margin: 0, textAlign: 'center' }}>Yeni şifre belirle</h3>
      <label>Yeni şifre<div className="auth-pw"><input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" required />
        <button type="button" className="auth-eye" onClick={() => setShow(!show)} aria-label="👁">{show ? '🙈' : '👁'}</button></div></label>
      <label>Yeni şifre (tekrar)<input type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" required /></label>
      <button className="btn btn-p auth-go" disabled={busy}>{busy ? '…' : 'Şifreyi kaydet'}</button>
      {msg && <p className={'auth-msg ' + (bad ? 'bad' : 'ok')}>{msg}</p>}
    </form> : <div className="auth-card">
      <p className="auth-msg bad">Bağlantı geçersiz veya süresi dolmuş. Yeniden sıfırlama isteyin.</p>
      <button className="btn btn-p auth-go" onClick={() => onDone()}>Girişe dön</button>
    </div>}
  </div>
}

function Shell({ user, lang, setL }) {
  const [page, setPage] = useState(() => sessionStorage.getItem('pendingScan') ? 'tara' : 'dash'), [menu, setMenu] = useState(false)
  const [cases, setCases] = useState([]), [staff, setStaff] = useState([]), [me, setMe] = useState(null), [settings, setSettings] = useState({})
  const load = useCallback(async () => {
    const [c, p, m, st] = await Promise.all([
      sb.from('cases').select('*, patients(full_name), doctors(full_name), case_stages(*)').is('deleted_at', null).order('due_date'),
      sb.from('profiles').select('id,full_name,role').eq('active', true),
      sb.from('profiles').select('*').eq('id', user.id).single(),
      sb.from('app_settings').select('*')])
    setCases(c.data || []); setStaff(p.data || []); setMe(m.data); setSettings(Object.fromEntries((st.data || []).map(d => [d.id, d.value])))
  }, [user.id])
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])
  useEffect(() => { document.body.classList.toggle('noscroll', menu); return () => document.body.classList.remove('noscroll') }, [menu])
  const name = id => staff.find(s => s.id === id)?.full_name || '—'
  const rnRaw = settings.role_names || {}; RN = ROLES.some(k => k in rnRaw) ? { tr: rnRaw } : rnRaw; LANG = lang
  SN = settings.stage_names || {}
  const role = me?.role, rp = { ...DEF, ...(settings.role_pages || {}) }
  const ok = p => p === 'dash' || p === 'tara' || role === 'admin' || (p !== 'ayar' && (!['cari', 'kasa'].includes(p) || role === 'accountant') && (rp[role] || []).includes(p))
  const cur = ok(page) ? page : 'dash'
  const saveSet = async (id, value) => { const { error } = await sb.from('app_settings').upsert({ id, value }); if (error) return alert(error.message); load() }
  const ctx = { cases, staff, me, name, load, user, settings }
  const pages = {
    dash: <Dash {...ctx} />, stat: <Stats {...ctx} showMoney={ok('kasa')} />, ayar: <Settings {...ctx} saveSet={saveSet} lang={lang} setL={setL} />, isler: <Jobs {...ctx} />, gorev: <Mine {...ctx} />, ekip: <Team {...ctx} />, tara: <ScanPage lang={lang} stageNames={settings.stage_names} onClose={() => setPage('dash')} />,
    randevu: <Crud title="Randevular" table="appointments" sel="*, doctors(full_name)" order={['starts_at', true]} add="Yeni randevu"
      cols={[{ label:'Başlık', k:'title' }, { label:'Tarih', r: r => fmt(r.starts_at) }, { label:'Doktor', r: r => r.doctors?.full_name || '—' }, { k:'notes', label:'Not' }]}
      fields={[{ k:'title', label:'Başlık', required:true, w:1 }, { k:'starts_at', label:'Tarih / saat', type:'datetime-local', required:true }, { k:'doctor_id', label:'Doktor', type:'select', from:['doctors','id','full_name'] }, { k:'notes', label:'Not', type:'textarea', w:1 }]} />,
    cari: <Crud title="Cari Hesaplar (klinikler & tedarikçiler)" table="accounts" order={['name', true]} add="Yeni cari"
      cols={[{ k:'name', label:'Ad' }, { label:'Tür', r: r => <span className={'pill ' + (r.type === 'musteri' ? '' : 'y')}>{r.type === 'musteri' ? 'Müşteri' : 'Tedarikçi'}</span> }, { k:'phone', label:'Telefon' }, { k:'address', label:'Adres' }]}
      fields={[{ k:'name', label:'Ad', required:true, w:1 }, { k:'type', label:'Tür', type:'select', options:[{ v:'musteri', l:'Müşteri (klinik)' }, { v:'tedarikci', l:'Tedarikçi' }], def:'musteri' }, { k:'phone', label:'Telefon' }, { k:'address', label:'Adres', w:1 }]} />,
    kasa: <Kasa settings={settings} />,
    stok: <Stok me={me} name={name} user={user} />,
  }
  return <div className="app">
    {menu && <div className="scrim" onClick={() => setMenu(false)} />}
    <aside className={'side ' + (menu ? 'open' : '')}>
      <div className="logo"><i>🦷</i>{settings.lab_name || 'Goodent'}</div>
      {NAV.filter(n => ok(n[0])).map(([k, ic, l]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => { setPage(k); setMenu(false) }}>{ic} {l}</button>)}
      <div className="sp" /><button onClick={() => sb.auth.signOut()}>🚪 Çıkış</button>
    </aside>
    <div className="main">
      <div className="top"><button className="burger" onClick={() => setMenu(!menu)}>☰</button><h2>{NAV.find(n => n[0] === cur)[2]}</h2>
        <div className="user"><LangPick lang={lang} setL={setL} /><span className="uname">{me?.full_name}</span><div className="av">{(me?.full_name || '?')[0].toUpperCase()}</div></div></div>
      <div className="page" key={cur}>{pages[cur]}</div>
    </div></div>
}

const Stat = ({ label, value, c }) => <div className="stat" style={{ '--c': c }}><small>{label}</small><b>{value}</b></div>
function Bars({ data }) {
  const max = Math.max(1, ...data.map(d => d[1]))
  return data.length ? data.map(([k, v]) => <div className="bar" key={k}><span>{k}</span><div><i style={{ width: v / max * 100 + '%' }} /></div><b>{v}</b></div>) : <p className="empty">Veri yok</p>
}
const count = (arr, f) => Object.entries(arr.reduce((m, x) => { const k = f(x) || '—'; m[k] = (m[k] || 0) + 1; return m }, {}))

function Dash({ cases, name, me }) {
  const open = cases.filter(c => !done(c)), month = today().slice(0, 7)
  const active = open.flatMap(c => stages(c).filter(s => s.status === 'devam'))
  const todayList = open.filter(c => c.due_date === today() || late(c))
  return <div className="fit dash">
    <div className="hero"><div><h1>Hoş geldin, {me?.full_name} 👋</h1><p>Dental laboratuvar yönetim paneli</p></div><Tooth3D /></div>
    <div className="cards">
      <Stat label="Açık işler" value={open.length} c="#2563eb" />
      <Stat label="Geciken işler" value={open.filter(late).length} c="#dc2626" />
      <Stat label="Bugün teslim" value={open.filter(c => c.due_date === today()).length} c="#f59e0b" />
      <Stat label="Bu ay teslim edilen" value={cases.filter(c => c.delivered_at?.startsWith(month)).length} c="#16a34a" />
    </div>
    <div className="cols">
      <div className="panel"><h3>Aşamalara göre işler</h3><Bars data={count(active, s => stg(s.stage))} /></div>
      <div className="panel"><h3>İş türü dağılımı</h3><Bars data={count(open, c => c.work_type)} /></div>
      <div className="panel"><h3>Personel yükü</h3><Bars data={count(active, s => s.assigned_to ? name(s.assigned_to) : 'Atanmamış')} /></div>
    </div>
    <div className="panel"><h3>Bugün teslim / geciken</h3>
      {todayList.length ? <div className="tw"><table><tbody>{todayList.map(c => <tr key={c.id}><td>#{c.case_no}</td><td>{c.patients?.full_name}</td><td>Dr. {c.doctors?.full_name}</td><td>{c.work_type}</td><td>{c.due_date}</td><td>{late(c) ? <span className="pill r">Gecikti</span> : <span className="pill y">Bugün</span>}</td></tr>)}</tbody></table></div> : <p className="empty">Bugün teslim veya geciken iş yok 🎉</p>}</div>
  </div>
}

const Steps = ({ c }) => <div className="steps">{stages(c).map(s => <i key={s.id} className={s.status} title={stg(s.stage)} />)}</div>

function Jobs({ cases, staff, name, load, user }) {
  const [q, setQ] = useState(''), [fs, setFs] = useState('open'), [sel, setSel] = useState(null), [nw, setNw] = useState(false)
  const [arch, setArch] = useState([]), [av, setAv] = useState(0)
  useEffect(() => {
    if (fs !== 'arsiv') return
    sb.from('cases').select('*, patients(full_name), doctors(full_name), case_stages(*)').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).then(r => setArch(r.data || []))
  }, [fs, av])
  const list = (fs === 'arsiv' ? arch : cases).filter(c => (fs === 'all' || fs === 'arsiv' || (fs === 'open' ? !done(c) : c.status === fs)) &&
    `${c.case_no} ${c.patients?.full_name} ${c.doctors?.full_name} ${c.work_type}`.toLowerCase().includes(q.toLowerCase()))
  const cur = (fs === 'arsiv' ? arch : cases).find(c => c.id === sel)
  const assign = async (id, u) => { const { error } = await sb.from('case_stages').update({ assigned_to: u || null }).eq('id', id); if (error) alert(error.message); load() }
  const finish = async id => { const { error } = await sb.from('case_stages').update({ status:'bitti' }).eq('id', id); if (error) alert(error.message); load() }
  const restore = async () => { const { error } = await sb.from('cases').update({ deleted_at: null }).eq('id', cur.id); if (error) return alert(error.message); setSel(null); setAv(v => v + 1); load() }
  const archive = async () => { if (!confirm('Bu iş arşivlensin mi? (Veri silinmez, listeden kalkar)')) return; await sb.from('cases').update({ deleted_at: new Date().toISOString() }).eq('id', cur.id); setSel(null); load() }
  return <div className="panel">
    <div className="ph"><h3>{fs === 'arsiv' ? 'Arşiv' : 'İşler'} ({list.length})</h3>
      <input className="srch" placeholder="Ara: hasta, doktor, no…" value={q} onChange={e => setQ(e.target.value)} />
      <select style={{ width:'auto' }} value={fs} onChange={e => setFs(e.target.value)}><option value="open">Açık işler</option><option value="all">Hepsi</option><option value="arsiv">🗄 Arşiv</option>{Object.entries(CS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className="btn btn-p" onClick={() => setNw(true)}>＋ Yeni iş</button></div>
    <div className="tw"><table className="jobs"><thead><tr><th>No</th><th>Hasta</th><th>Doktor</th><th>İş</th><th>İlerleme</th><th>Sorumlu</th><th>Teslim</th></tr></thead>
      <tbody>{list.map(c => { const cs = stages(c).find(s => s.status === 'devam')
        return <tr key={c.id} className="clk" onClick={() => setSel(c.id)}><td>#{c.case_no}</td><td>{c.patients?.full_name}</td><td>{c.doctors?.full_name}</td><td><span className="pill">{c.work_type}</span></td>
          <td><Steps c={c} /><small>{stg(c.current_stage)}</small></td><td>{name(cs?.assigned_to)}</td><td>{c.due_date || '—'} {late(c) && !c.deleted_at && <span className="pill r">Gecikti</span>}</td></tr> })}</tbody></table>
      {!list.length && <p className="empty">İş bulunamadı</p>}</div>
    {cur && <Modal title={`#${cur.case_no} · ${cur.patients?.full_name}`} onClose={() => setSel(null)}>
      <p className="muted">Dr. {cur.doctors?.full_name} · {cur.work_type} · Diş: {cur.tooth_numbers || '—'} · Renk: {cur.shade || '—'} · Teslim: {cur.due_date || '—'}</p>
      {cur.deleted_at && <p><span className="pill y">Bu iş arşivde</span> <small>{fmt(cur.deleted_at)}</small></p>}
      {cur.notes && <p>{cur.notes}</p>}
      {stages(cur).map(s => <div key={s.id} className={'tlr ' + s.status}><span className="dot" /><b>{stg(s.stage)}</b>
        <select value={s.assigned_to || ''} disabled={s.status === 'bitti' || !!cur.deleted_at} onChange={e => assign(s.id, e.target.value)}><option value="">— atanmadı —</option>{staff.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        {s.status === 'devam' && !cur.deleted_at ? <button className="btn btn-ok" onClick={() => finish(s.id)}>✔ Bitir</button> : <small>{s.finished_at ? fmt(s.finished_at) : ''}</small>}</div>)}
      <Files cid={cur.id} user={user} name={name} /><br /><CaseQR no={cur.case_no} /><button className="btn btn-g" onClick={() => printCaseLabel({ case_no: cur.case_no, patient: cur.patients?.full_name, doctor: cur.doctors?.full_name, work_type: cur.work_type, tooth_numbers: cur.tooth_numbers, due_date: cur.due_date })}>🏷 Etiket yazdır</button> {cur.deleted_at ? <button className="btn btn-ok" onClick={restore}>♻ Geri yükle</button> : <button className="btn btn-g" onClick={archive}>🗄 Arşivle</button>}</Modal>}
    {nw && <Modal title="Yeni iş kabul" onClose={() => setNw(false)}><NewCase onDone={() => { setNw(false); load() }} /></Modal>}
  </div>
}

function NewCase({ onDone }) {
  const [docs, setDocs] = useState([]), [f, setF] = useState({ doctor_id:'', newDoctor:'', patient:'', work_type:WORK[0], tooth_numbers:'', shade:'', due_date:'', notes:'' })
  const set = k => e => setF({ ...f, [k]: e.target.value })
  useEffect(() => { sb.from('doctors').select('id,full_name').is('deleted_at', null).then(r => setDocs(r.data || [])) }, [])
  async function save() {
    if (!f.patient || (!f.doctor_id && !f.newDoctor)) return alert('Doktor ve hasta adı gerekli')
    let did = f.doctor_id
    if (!did) { const d = await sb.from('doctors').insert({ full_name: f.newDoctor }).select().single(); if (d.error) return alert(d.error.message); did = d.data.id }
    const p = await sb.from('patients').insert({ full_name: f.patient }).select().single(); if (p.error) return alert(p.error.message)
    const c = await sb.from('cases').insert({ doctor_id: did, patient_id: p.data.id, work_type: f.work_type, tooth_numbers: f.tooth_numbers, shade: f.shade, notes: f.notes, due_date: f.due_date || null }).select().single()
    if (c.error) return alert(c.error.message)
    printCaseLabel({ case_no: c.data.case_no, patient: f.patient, doctor: f.doctor_id ? docs.find(d => d.id === f.doctor_id)?.full_name : f.newDoctor, work_type: f.work_type, tooth_numbers: f.tooth_numbers, due_date: f.due_date }).catch(() => {})
    onDone()
  }
  return <><div className="fg">
    <label>Doktor<select value={f.doctor_id} onChange={set('doctor_id')}><option value="">— yeni doktor —</option>{docs.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></label>
    {!f.doctor_id ? <label>Yeni doktor adı<input value={f.newDoctor} onChange={set('newDoctor')} /></label> : <span />}
    <label>Hasta adı<input value={f.patient} onChange={set('patient')} /></label>
    <label>İş türü<select value={f.work_type} onChange={set('work_type')}>{WORK.map(w => <option key={w}>{w}</option>)}</select></label>
    <label>Diş numaraları<input placeholder="11,12,21" value={f.tooth_numbers} onChange={set('tooth_numbers')} /></label>
    <label>Renk<input value={f.shade} onChange={set('shade')} /></label>
    <label>Teslim tarihi<DateInput value={f.due_date} onChange={v => setF({ ...f, due_date: v })} /></label>
    <label className="w">Not<textarea rows="3" value={f.notes} onChange={set('notes')} /></label></div>
    <button className="btn btn-p" onClick={save}>Kaydet</button></>
}

function Mine({ cases, user, load }) {
  const mine = cases.flatMap(c => stages(c).filter(s => s.assigned_to === user.id && s.status === 'devam').map(s => ({ c, s })))
  const finish = async id => { const { error } = await sb.from('case_stages').update({ status:'bitti' }).eq('id', id); if (error) alert(error.message); load() }
  return <div className="cols">{mine.map(({ c, s }) => <div key={s.id} className="panel" style={late(c) ? { borderLeft:'5px solid var(--bad)' } : {}}>
    <b>#{c.case_no}</b> <span className="pill">{stg(s.stage)}</span><h3 style={{ marginTop:8 }}>{c.patients?.full_name} · {c.work_type}</h3>
    <p className="muted">Diş: {c.tooth_numbers || '—'} · Renk: {c.shade || '—'} · Teslim: {c.due_date || '—'}</p><p>{c.notes}</p>
    <button className="btn btn-ok" onClick={() => finish(s.id)}>✔ Bitir</button></div>)}
    {!mine.length && <div className="panel empty">Sana atanmış devam eden iş yok 👍</div>}</div>
}

function Stok({ me, name, user }) {
  const [av, setAv] = useState(0), [pre, setPre] = useState(null)
  return <>
    <Crud key={av} title="Stok" table="inventory_items" view="stock_levels" soft={false} order={['name', true]} add="Yeni malzeme"
      cols={[{ k:'name', label:'Malzeme' }, { k:'brand', label:'Marka' }, { label:'Miktar', r: r => <span className={'pill ' + (r.low ? 'r' : 'g')}>{Number(r.qty)}</span> }, { k:'min_level', label:'Min.' }]}
      fields={[{ k:'name', label:'Malzeme adı', required:true, w:1 }, { k:'brand', label:'Marka' }, { k:'min_level', label:'Minimum stok', type:'number', def:0 }]}
      extra={(r, reload) => <><button className="btn btn-g" onClick={() => setPre({ item_id: r.id, item_name: r.name })}>📝 İste</button><button className="btn btn-g" onClick={async () => { const q = prompt('Miktar (giriş: 5, çıkış: -2)'); if (!q || isNaN(q)) return; const { error } = await sb.from('stock_movements').insert({ item_id:r.id, qty:Number(q) }); if (error) alert(error.message); reload() }}>± Hareket</button></>} />
    <MatReq me={me} name={name} user={user} pre={pre} clearPre={() => setPre(null)} onStock={() => setAv(v => v + 1)} />
  </>
}

const RQ = { bekliyor:['Bekliyor', 'y'], onaylandi:['Onaylandı', ''], siparis:['Sipariş verildi', ''], geldi:['Geldi', 'g'], red:['Reddedildi', 'r'], iptal:['İptal', ''] }

function MatReq({ me, name, user, pre, clearPre, onStock }) {
  const mgr = ['admin', 'receptionist'].includes(me?.role)
  const [rows, setRows] = useState([]), [items, setItems] = useState([]), [open, setOpen] = useState(false), [fs, setFs] = useState('open'), [err, setErr] = useState(false)
  const [f, setF] = useState({ item_id:'', item_name:'', qty:'', note:'' })
  const load = useCallback(async () => {
    const { data, error } = await sb.from('material_requests').select('*').is('deleted_at', null).order('created_at', { ascending: false })
    setErr(!!error); setRows(data || [])
  }, [])
  useEffect(() => { load(); sb.from('inventory_items').select('id,name').is('deleted_at', null).order('name').then(r => setItems(r.data || [])) }, [load])
  useEffect(() => { if (pre) { setF({ item_id: pre.item_id, item_name: pre.item_name, qty:'', note:'' }); setOpen(true); clearPre() } }, [pre])
  const openNew = () => { setF({ item_id:'', item_name:'', qty:'', note:'' }); setOpen(true) }
  async function save() {
    const nm = f.item_id ? items.find(i => i.id === f.item_id)?.name : f.item_name.trim()
    if (!nm) return alert('Malzeme adı gerekli')
    const q = Number(f.qty); if (!q || q <= 0) return alert('Miktar gerekli')
    const { error } = await sb.from('material_requests').insert({ item_id: f.item_id || null, item_name: nm, qty: q, note: f.note || null, requested_by: user.id })
    if (error) return alert(error.message)
    setOpen(false); load()
  }
  async function setStatus(r, status) {
    const { error } = await sb.from('material_requests').update({ status, handled_by: user.id }).eq('id', r.id)
    if (error) return alert(error.message)
    if (status === 'geldi' && r.item_id && confirm(`Stoğa giriş yapılsın mı? (+${r.qty} ${r.item_name})`)) {
      const m = await sb.from('stock_movements').insert({ item_id: r.item_id, qty: Number(r.qty), note: 'Malzeme talebi' })
      if (m.error) alert(m.error.message); else onStock()
    }
    load()
  }
  const list = rows.filter(r => fs === 'all' || ['bekliyor', 'onaylandi', 'siparis'].includes(r.status))
  return <div className="panel">
    <div className="ph"><h3>Malzeme talepleri ({list.length})</h3>
      <select style={{ width:'auto' }} value={fs} onChange={e => setFs(e.target.value)}><option value="open">Açık talepler</option><option value="all">Tümü</option></select>
      <button className="btn btn-p" onClick={openNew}>＋ Malzeme iste</button></div>
    {err ? <p className="empty">Talep tablosu bulunamadı. malzeme-talebi.sql dosyasını Supabase'de çalıştırın.</p> :
      <div className="tw"><table><thead><tr><th>Malzeme</th><th>Miktar</th><th>İsteyen</th><th>Tarih</th><th>Durum</th><th>Not</th><th /></tr></thead>
        <tbody>{list.map(r => <tr key={r.id}><td>{r.item_name}</td><td>{Number(r.qty)}</td><td>{name(r.requested_by)}</td><td>{fmt(r.created_at)}</td>
          <td>{mgr ? <select style={{ width:'auto' }} value={r.status} onChange={e => setStatus(r, e.target.value)}>{Object.entries(RQ).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
            : <span className={'pill ' + RQ[r.status][1]}>{RQ[r.status][0]}</span>}</td>
          <td>{r.note || '—'}</td>
          <td className="act">{!mgr && r.requested_by === user.id && r.status === 'bekliyor' && <button className="btn btn-g" onClick={() => setStatus(r, 'iptal')}>Talebi iptal et</button>}</td></tr>)}</tbody></table>
        {!list.length && <p className="empty">Talep yok</p>}</div>}
    {open && <Modal title="Malzeme iste" onClose={() => setOpen(false)}><div className="fg">
      <label className="w">Malzeme<select value={f.item_id} onChange={e => setF({ ...f, item_id: e.target.value })}><option value="">— listede yok, elle yaz —</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
      {!f.item_id && <label className="w">Malzeme adı<input value={f.item_name} onChange={e => setF({ ...f, item_name: e.target.value })} /></label>}
      <label>Miktar<NumInput value={f.qty} onChange={v => setF({ ...f, qty: v })} /></label>
      <label className="w">Not<textarea rows="3" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label></div>
      <button className="btn btn-p" onClick={save}>Talebi gönder</button></Modal>}
  </div>
}

function Team({ cases, staff, me, load }) {
  const active = cases.filter(c => !done(c)).flatMap(c => stages(c).filter(s => s.status === 'devam').map(s => ({ c, s })))
  const role = async (id, r) => { await sb.from('profiles').update({ role: r }).eq('id', id); load() }
  return <div className="cols">{staff.map(p => { const w = active.filter(a => a.s.assigned_to === p.id)
    return <div className="panel" key={p.id}><div className="ph"><div className="av">{p.full_name[0].toUpperCase()}</div><h3>{p.full_name}</h3><span className={'pill ' + (w.length ? 'y' : 'g')}>{w.length ? w.length + ' iş' : 'Boşta'}</span></div>
      {me?.role === 'admin' ? <select value={p.role} onChange={e => role(p.id, e.target.value)}>{ROLES.map(r => <option key={r} value={r}>{rn(r)}</option>)}</select> : <span className="pill">{rn(p.role)}</span>}
      {w.map(({ c, s }) => <p key={s.id}><small>#{c.case_no} · {stg(s.stage)} · {c.work_type}</small></p>)}</div> })}</div>
}

function Modal({ title, onClose, children }) {
  return <div className="ov" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal"><div className="mh"><h3>{title}</h3><button className="x" onClick={onClose}>✕</button></div>{children}</div></div>
}

function Crud({ title, table, view, sel = '*', soft = true, order, cols, fields, extra, top, filter, add = 'Yeni ekle' }) {
  const [rows, setRows] = useState([]), [open, setOpen] = useState(false), [f, setF] = useState({}), [eid, setEid] = useState(null), [op, setOp] = useState({}), [q, setQ] = useState('')
  const load = useCallback(async () => {
    let r = sb.from(view || table).select(sel); if (soft) r = r.is('deleted_at', null); if (order) r = r.order(order[0], { ascending: order[1] })
    const { data, error } = await r; if (error) alert(error.message); setRows(data || [])
  }, [])
  useEffect(() => { load(); fields.filter(x => x.from).forEach(async x => { const [t, v, l] = x.from
    const { data } = await sb.from(t).select(`${v},${l}`).is('deleted_at', null); setOp(o => ({ ...o, [x.k]: (data || []).map(d => ({ v: d[v], l: d[l] })) })) }) }, [load])
  const base = filter ? rows.filter(filter) : rows
  const openNew = () => { setEid(null); setF(Object.fromEntries(fields.filter(x => x.def !== undefined).map(x => [x.k, x.def]))); setOpen(true) }
  const openEdit = r => { setEid(r.id); setF(Object.fromEntries(fields.filter(x => x.k in r).map(x => [x.k, x.type === 'datetime-local' && r[x.k] ? loc(r[x.k]) : r[x.k]]))); setOpen(true) }
  async function save() {
    const p = {}
    for (const x of fields) { if (eid && !(x.k in f)) continue; let v = f[x.k]; if (v === '' || v === undefined) v = null
      if (v !== null && x.type === 'number') v = Number(v); if (v !== null && x.type === 'datetime-local') v = new Date(v).toISOString()
      if (x.required && v === null) return alert(x.label + ' gerekli'); p[x.k] = v }
    const { error } = eid ? await sb.from(table).update(p).eq('id', eid) : await sb.from(table).insert(p)
    if (error) return alert(error.message); setOpen(false); load()
  }
  async function del(r) {
    if (!confirm('Kayıt silinsin mi? (Veri tamamen silinmez, arşivlenir)')) return
    const { error } = await sb.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', r.id); if (error) alert(error.message); load()
  }
  return <>{top && top(base)}
    <div className="panel"><div className="ph"><h3>{title}</h3><input className="srch" placeholder="Ara…" value={q} onChange={e => setQ(e.target.value)} /><button className="btn btn-p" onClick={openNew}>＋ {add}</button></div>
      <div className="tw"><table><thead><tr>{cols.map(c => <th key={c.label}>{c.label}</th>)}<th /></tr></thead>
        <tbody>{base.filter(r => JSON.stringify(r).toLowerCase().includes(q.toLowerCase())).map(r => <tr key={r.id}>{cols.map(c => <td key={c.label}>{c.r ? c.r(r) : (r[c.k] ?? '—')}</td>)}
          <td className="act">{extra && extra(r, load)}<button className="btn btn-g" onClick={() => openEdit(r)}>✏️</button><button className="btn btn-g" onClick={() => del(r)}>🗑</button></td></tr>)}</tbody></table>
        {!rows.length && <p className="empty">Kayıt yok</p>}</div></div>
    {open && <Modal title={eid ? 'Düzenle' : add} onClose={() => setOpen(false)}><div className="fg">{fields.map(x => <label key={x.k} className={x.w ? 'w' : ''}>{x.label}
      {x.type === 'select' ? <select value={f[x.k] ?? ''} onChange={e => setF({ ...f, [x.k]: e.target.value })}><option value="">—</option>{(x.options || op[x.k] || []).map(o => typeof o === 'string' ? { v:o, l:o } : o).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
        : x.type === 'textarea' ? <textarea rows="3" value={f[x.k] ?? ''} onChange={e => setF({ ...f, [x.k]: e.target.value })} />
        : x.type === 'date' ? <DateInput value={f[x.k] ?? ''} onChange={v => setF({ ...f, [x.k]: v })} />
        : x.type === 'datetime-local' ? <DateTimeInput value={f[x.k] ?? ''} onChange={v => setF({ ...f, [x.k]: v })} />
        : x.type === 'number' ? <NumInput value={f[x.k]} onChange={v => setF({ ...f, [x.k]: v })} />
        : <input value={f[x.k] ?? ''} onChange={e => setF({ ...f, [x.k]: e.target.value })} />}</label>)}</div>
      <button className="btn btn-p" onClick={save}>Kaydet</button></Modal>}</>
}

function Files({ cid, user, name }) {
  const [fl, setFl] = useState([]), [busy, setBusy] = useState(false)
  const load = useCallback(async () => { const { data } = await sb.from('case_files').select('*').eq('case_id', cid).is('deleted_at', null).order('created_at'); setFl(data || []) }, [cid])
  useEffect(() => { load() }, [load])
  async function up(e) {
    const files = [...e.target.files], inp = e.target; setBusy(true)
    for (const file of files) {
      const path = `${cid}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
      const { error } = await sb.storage.from('case-files').upload(path, file); if (error) { alert(error.message); continue }
      await sb.from('case_files').insert({ case_id: cid, storage_path: path, file_name: file.name, kind: file.type.startsWith('image') ? 'foto' : file.name.split('.').pop().toLowerCase(), uploaded_by: user.id })
    }
    setBusy(false); inp.value = ''; load()
  }
  const open = async f => { const { data, error } = await sb.storage.from('case-files').createSignedUrl(f.storage_path, 300); if (error) return alert(error.message); window.open(data.signedUrl, '_blank') }
  const del = async f => { if (!confirm('Dosya kaldırılsın mı?')) return; await sb.from('case_files').update({ deleted_at: new Date().toISOString() }).eq('id', f.id); load() }
  return <div style={{ marginTop:14 }}><h3>Dosyalar</h3>
    {fl.map(f => <div className="fr" key={f.id}><span>📎 {f.file_name}<br /><small>{name(f.uploaded_by)} · {fmt(f.created_at)}</small></span><span><button className="btn btn-g" onClick={() => open(f)}>👁 Aç</button> <button className="btn btn-g" onClick={() => del(f)}>🗑</button></span></div>)}
    {!fl.length && <small>Dosya yok</small>}<br />
    <label className="btn btn-p" style={{ display:'inline-block', marginTop:8 }}>{busy ? 'Yükleniyor…' : '＋ Dosya yükle'}<input type="file" multiple hidden onChange={up} /></label></div>
}

function Stats({ cases, name, showMoney }) {
  const [from, setFrom] = useState(today().slice(0, 8) + '01'), [to, setTo] = useState(today()), [doc, setDoc] = useState('')
  const docs = [...new Map(cases.map(c => [c.doctor_id, c.doctors?.full_name])).entries()]
  const L = cases.filter(c => { const d = (c.received_at || '').slice(0, 10); return (!from || d >= from) && (!to || d <= to) && (!doc || c.doctor_id === doc) })
  const dn = L.filter(c => c.status === 'teslim_edildi'), nd = L.filter(c => !done(c))
  const fin = st => L.flatMap(c => stages(c)).filter(s => st.includes(s.stage) && s.status === 'bitti')
  const rev = L.filter(c => c.currency === 'TL').reduce((a, c) => a + Number(c.price || 0), 0)
  return <div className="fit">
    <div className="panel"><div className="ph"><h3>Filtre</h3>
      <DateInput style={{ width:130 }} value={from} onChange={setFrom} />
      <DateInput style={{ width:130 }} value={to} onChange={setTo} />
      <select style={{ width:'auto' }} value={doc} onChange={e => setDoc(e.target.value)}><option value="">Tüm doktorlar</option>{docs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div></div>
    <div className="cards"><Stat label="Toplam iş" value={L.length} c="#2563eb" /><Stat label="Teslim edilen" value={dn.length} c="#16a34a" /><Stat label="Teslim edilmeyen" value={nd.length} c="#f59e0b" /></div>
    <div className="cols">
      <div className="panel"><h3>İş türüne göre</h3><Bars data={count(L, c => c.work_type)} /></div>
      <div className="panel"><h3>Doktora göre</h3><Bars data={count(L, c => c.doctors?.full_name)} /></div>
      <div className="panel"><h3>Tasarımcı performansı</h3><Bars data={count(fin(['tasarim']), s => name(s.assigned_to))} /></div>
      <div className="panel"><h3>Teknisyen performansı</h3><Bars data={count(fin(['uretim', 'porselen']), s => name(s.assigned_to))} /></div>
      <div className="panel"><h3>Teslim edilen iş türleri</h3><Bars data={count(dn, c => c.work_type)} /></div>
      <div className="panel"><h3>Teslim edilmeyen iş türleri</h3><Bars data={count(nd, c => c.work_type)} /></div>
    </div></div>
}

function useTilt() {
  useEffect(() => {
    const mv = e => { const c = e.target.closest?.('.stat'); if (!c) return; const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5
      c.style.transform = `perspective(700px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateZ(8px)` }
    const lv = e => { const c = e.target.closest?.('.stat'); if (c) c.style.transform = '' }
    document.addEventListener('mousemove', mv); document.addEventListener('mouseout', lv)
    return () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseout', lv) }
  }, [])
}

function Tooth3D() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current, w = el.clientWidth || 240, h = el.clientHeight || 240
    let r; try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true }) } catch { return }
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2)); r.setSize(w, h); el.appendChild(r.domElement)
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, w / h, .1, 50); cam.position.set(0, .3, 9)
    scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 5, 5); scene.add(key)
    const rim = new THREE.PointLight(0x38bdf8, 40, 20); rim.position.set(-4, 1, -3); scene.add(rim)
    const g = new THREE.Group(); scene.add(g)
    const prof = [[0, 2.05], [.5, 2.1], [1, 1.85], [1.28, 1.25], [1.25, .55], [1, -.05], [.7, -.45], [.4, -.62], [0, -.65]].map(([x, y]) => new THREE.Vector2(x, y))
    const crown = new THREE.LatheGeometry(prof, 72), pos = crown.attributes.position
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); if (y > 1.5) pos.setY(i, y + Math.cos(2 * Math.atan2(z, x)) * .13 * Math.min(1, Math.hypot(x, z))) }
    crown.computeVertexNormals()
    g.add(new THREE.Mesh(crown, new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: .22, clearcoat: 1, clearcoatRoughness: .12, side: THREE.DoubleSide })))
    const rootM = new THREE.MeshPhysicalMaterial({ color: 0xeadfc8, roughness: .45, clearcoat: .3 })
    ;[-.5, .5].forEach(x => { const m = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.9, 32), rootM); m.position.set(x, -1.5, 0); m.rotation.z = Math.PI + (x > 0 ? -.12 : .12); g.add(m) })
    g.rotation.z = .12
    let tx = 0, raf = 0
    const mv = e => { const b = el.getBoundingClientRect(); tx = ((e.clientX - b.left) / b.width - .5) * .8 }
    window.addEventListener('pointermove', mv)
    const loop = t => { g.rotation.y = t / 2200 + tx; g.position.y = -.2 + Math.sin(t / 900) * .12; r.render(scene, cam); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', mv); r.dispose(); if (el.contains(r.domElement)) el.removeChild(r.domElement) }
  }, [])
  return <div ref={ref} className="t3d" />
}

function Settings({ me, settings, saveSet, load, user, lang, setL }) {
  const isA = me?.role === 'admin', rp = { ...DEF, ...(settings.role_pages || {}) }
  const PAGES = NAV.filter(n => !['dash', 'ayar', 'tara'].includes(n[0]))
  const [lab, setLab] = useState(settings.lab_name || 'Goodent'), [nm, setNm] = useState(me?.full_name || ''), [pw, setPw] = useState(''), [rnm, setRnm] = useState(Object.fromEntries(ROLES.map(r => [r, rn(r)])))
  const stOv = settings.stage_names || {}
  const [snm, setSnm] = useState(Object.fromEntries(STAGE_CODES.map(k => [k, stOv[lang]?.[k] || ''])))
  useEffect(() => { setSnm(Object.fromEntries(STAGE_CODES.map(k => [k, (settings.stage_names || {})[lang]?.[k] || '']))) }, [lang, settings.stage_names])
  async function saveStages(reset) {
    const clean = reset ? {} : Object.fromEntries(STAGE_CODES.map(k => [k, (snm[k] || '').trim()]).filter(([k, v]) => v && v !== STAGE_DEF[lang][k]))
    const names = STAGE_CODES.map(k => (clean[k] || STAGE_DEF[lang][k]).toLocaleLowerCase(lang))
    if (new Set(names).size !== names.length) return alert('Aynı ada sahip iki aşama olamaz.')
    saveSet('stage_names', { ...stOv, [lang]: clean })
  }
  useEffect(() => { setRnm(Object.fromEntries(ROLES.map(r => [r, rn(r)]))) }, [lang, settings.role_names])
  const lock = (r, p) => ['cari', 'kasa'].includes(p) && r !== 'accountant'
  const setRole = (r, p) => { const c = rp[r] || []; saveSet('role_pages', { ...rp, [r]: c.includes(p) ? c.filter(x => x !== p) : [...c, p] }) }
  async function changePw() { if (pw.length < 6) return alert('Şifre en az 6 karakter olmalı'); const { error } = await sb.auth.updateUser({ password: pw }); alert(error ? error.message : 'Şifre değişti'); setPw('') }
  async function saveName() { const { error } = await sb.from('profiles').update({ full_name: nm }).eq('id', user.id); if (error) alert(error.message); load() }
  async function backup() {
    const out = {}
    for (const t of ['accounts', 'doctors', 'patients', 'cases', 'case_stages', 'case_files', 'appointments', 'inventory_items', 'stock_movements', 'transactions', 'profiles', 'audit_log']) {
      const { data, error } = await sb.from(t).select('*'); out[t] = error ? { error: error.message } : data }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' })); a.download = `goodent-yedek-${today()}.json`; a.click()
  }
  return <div className="cols">
    <div className="panel"><h3>Hesabım</h3>
      <div className="fg"><label className="w">Ad Soyad<input value={nm} onChange={e => setNm(e.target.value)} /></label>
        <label className="w">Yeni şifre<input type="password" value={pw} onChange={e => setPw(e.target.value)} /></label></div>
      {isA && <><button className="btn btn-p" onClick={saveName}>Kaydet</button>{' '}</>}<button className="btn btn-g" onClick={changePw}>Şifreyi değiştir</button>
      <p><small>Dil</small><br /><LangPick lang={lang} setL={setL} /></p></div>
    {isA && <div className="panel"><h3>Genel</h3><div className="fg"><label className="w">Laboratuvar adı<input value={lab} onChange={e => setLab(e.target.value)} /></label></div>
      <button className="btn btn-p" onClick={() => saveSet('lab_name', lab)}>Kaydet</button>
      <h3 style={{ marginTop:18 }}>Yedek</h3><button className="btn btn-g" onClick={backup}>Yedek indir (JSON)</button></div>}
    {isA && <div className="panel"><h3>Rol adları</h3><div className="fg">{ROLES.map(r => <label key={r}>{ROLE_DEF[lang][r]}<input value={rnm[r] ?? ''} onChange={e => setRnm({ ...rnm, [r]: e.target.value })} /></label>)}</div><button className="btn btn-p" onClick={() => saveSet('role_names', { ...RN, [lang]: rnm })}>Kaydet</button></div>}
    {isA && <div className="panel"><h3>Aşama adları</h3>
      <p className="muted">İş penceresinde, listelerde ve barkod ekranında görünen aşama adları. Sıra ve aşama sayısı sabittir; yalnızca görünen ad değişir. Boş bırakılan alan varsayılan adı kullanır. Adlar seçili dil için kaydedilir.</p>
      <div className="fg">{STAGE_CODES.map((k, i) => <label key={k}>{i + 1}. {STAGE_DEF[lang][k]}<input maxLength={STAGE_NAME_MAX} placeholder={STAGE_DEF[lang][k]} value={snm[k] ?? ''} onChange={e => setSnm({ ...snm, [k]: e.target.value })} /></label>)}</div>
      <button className="btn btn-p" onClick={() => saveStages(false)}>Kaydet</button>{' '}<button className="btn btn-g" onClick={() => confirm('Aşama adları varsayılana dönsün mü?') && saveStages(true)}>Varsayılana dön</button></div>}
    {isA && <div className="panel" style={{ gridColumn:'1/-1' }}><h3>Yetkiler</h3>
      <p className="muted">Hangi rol hangi sayfayı görebilir. Kasa ve Cari sadece admin ile muhasebe rolüne açılabilir.</p>
      <div className="tw"><table><thead><tr><th>Rol</th>{PAGES.map(p => <th key={p[0]}>{p[2]}</th>)}</tr></thead>
        <tbody>{ROLES.filter(r => r !== 'admin').map(r => <tr key={r}><td><b>{rn(r)}</b></td>{PAGES.map(([k]) => <td key={k}><input type="checkbox" style={{ width:'auto' }} disabled={lock(r, k)} checked={!lock(r, k) && (rp[r] || []).includes(k)} onChange={() => setRole(r, k)} /></td>)}</tr>)}</tbody></table></div></div>}
  </div>
}

const dg = s => String(s).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776).replace(/\D/g, '')
const toDisp = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v.slice(8) + '.' + v.slice(5, 7) + '.' + v.slice(0, 4) : ''

function DateInput({ value, onChange, style }) {
  const [t, setT] = useState(toDisp(value)), [bad, setBad] = useState(false), own = useRef(false), ref = useRef(null), caret = useRef(null)
  useEffect(() => { if (own.current) { own.current = false; return } setT(toDisp(value)); setBad(false) }, [value])
  // Biçimlendirme sonrası imleci, yazılan rakamın hemen sonrasına geri koy (ortadan düzenleme bozulmasın)
  useLayoutEffect(() => {
    const n = caret.current, el = ref.current
    if (n == null || !el) return
    caret.current = null
    let p = 0, seen = 0
    while (p < t.length && seen < n) { if (/\d/.test(t[p])) seen++; p++ }
    el.setSelectionRange(p, p)
  }, [t])
  const ch = e => {
    const raw = e.target.value, pos = e.target.selectionStart ?? raw.length
    let d = dg(raw), before = Math.min(dg(raw.slice(0, pos)).length, 8)
    // Dolu tarihin ortasına rakam yazılırsa araya sokma, üzerine yaz (rakamlar kaymasın)
    if (d.length > 8 && before < d.length) d = d.slice(0, before) + d.slice(before + 1)
    d = d.slice(0, 8)
    const s = d.length > 4 ? d.slice(0, 2) + '.' + d.slice(2, 4) + '.' + d.slice(4) : d.length > 2 ? d.slice(0, 2) + '.' + d.slice(2) : d
    const iso = d.length === 8 ? `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}` : ''
    // Geçerli takvim günü ve makul yıl (1900-2100): 0262 gibi yıllar kabul edilmez
    const y = Number(d.slice(4)), valid = iso && y >= 1900 && y <= 2100 && !isNaN(new Date(iso)) && new Date(iso).toISOString().slice(0, 10) === iso
    caret.current = Math.min(before, d.length)
    setT(s); setBad(d.length === 8 && !valid); own.current = true; onChange(valid ? iso : '')
  }
  return <input ref={ref} inputMode="numeric" placeholder="GG.AA.YYYY" value={t} onChange={ch} aria-invalid={bad || undefined} style={bad ? { ...style, borderColor: '#ef4444', boxShadow: '0 0 0 2px #ef444455' } : style} />
}
function TimeInput({ value, onChange }) {
  const [t, setT] = useState(value || '')
  const ch = e => { const d = dg(e.target.value).slice(0, 4), s = d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d
    setT(s); onChange(d.length === 4 && +d.slice(0, 2) < 24 && +d.slice(2) < 60 ? s : '') }
  return <input inputMode="numeric" placeholder="SS:DD" value={t} onChange={ch} />
}
function DateTimeInput({ value, onChange }) {
  const [d, setD] = useState((value || '').slice(0, 10)), [t, setT] = useState((value || '').slice(11, 16))
  const up = (nd, nt) => onChange(nd ? `${nd}T${/^\d\d:\d\d$/.test(nt) ? nt : '00:00'}` : '')
  return <div style={{ display:'flex', gap:6 }}><DateInput value={d} onChange={v => { setD(v); up(v, t) }} /><TimeInput value={t} onChange={v => { setT(v); up(d, v) }} /></div>
}
function NumInput({ value, onChange }) {
  return <input inputMode="decimal" value={value ?? ''} onChange={e => onChange(String(e.target.value).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632).replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776).replace(/[٫,]/g, '.').replace(/[^\d.]/g, ''))} />
}

function Kasa({ settings }) {
  const [from, setFrom] = useState(today().slice(0, 8) + '01'), [to, setTo] = useState(today()), [acc, setAcc] = useState(''), [accs, setAccs] = useState([]), [inv, setInv] = useState(null)
  useEffect(() => { sb.from('accounts').select('*').is('deleted_at', null).then(r => setAccs(r.data || [])) }, [])
  const flt = r => (!from || r.tx_date >= from) && (!to || r.tx_date <= to) && (!acc || r.account_id === acc)
  return <Crud title="Kasa & İşlemler" table="transactions" sel="*, accounts(name)" order={['tx_date', false]} add="Yeni işlem" filter={flt}
    top={rows => { const s = t => rows.filter(r => r.type === t && r.currency === 'TL').reduce((x, r) => x + Number(r.amount), 0)
      return <>
        <div className="panel"><div className="ph"><h3>Tarih aralığı</h3>
          <DateInput style={{ width:130 }} value={from} onChange={setFrom} /><DateInput style={{ width:130 }} value={to} onChange={setTo} />
          <select style={{ width:'auto' }} value={acc} onChange={e => setAcc(e.target.value)}><option value="">Tüm cariler</option>{accs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <button className="btn btn-g" onClick={() => { setFrom(''); setTo('') }}>Tümü</button>
          <button className="btn btn-p" onClick={() => setInv(rows)}>🧾 Fatura / Ekstre</button></div></div>
        <div className="cards">{[['satis_faturasi', '#2563eb'], ['tahsilat', '#16a34a'], ['alis_faturasi', '#f59e0b'], ['odeme', '#dc2626']].map(([t, c]) =>
          <div className="stat" key={t} style={{ '--c': c }}><small>{TX[t]} (TL)</small><b>{money(s(t))}</b></div>)}</div>
        {inv && <Invoice rows={inv} acc={accs.find(x => x.id === acc)} from={from} to={to} lab={settings.lab_name || 'Goodent'} onClose={() => setInv(null)} />}</> }}
    cols={[{ label:'Tarih', k:'tx_date' }, { label:'Tür', r: r => <span className="pill">{TX[r.type]}</span> }, { label:'Cari', r: r => r.accounts?.name || '—' }, { label:'Tutar', r: r => money(r.amount) + ' ' + r.currency }, { k:'description', label:'Açıklama' }]}
    fields={[{ k:'type', label:'İşlem türü', type:'select', options:Object.entries(TX).map(([v, l]) => ({ v, l })), def:'tahsilat' }, { k:'account_id', label:'Cari hesap', type:'select', from:['accounts','id','name'] }, { k:'amount', label:'Tutar', type:'number', required:true }, { k:'currency', label:'Para birimi', type:'select', options:['TL','EUR','USD'], def:'TL' }, { k:'tx_date', label:'Tarih', type:'date', def:today() }, { k:'description', label:'Açıklama', w:1 }]} />
}

function Invoice({ rows, acc, from, to, lab, onClose }) {
  const L = [...rows].sort((p, q) => p.tx_date.localeCompare(q.tx_date))
  const sg = { satis_faturasi:1, tahsilat:-1, alis_faturasi:-1, odeme:1, gider:0 }
  const cur = [...new Set(L.map(r => r.currency))]
  const sum = (c, t) => L.filter(r => r.currency === c && r.type === t).reduce((x, r) => x + Number(r.amount), 0)
  const bal = c => L.filter(r => r.currency === c).reduce((x, r) => x + sg[r.type] * Number(r.amount), 0)
  const dd = d => d ? toDisp(d) : '…'
  return <Modal title="Fatura / Ekstre" onClose={onClose}>
    <div className="print-area inv">
      <div className="inv-h"><div><h2>{lab}</h2><small>Fatura / Hesap Ekstresi</small></div><div style={{ textAlign:'end' }}><b>{dd(from)} — {dd(to)}</b><br /><small>{toDisp(today())}</small></div></div>
      <div className="inv-c"><b>{acc ? acc.name : 'Tüm cariler'}</b>{acc?.phone && <><br />{acc.phone}</>}{acc?.address && <><br />{acc.address}</>}</div>
      <table><thead><tr><th>Tarih</th><th>Tür</th>{!acc && <th>Cari</th>}<th>Açıklama</th><th>Tutar</th></tr></thead>
        <tbody>{L.map(r => <tr key={r.id}><td>{toDisp(r.tx_date)}</td><td>{TX[r.type]}</td>{!acc && <td>{r.accounts?.name || '—'}</td>}<td>{r.description || '—'}</td><td>{money(r.amount)} {r.currency}</td></tr>)}</tbody></table>
      {!L.length && <p className="empty">Kayıt yok</p>}
      {cur.map(c => <div className="inv-t" key={c}>{['satis_faturasi', 'tahsilat', 'alis_faturasi', 'odeme', 'gider'].filter(t => sum(c, t)).map(t => <div key={t}>{TX[t]}: {money(sum(c, t))} {c}</div>)}<b>Bakiye ({c}): {money(bal(c))}</b></div>)}
    </div>
    <br /><button className="btn btn-p" onClick={() => window.print()}>🖨 Yazdır / PDF</button></Modal>
}

function LangPick({ lang, setL }) {
  return <select value={lang} onChange={e => setL(e.target.value)} style={{ width:'auto', padding:'7px 10px' }}><option value="tr">Türkçe</option><option value="en">English</option><option value="ar">العربية</option></select>
}

// İş detayında QR önizlemesi (yazdırma penceresi önizleme göstermediği için)
function CaseQR({ no }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let on = true; caseQrUrl(no, 240).then(u => on && setSrc(u)).catch(() => {}); return () => { on = false } }, [no])
  return src ? <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0' }}><img src={src} alt="QR" width="120" height="120" style={{ background: '#fff', border: '1px solid #e5e9f2', borderRadius: 8 }} /><b>#{no}</b></div> : null
}
