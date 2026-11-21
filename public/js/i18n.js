/*
 * English / Malayalam for the patient pages.
 *
 * English stays where it is: in the HTML, and in the page scripts as the
 * second argument of App.t(key, english, vars). This file holds only the
 * Malayalam, so a missing translation simply shows the English.
 *
 *   <h1 data-i18n="book.h1">Book today's OP token</h1>      text
 *   <p data-i18n-html="book.howto">Tap <b>My tokens</b></p>  text with markup (our own strings only)
 *   <input data-i18n-placeholder="track.tokenPh">            placeholder
 *
 * Only pages whose <html> has a data-i18n attribute switch language; staff
 * pages stay in English. The choice is kept in localStorage on this device;
 * ?lang=ml in the address also works (handy for the TV in the waiting hall).
 */
(function () {
  const KEY = "anareen:lang";
  const LANGS = { en: "English", ml: "മലയാളം" };
  const enabled = document.documentElement.hasAttribute("data-i18n");

  const store = {
    get() { try { return localStorage.getItem(KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); return true; } catch { return false; } },
  };

  let lang = "en";
  if (enabled) {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (LANGS[fromUrl]) {
      lang = fromUrl;
      store.set(lang);
    } else if (LANGS[store.get()]) {
      lang = store.get();
    }
  }

  const ML = {
    /* ---------- Shared ---------- */
    "nav.home": "ഹോം",
    "nav.departments": "വിഭാഗങ്ങൾ",
    "nav.book": "ബുക്കിങ്",
    "nav.track": "എന്റെ ടോക്കണുകൾ",
    "nav.display": "ഡിസ്പ്ലേ",
    "nav.staff": "സ്റ്റാഫ് ലോഗിൻ",
    "nav.menu": "മെനു",
    "brand.tag": "തത്സമയ ഒപി ക്യൂ",
    "footer.hours": "തത്സമയ ഒപി ടോക്കൺ നില · രാവിലെ 8:00 – രാത്രി 8:00",
    "footer.display": "കാത്തിരിപ്പ് ഹാൾ ഡിസ്പ്ലേ",
    "footer.staff": "സ്റ്റാഫ് പോർട്ടൽ",
    "footer.privacy": "സ്വകാര്യത",
    "live.on": "തത്സമയം",
    "live.off": "വീണ്ടും ബന്ധിപ്പിക്കുന്നു…",
    "live.connecting": "ബന്ധിപ്പിക്കുന്നു…",
    "status.consulting": "പരിശോധിക്കുന്നു",
    "status.break": "ഇടവേളയിൽ",
    "status.unavailable": "ലഭ്യമല്ല",
    "status.back": " · {time}-ന് തിരികെ",
    "min.now": "ഇപ്പോൾ",
    "min.m": "~{m} മിനിറ്റ്",
    "min.h": "~{h} മണിക്കൂർ",
    "min.hm": "~{h} മണിക്കൂർ {r} മിനിറ്റ്",
    "room": "റൂം {room}",
    "f.phone": "മൊബൈൽ നമ്പർ",
    "f.doctor": "ഡോക്ടർ",
    "f.department": "വിഭാഗം",
    "loading": "ലോഡ് ചെയ്യുന്നു…",
    "pick.doctor": "ഡോക്ടറെ തിരഞ്ഞെടുക്കുക…",
    "pick.yourDoctor": "നിങ്ങളുടെ ഡോക്ടറെ തിരഞ്ഞെടുക്കുക…",
    "pick.department": "വിഭാഗം തിരഞ്ഞെടുക്കുക…",
    "count.doctors": "{n} ഡോക്ടർ",
    "nowServing": "ഇപ്പോഴത്തെ ടോക്കൺ",
    "yourToken": "നിങ്ങളുടെ ടോക്കൺ",
    "ahead": "മുന്നിലുള്ളവർ",
    "eta": "ഏകദേശ കാത്തിരിപ്പ്",
    "err.phone": "ശരിയായ 10 അക്ക മൊബൈൽ നമ്പർ നൽകുക.",
    "allDepartments": "എല്ലാ വിഭാഗങ്ങളും",

    /* Why online booking is not possible (doctor.online.reason) */
    "note.inactive": "ഈ ഡോക്ടർ ഇപ്പോൾ രോഗികളെ കാണുന്നില്ല",
    "note.off": "ഈ ഡോക്ടർക്ക് ഓൺലൈൻ ബുക്കിങ് ഇല്ല. ദയവായി റിസപ്ഷനിൽ ബുക്ക് ചെയ്യുക.",
    "note.closed": "ഓൺലൈൻ ബുക്കിങ് {open} മുതൽ {close} വരെ മാത്രം.",
    "note.full": "ഇന്നത്തെ ഓൺലൈൻ ടോക്കണുകൾ എല്ലാം തീർന്നു. ദയവായി റിസപ്ഷനിൽ വരിക.",

    /* Server messages patients may see (matched in App.tError) */
    "srv.duplicate": "ഈ മൊബൈൽ നമ്പറിന് ഇന്ന് {2}-ന്റെ ടോക്കൺ {1} ഇതിനകം ഉണ്ട്",
    "srv.consent": "ഓൺലൈനായി ബുക്ക് ചെയ്യാൻ സ്വകാര്യതാ അറിയിപ്പ് അംഗീകരിക്കുക",
    "srv.tooManyBookings": "ഈ നെറ്റ്‌വർക്കിൽ നിന്ന് ഒരുപാട് ബുക്കിങ്ങുകൾ വന്നു. കുറച്ചുകഴിഞ്ഞ് ശ്രമിക്കുക, അല്ലെങ്കിൽ റിസപ്ഷനിൽ വരിക.",
    "srv.tooMany": "ഒരുപാട് അഭ്യർത്ഥനകൾ. കുറച്ച് മിനിറ്റ് കഴിഞ്ഞ് വീണ്ടും ശ്രമിക്കുക.",
    "srv.badCode": "ബുക്കിങ് കോഡ് തെറ്റാണ്",
    "srv.notFound": "ഈ മൊബൈൽ നമ്പറിൽ ഈ ബുക്കിങ് കണ്ടെത്തിയില്ല",
    "srv.called": "ഈ ടോക്കൺ ഇതിനകം വിളിച്ചുകഴിഞ്ഞു",
    "srv.noCancel": "ഈ ടോക്കൺ ഇനി റദ്ദാക്കാൻ കഴിയില്ല",
    "srv.name": "പേര് 2 മുതൽ 60 വരെ അക്ഷരങ്ങൾ ആയിരിക്കണം",
    "srv.notTaking": "ഈ ഡോക്ടർ ഇപ്പോൾ രോഗികളെ കാണുന്നില്ല",
    "srv.limit": "ഇന്നത്തെ ടോക്കൺ പരിധി കഴിഞ്ഞു",

    /* ---------- Home ---------- */
    "home.title": "Anareen Lifecare Hospital · തത്സമയ ഒപി ടോക്കൺ നില",
    "home.h1": "ഇഷ്ടമുള്ളിടത്ത് കാത്തിരിക്കൂ. നിങ്ങളുടെ ഊഴമാകുമ്പോൾ ഞങ്ങൾ അറിയിക്കാം.",
    "home.lead": "ഇന്നത്തെ ഒപി ടോക്കൺ വീട്ടിലിരുന്ന് ബുക്ക് ചെയ്യൂ. പിന്നീട് മൊബൈൽ നമ്പർ മാത്രം നൽകി നിങ്ങളുടെ ഊഴം തത്സമയം അറിയാം. മുന്നിൽ എത്ര രോഗികളുണ്ടെന്നും ഏകദേശം എത്ര നേരം കാത്തിരിക്കണമെന്നും കാണാം.",
    "home.bookBtn": "വീട്ടിലിരുന്ന് ടോക്കൺ ബുക്ക് ചെയ്യൂ",
    "home.queuesBtn": "തത്സമയ ക്യൂ കാണുക",
    "home.statConsulting": "ഇപ്പോൾ പരിശോധിക്കുന്ന ഡോക്ടർമാർ",
    "home.statWaiting": "ക്യൂവിലുള്ള രോഗികൾ",
    "home.statServed": "ഇന്ന് പരിശോധിച്ച രോഗികൾ",
    "home.trackH": "എന്റെ ടോക്കണുകൾ പരിശോധിക്കുക",
    "home.trackP": "ബുക്ക് ചെയ്യുമ്പോഴോ റിസപ്ഷനിലോ നൽകിയ മൊബൈൽ നമ്പർ നൽകുക.",
    "home.trackBtn": "എന്റെ ടോക്കണുകൾ കാണിക്കുക",
    "home.noToken": "ഇതുവരെ ടോക്കൺ ഇല്ലേ? <a href=\"/book\">വീട്ടിലിരുന്ന് ബുക്ക് ചെയ്യൂ →</a>",
    "home.deptEyebrow": "ഒപി വിഭാഗങ്ങൾ",
    "home.deptH": "ഒരു വിഭാഗം തിരഞ്ഞെടുക്കുക",
    "home.howEyebrow": "എങ്ങനെ പ്രവർത്തിക്കുന്നു",
    "home.howH": "മൂന്ന് ഘട്ടങ്ങൾ, ഇനി തിരക്കേറിയ ഹാളുകളില്ല",
    "home.step1H": "ടോക്കൺ ബുക്ക് ചെയ്യുക",
    "home.step1P": "പേരും മൊബൈൽ നമ്പറും നൽകി വീട്ടിലിരുന്ന് ഓൺലൈനായി ബുക്ക് ചെയ്യാം, അല്ലെങ്കിൽ റിസപ്ഷനിൽ നിന്ന് ടോക്കൺ വാങ്ങാം.",
    "home.step2H": "മൊബൈൽ നമ്പർ നൽകി പരിശോധിക്കുക",
    "home.step2P": "<b>എന്റെ ടോക്കണുകൾ</b> തുറന്ന് നമ്പർ നൽകുക. ഇപ്പോൾ ഏത് ടോക്കൺ ആണെന്നും നിങ്ങൾക്ക് മുന്നിൽ എത്ര പേരുണ്ടെന്നും കാണാം.",
    "home.step3H": "സമയത്ത് എത്തുക",
    "home.step3P": "ഡോക്ടർ അടുത്ത രോഗിയെ വിളിക്കുന്ന നിമിഷം പേജ് മാറും. ഊഴം അടുക്കുമ്പോൾ അറിയിപ്പും കിട്ടും.",
    "home.deptsFailed": "വിഭാഗങ്ങൾ ലോഡ് ചെയ്യാനായില്ല.",

    /* ---------- Departments ---------- */
    "dept.title": "വിഭാഗങ്ങൾ · Anareen Lifecare",
    "dept.lead": "എല്ലാ ഡോക്ടർമാരുടെയും തത്സമയ ടോക്കൺ നില. പേജ് പുതുക്കേണ്ടതില്ല, ഉടനടി മാറും.",
    "dept.leadOne": "ഈ വിഭാഗത്തിന്റെ തത്സമയ ടോക്കൺ നില.",
    "dept.notFound": "വിഭാഗം കണ്ടെത്തിയില്ല",
    "dept.seeAll": "എല്ലാ വിഭാഗങ്ങളും കാണുക",
    "dept.inQueue": "ക്യൂവിൽ",
    "dept.wait": "കാത്തിരിപ്പ്",
    "dept.book": "ബുക്ക് ചെയ്യുക",
    "dept.atReception": "റിസപ്ഷനിൽ ബുക്ക് ചെയ്യുക",
    "dept.onlineLeft": "🌐 ഇന്ന് {limit}-ൽ {left} ഓൺലൈൻ ടോക്കണുകൾ ബാക്കി",
    "dept.empty": "ഈ വിഭാഗത്തിൽ ഇതുവരെ ഡോക്ടർമാരെ ചേർത്തിട്ടില്ല.",

    /* ---------- Book ---------- */
    "book.title": "ടോക്കൺ ബുക്കിങ് · Anareen Lifecare",
    "book.eyebrow": "വീട്ടിലിരുന്ന് ബുക്ക് ചെയ്യൂ",
    "book.h1": "ഇന്നത്തെ ഒപി ടോക്കൺ ബുക്ക് ചെയ്യുക",
    "book.lead": "ഇപ്പോൾ തന്നെ ടോക്കൺ നമ്പർ നേടൂ, ഊഴം അടുക്കുമ്പോൾ ആശുപത്രിയിൽ എത്തിയാൽ മതി. പിന്നീട് മൊബൈൽ നമ്പർ നൽകി ഊഴം പരിശോധിക്കാം.",
    "book.deptFirst": "ആദ്യം വിഭാഗം തിരഞ്ഞെടുക്കുക",
    "book.name": "രോഗിയുടെ പേര്",
    "book.namePh": "ഉദാ: Rahul Krishnan",
    "book.phoneHint": "ഊഴം പരിശോധിക്കാൻ ഈ നമ്പർ ഉപയോഗിക്കും. ഒരു ഡോക്ടർക്ക് ദിവസം ഒരു ടോക്കൺ മാത്രം.",
    "book.consent": "<a href=\"/privacy\" target=\"_blank\" rel=\"noopener\">സ്വകാര്യതാ അറിയിപ്പിൽ</a> പറയുന്നതുപോലെ, എന്റെ ടോക്കൺ കൈകാര്യം ചെയ്യാൻ Anareen Lifecare ഈ പേരും മൊബൈൽ നമ്പറും സൂക്ഷിക്കുന്നതിന് ഞാൻ സമ്മതിക്കുന്നു.",
    "book.submit": "ടോക്കൺ ബുക്ക് ചെയ്യുക",
    "book.booking": "ബുക്ക് ചെയ്യുന്നു…",
    "book.done": "നിങ്ങളുടെ ടോക്കൺ ബുക്ക് ചെയ്തു ✅",
    "book.code": "ബുക്കിങ് കോഡ്",
    "book.howH": "ഊഴം എങ്ങനെ പരിശോധിക്കാം",
    "book.how1": "ഈ വെബ്സൈറ്റ് തുറന്ന് <b>എന്റെ ടോക്കണുകൾ</b> ടാപ്പ് ചെയ്യുക.",
    "book.how2": "നിങ്ങളുടെ മൊബൈൽ നമ്പർ <b id=\"dPhone\"></b> നൽകുക.",
    "book.how3": "ടോക്കൺ നില തത്സമയം മാറും. അടുത്തത് നിങ്ങളാകുമ്പോൾ അറിയാൻ അലേർട്ട് ഓണാക്കുക.",
    "book.keepCode": "<b>ബുക്കിങ് കോഡ്</b> സൂക്ഷിക്കുക. ടോക്കൺ റദ്ദാക്കണമെങ്കിൽ മാത്രമേ ഇത് വേണ്ടൂ.",
    "book.seeMine": "എന്റെ ടോക്കണുകൾ കാണുക",
    "book.another": "മറ്റൊരാൾക്ക് ബുക്ക് ചെയ്യുക",
    "book.left": "{n} ഓൺലൈൻ ടോക്കൺ ബാക്കി",
    "book.notOnline": "ഓൺലൈനായി ബുക്ക് ചെയ്യാൻ കഴിയില്ല",
    "book.noDoctors": "ഈ വിഭാഗത്തിൽ ഡോക്ടർമാരില്ല",
    "book.preview": "ഇപ്പോഴത്തെ ടോക്കൺ <b>{cur}</b> · {w} പേർ കാത്തിരിക്കുന്നു · ഒരാൾക്ക് ~{m} മിനിറ്റ്",
    "book.loadFailed": "ഡോക്ടർമാരുടെ വിവരം ലോഡ് ചെയ്യാനായില്ല: {msg}",
    "book.errDoctor": "ദയവായി ഡോക്ടറെ തിരഞ്ഞെടുക്കുക.",
    "book.errName": "ദയവായി രോഗിയുടെ പേര് നൽകുക.",
    "book.errConsent": "ബുക്ക് ചെയ്യാൻ സ്വകാര്യതാ അറിയിപ്പ് അംഗീകരിച്ച് ബോക്സ് ടിക്ക് ചെയ്യുക.",

    /* ---------- My tokens ---------- */
    "track.title": "എന്റെ ടോക്കണുകൾ · Anareen Lifecare",
    "track.h1": "എന്റെ ടോക്കണുകൾ",
    "track.lead": "ബുക്ക് ചെയ്യുമ്പോഴോ റിസപ്ഷനിലോ നൽകിയ മൊബൈൽ നമ്പർ നൽകുക. ഇന്നത്തെ നിങ്ങളുടെ എല്ലാ ടോക്കണുകളും തത്സമയം കാണാം.",
    "track.remember": "ഈ ഉപകരണത്തിൽ നമ്പർ ഓർത്തുവെക്കുക",
    "track.byToken": "ടോക്കണിൽ മൊബൈൽ നമ്പർ ഇല്ലേ? ടോക്കൺ നമ്പർ നൽകി പരിശോധിക്കുക",
    "track.tokenNo": "ടോക്കൺ നമ്പർ",
    "track.tokenPh": "ഉദാ: 14",
    "track.trackBtn": "ഈ ടോക്കൺ പരിശോധിക്കുക",
    "track.alertBtn": "🔔 എന്റെ ഊഴം അടുക്കുമ്പോൾ അറിയിക്കുക",
    "track.alertOn": "🔕 അലേർട്ട് ഓണാണ് (ഓഫാക്കാൻ ടാപ്പ് ചെയ്യുക)",
    "track.alertToast": "നിങ്ങൾക്ക് മുന്നിൽ ഒരാൾ മാത്രമാകുമ്പോൾ അറിയിക്കും. ഈ പേജ് തുറന്നുവെക്കുക.",
    "track.change": "നമ്പർ മാറ്റുക",
    "track.another": "മറ്റൊന്ന് പരിശോധിക്കുക",
    "track.forPhone": "{phone} എന്ന നമ്പറിന്റെ ഇന്നത്തെ ടോക്കണുകൾ",
    "track.one": "ഒരു ടോക്കൺ പരിശോധിക്കുന്നു",
    "track.cancelled": "ഈ ടോക്കൺ റദ്ദാക്കി.",
    "track.noShow": "ഈ ടോക്കൺ 'ഹാജരില്ല' എന്ന് രേഖപ്പെടുത്തി. ദയവായി റിസപ്ഷനിൽ ബന്ധപ്പെടുക.",
    "track.passed": "നിങ്ങളുടെ ടോക്കൺ വിളിച്ചുകഴിഞ്ഞു. നഷ്ടമായെങ്കിൽ ദയവായി റിസപ്ഷനിൽ ബന്ധപ്പെടുക.",
    "track.breakAt": "ഡോക്ടർ ചെറിയ ഇടവേളയിലാണ്, ഏകദേശം {time}-ന് തിരികെ എത്തും.",
    "track.break": "ഡോക്ടർ ചെറിയ ഇടവേളയിലാണ്, ഉടൻ തിരികെ എത്തും.",
    "track.notStartedAt": "ഡോക്ടർ ഇതുവരെ പരിശോധന തുടങ്ങിയിട്ടില്ല. ഏകദേശം {time}-ന് തുടങ്ങും.",
    "track.notStarted": "ഡോക്ടർ ഇതുവരെ പരിശോധന തുടങ്ങിയിട്ടില്ല.",
    "track.nowRoom": "ഇപ്പോൾ നിങ്ങളുടെ ഊഴമാണ്! ദയവായി റൂം {room}-ലേക്ക് പോകുക.",
    "track.now": "ഇപ്പോൾ നിങ്ങളുടെ ഊഴമാണ്! ദയവായി പരിശോധനാ മുറിയിലേക്ക് പോകുക.",
    "track.next": "അടുത്തത് നിങ്ങളാണ്! ദയവായി പരിശോധനാ മുറിയുടെ അടുത്ത് ഉണ്ടാവുക.",
    "track.waiting": "നിങ്ങൾക്ക് മുന്നിൽ {n} പേർ. വിശ്രമിക്കൂ, സമയത്ത് എത്തിയാൽ മതി.",
    "track.alertNowRoom": "ടോക്കൺ {t}: ഇപ്പോൾ നിങ്ങളുടെ ഊഴമാണ്. ദയവായി റൂം {room}-ലേക്ക് പോകുക.",
    "track.alertNow": "ടോക്കൺ {t}: ഇപ്പോൾ നിങ്ങളുടെ ഊഴമാണ്. ദയവായി പരിശോധനാ മുറിയിലേക്ക് പോകുക.",
    "track.alertNextRoom": "ടോക്കൺ {t}: അടുത്തത് നിങ്ങളാണ്. ദയവായി റൂം {room}-ന്റെ അടുത്ത് ഉണ്ടാവുക.",
    "track.alertNext": "ടോക്കൺ {t}: അടുത്തത് നിങ്ങളാണ്. ദയവായി പരിശോധനാ മുറിയുടെ അടുത്ത് ഉണ്ടാവുക.",
    "track.alertOne": "ടോക്കൺ {t}: നിങ്ങൾക്ക് മുന്നിൽ ഒരാൾ മാത്രം.",
    "track.online": "🌐 ഓൺലൈൻ ബുക്കിങ്",
    "track.walkin": "🏥 റിസപ്ഷനിൽ",
    "track.patient": "രോഗി: {name}",
    "track.perPatient": "ഒരാൾക്ക്",
    "track.minutes": "{m} മിനിറ്റ്",
    "track.cancelSum": "വരാൻ കഴിയില്ലേ? ഈ ടോക്കൺ റദ്ദാക്കുക",
    "track.codePh": "4 അക്ക ബുക്കിങ് കോഡ്",
    "track.cancelBtn": "ടോക്കൺ റദ്ദാക്കുക",
    "track.codeHint": "ബുക്ക് ചെയ്തപ്പോൾ കാണിച്ചതോ സ്ലിപ്പിൽ അച്ചടിച്ചതോ ആയ കോഡ്.",
    "track.none": "ഈ നമ്പറിന് ഇന്ന് ടോക്കണുകളില്ല.",
    "track.noneHint": "നമ്പർ ശരിയാണോ എന്ന് നോക്കുക, അല്ലെങ്കിൽ ഇപ്പോൾ ടോക്കൺ ബുക്ക് ചെയ്യുക.",
    "track.bookBtn": "ടോക്കൺ ബുക്ക് ചെയ്യുക",
    "track.docTurn": "ടോക്കൺ {t} · നിങ്ങളുടെ ഊഴം!",
    "track.docAhead": "ടോക്കൺ {t} · മുന്നിൽ {n} പേർ",
    "track.errCode": "4 അക്ക ബുക്കിങ് കോഡ് നൽകുക",
    "track.confirm": "ഈ ടോക്കൺ റദ്ദാക്കണോ? മനസ്സ് മാറിയാൽ വീണ്ടും ബുക്ക് ചെയ്യേണ്ടിവരും.",
    "track.cancelledToast": "നിങ്ങളുടെ ടോക്കൺ റദ്ദാക്കി",
    "track.errDoctor": "ദയവായി ഡോക്ടറെ തിരഞ്ഞെടുക്കുക.",
    "track.errToken": "ദയവായി ടോക്കൺ നമ്പർ നൽകുക.",

    /* ---------- Display board ---------- */
    "display.title": "ഡിസ്പ്ലേ ബോർഡ് · Anareen Lifecare",
    "display.tag": "ഒപി ടോക്കൺ നില",
    "display.fullscreen": "⛶ ഫുൾ സ്ക്രീൻ",
    "display.calling": "ഇപ്പോൾ വിളിക്കുന്നു",
    "display.wait": "നിങ്ങളുടെ ടോക്കൺ നമ്പർ വിളിക്കുന്നതുവരെ കാത്തിരിക്കുക.",
    "display.overlayH": "കാത്തിരിപ്പ് ഹാൾ ഡിസ്പ്ലേ",
    "display.overlayP": "ഇത് കാത്തിരിപ്പ് ഹാളിലെ ടിവിയിൽ പ്രദർശിപ്പിക്കുക. ടോക്കൺ വിളികൾ ശബ്ദത്തിൽ അറിയിക്കും.",
    "display.start": "🔊 ശബ്ദ അറിയിപ്പോടെ തുടങ്ങുക",
    "display.mute": "ശബ്ദമില്ലാതെ തുടങ്ങുക",
    "display.noVoice": "ഈ ഉപകരണത്തിൽ മലയാളം ശബ്ദം ഇല്ല, അതിനാൽ ടോക്കൺ വിളികൾ ഇംഗ്ലീഷിൽ കേൾക്കും. ഉപകരണത്തിന്റെ ക്രമീകരണങ്ങളിൽ (Text-to-speech) മലയാളം ശബ്ദം ചേർത്താൽ മലയാളത്തിൽ കേൾക്കാം.",
    "display.token": "ടോക്കൺ",
    "display.waiting": "{n} പേർ കാത്തിരിക്കുന്നു",
    "display.none": "കാണിക്കാൻ ഡോക്ടർമാരില്ല.",
    "display.ticker": "ടോക്കൺ {t} → {doctor}, {where}",
    "display.sayRoom": "ടോക്കൺ നമ്പർ {t}. {doctor}, റൂം നമ്പർ {room}-ലേക്ക് വരിക.",
    "display.sayDept": "ടോക്കൺ നമ്പർ {t}. {doctor}, {dept}-ലേക്ക് വരിക.",

    /* ---------- Privacy ---------- */
    "privacy.title": "സ്വകാര്യതാ അറിയിപ്പ് · Anareen Lifecare",
    "privacy.h1": "സ്വകാര്യതാ അറിയിപ്പ്",
    "privacy.lead": "Anareen Lifecare Hospital ഒപി ടോക്കൺ നൽകാനും ക്യൂവിൽ നിങ്ങളുടെ സ്ഥാനം കാണിക്കാനുമാണ് ഈ വെബ്സൈറ്റ് ഉപയോഗിക്കുന്നത്. നിങ്ങളെക്കുറിച്ച് ഞങ്ങൾ എന്ത് സൂക്ഷിക്കുന്നു, എന്തിന് എന്ന് ലളിതമായി ഇവിടെ പറയുന്നു.",
    "privacy.whatH": "ഞങ്ങൾ സൂക്ഷിക്കുന്നത്",
    "privacy.what1": "<b>രോഗിയുടെ പേര്</b>: ഓൺലൈനായി ബുക്ക് ചെയ്യുമ്പോൾ, അല്ലെങ്കിൽ റിസപ്ഷനിൽ നിങ്ങൾ പറഞ്ഞാൽ.",
    "privacy.what2": "<b>മൊബൈൽ നമ്പർ</b>: \"എന്റെ ടോക്കണുകൾ\" പേജിൽ നിങ്ങളുടെ ടോക്കൺ കണ്ടെത്താൻ.",
    "privacy.what3": "<b>ടോക്കൺ വിവരങ്ങൾ</b>: ഏത് ഡോക്ടർ, തീയതി, ടോക്കൺ നമ്പർ, ഓൺലൈനായോ റിസപ്ഷനിലോ ബുക്ക് ചെയ്തത്, പരിശോധിച്ചോ റദ്ദാക്കിയോ വന്നില്ലയോ എന്നത്.",
    "privacy.what4": "<b>നിങ്ങൾ ഈ അറിയിപ്പ് അംഗീകരിച്ച സമയം.</b>",
    "privacy.whatNot": "നിങ്ങളുടെ വിലാസം, പ്രായം, രോഗവിവരങ്ങൾ, പണമിടപാട് വിവരങ്ങൾ എന്നിവ ഞങ്ങൾ ചോദിക്കുന്നില്ല. ഈ വെബ്സൈറ്റ് മെഡിക്കൽ രേഖകൾ സൂക്ഷിക്കുന്നില്ല.",
    "privacy.whyH": "എന്തിന് സൂക്ഷിക്കുന്നു",
    "privacy.why1": "നിങ്ങൾക്ക് ടോക്കൺ നൽകാനും ക്യൂ ക്രമത്തിൽ നടത്താനും.",
    "privacy.why2": "മൊബൈൽ നമ്പർ നൽകി നിങ്ങൾക്ക് ഊഴം പരിശോധിക്കാനും ടോക്കൺ റദ്ദാക്കാനും.",
    "privacy.why3": "അടുത്തത് ആരാണെന്ന് റിസപ്ഷനും ഡോക്ടർക്കും അറിയാൻ.",
    "privacy.why4": "എത്ര രോഗികളെ കണ്ടു എന്ന് എണ്ണാൻ (ഈ കണക്കുകളിൽ പേരോ നമ്പറോ ഇല്ല).",
    "privacy.whyNot": "നിങ്ങളുടെ വിവരങ്ങൾ ഞങ്ങൾ വിൽക്കുകയോ പരസ്യത്തിന് നൽകുകയോ ചെയ്യില്ല. പരസ്യ സന്ദേശങ്ങൾ അയക്കില്ല.",
    "privacy.howLongH": "എത്ര കാലം സൂക്ഷിക്കും",
    "privacy.howLong1": "നിങ്ങളുടെ സന്ദർശനം കഴിഞ്ഞ് <b><span data-days>30</span> ദിവസത്തിനു ശേഷം</b> പേരും മൊബൈൽ നമ്പറും തനിയെ മായ്ക്കപ്പെടും. അതിനുശേഷം ആരാണെന്ന് അറിയാൻ കഴിയാത്ത കണക്കുകൾ മാത്രം ബാക്കിയാകും (ഉദാ: \"മാർച്ച് 3-ന് ഡോ. അരുൺ 40 രോഗികളെ കണ്ടു\").",
    "privacy.howLong2": "സുരക്ഷയ്ക്കായി കഴിഞ്ഞ <span data-backup>14</span> ദിവസത്തെ ബാക്കപ്പ് പകർപ്പുകൾ ആശുപത്രി സൂക്ഷിക്കുന്നു. അതിനാൽ മായ്ച്ച ഒരു പേര് പൂർണ്ണമായി ഇല്ലാതാകാൻ <span data-backup>14</span> ദിവസം കൂടി എടുത്തേക്കാം.",
    "privacy.whoH": "ആർക്കൊക്കെ കാണാം",
    "privacy.who1": "<b>റിസപ്ഷൻ, അഡ്മിൻ സ്റ്റാഫ്</b>: ടോക്കണുകൾ കൈകാര്യം ചെയ്യാൻ നിങ്ങളുടെ മുഴുവൻ പേരും മൊബൈൽ നമ്പറും.",
    "privacy.who2": "<b>നിങ്ങളുടെ ഡോക്ടർ</b>: അവരുടെ സ്ക്രീനിൽ നിങ്ങളുടെ പേരും ടോക്കൺ നമ്പറും.",
    "privacy.who3": "<b>\"എന്റെ ടോക്കണുകൾ\" പേജിൽ നിങ്ങളുടെ നമ്പർ നൽകുന്ന ആർക്കും</b>: നിങ്ങളുടെ ടോക്കൺ, ഡോക്ടർ, ചുരുക്കിയ പേര് (ഉദാ: \"Ra*** K.\"). മൊബൈൽ നമ്പർ ഒരിക്കലും കാണിക്കില്ല. ടോക്കൺ റദ്ദാക്കാൻ 4 അക്ക ബുക്കിങ് കോഡും വേണം, അത് മറ്റാർക്കും നൽകരുത്.",
    "privacy.who4": "<b>കാത്തിരിപ്പ് ഹാളിലെ സ്ക്രീൻ</b>: ടോക്കൺ നമ്പറുകളും ഡോക്ടർമാരുടെ പേരുകളും മാത്രം. രോഗികളുടെ പേര് ഒരിക്കലും കാണിക്കില്ല.",
    "privacy.deviceH": "നിങ്ങളുടെ ഫോണിൽ",
    "privacy.device": "നിങ്ങൾ തിരഞ്ഞെടുത്താൽ, വീണ്ടും ടൈപ്പ് ചെയ്യേണ്ടാത്ത വിധം നിങ്ങളുടെ മൊബൈൽ നമ്പറും ഭാഷയും ഈ വെബ്സൈറ്റ് നിങ്ങളുടെ ഫോണിൽ തന്നെ ഓർത്തുവെക്കും. \"നമ്പർ മാറ്റുക\" ടാപ്പ് ചെയ്തോ ബ്രൗസറിലെ സൈറ്റ് ഡാറ്റ മായ്ച്ചോ ഇത് നീക്കാം. പരസ്യത്തിനോ നിങ്ങളെ പിന്തുടരാനോ ഉള്ള കുക്കികൾ ഞങ്ങൾ ഉപയോഗിക്കുന്നില്ല.",
    "privacy.choicesH": "നിങ്ങളുടെ അവകാശങ്ങൾ",
    "privacy.choice1": "പേരോ മൊബൈൽ നമ്പറോ നൽകാതെ റിസപ്ഷനിൽ നിന്ന് ടോക്കൺ വാങ്ങാം.",
    "privacy.choice2": "നിങ്ങളുടെ വിവരങ്ങൾ തിരുത്താനോ മായ്ക്കാനോ എപ്പോൾ വേണമെങ്കിലും റിസപ്ഷനിൽ ആവശ്യപ്പെടാം.",
    "privacy.choice3": "സംശയങ്ങൾക്ക് +91 98765 43210 എന്ന നമ്പറിൽ വിളിക്കുക, അല്ലെങ്കിൽ റിസപ്ഷനിൽ ചോദിക്കുക.",
    "privacy.back": "← ഹോമിലേക്ക്",
  };

  // Departments created by the demo data. A renamed department gets a new slug and
  // shows its own (English) name; an edited description shows as written.
  const DEPTS = {
    "general-medicine": ["ജനറൽ മെഡിസിൻ", "Primary care, fever, diabetes and lifestyle conditions.", "പ്രാഥമിക ചികിത്സ, പനി, പ്രമേഹം, ജീവിതശൈലീ രോഗങ്ങൾ."],
    pediatrics: ["ശിശുരോഗ വിഭാഗം", "Care for newborns, children and adolescents.", "നവജാത ശിശുക്കൾ, കുട്ടികൾ, കൗമാരക്കാർ എന്നിവർക്കുള്ള ചികിത്സ."],
    gynaecology: ["സ്ത്രീരോഗ വിഭാഗം", "Women's health, pregnancy and maternity care.", "സ്ത്രീകളുടെ ആരോഗ്യം, ഗർഭകാല, പ്രസവ പരിചരണം."],
    cardiology: ["ഹൃദ്രോഗ വിഭാഗം", "Heart health, ECG and cardiac consultations.", "ഹൃദയാരോഗ്യം, ഇസിജി, ഹൃദ്രോഗ പരിശോധന."],
    orthopedics: ["അസ്ഥിരോഗ വിഭാഗം", "Bones, joints, fractures and sports injuries.", "എല്ലുകൾ, സന്ധികൾ, ഒടിവുകൾ, കായിക പരിക്കുകൾ."],
    ent: ["ഇഎൻടി", "Ear, nose and throat conditions.", "ചെവി, മൂക്ക്, തൊണ്ട എന്നിവയുടെ രോഗങ്ങൾ."],
    dermatology: ["ചർമരോഗ വിഭാഗം", "Skin, hair and nail care.", "ചർമം, മുടി, നഖം എന്നിവയുടെ പരിചരണം."],
    neurology: ["നാഡീരോഗ വിഭാഗം", "Brain, spine and nervous system disorders.", "തലച്ചോറ്, നട്ടെല്ല്, നാഡീവ്യവസ്ഥ എന്നിവയുടെ രോഗങ്ങൾ."],
  };

  // English messages from the server that patients can run into → Malayalam key.
  // Numbered groups fill {1}, {2}… in the translation.
  const SERVER = [
    [/^This mobile number already has token (\d+) for (.+) today$/, "srv.duplicate"],
    [/^Please agree to the privacy notice/, "srv.consent"],
    [/^All online tokens for today are taken/, "note.full"],
    [/^Online booking is off for this doctor/, "note.off"],
    [/^Online booking is open from (\S+) to (\S+)\.$/, "note.closed", (m) => ({ open: m[1], close: m[2] })],
    [/^Too many bookings from this network/, "srv.tooManyBookings"],
    [/^Too many requests/, "srv.tooMany"],
    [/^The booking code is incorrect$/, "srv.badCode"],
    [/^Booking not found for this mobile number$/, "srv.notFound"],
    [/^This token has already been called$/, "srv.called"],
    [/^This token can no longer be cancelled$/, "srv.noCancel"],
    [/^Name must be 2 to 60 characters$/, "srv.name"],
    [/^Enter a valid 10-digit Indian mobile number$/, "err.phone"],
    [/^This doctor is not taking patients$/, "srv.notTaking"],
    [/^Token limit reached for today$/, "srv.limit"],
  ];

  const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));

  App.lang = lang;
  App.i18n = enabled;
  App.locale = lang === "ml" ? "ml-IN" : undefined; // for toLocaleTimeString etc.
  App.t = (key, en, vars) => (lang === "ml" && ML[key] ? fill(ML[key], vars) : en);

  App.tError = (message) => {
    if (lang !== "ml" || !message) return message;
    for (const [re, key, toVars] of SERVER) {
      const m = re.exec(message);
      if (m) return fill(ML[key], toVars ? toVars(m) : { ...m });
    }
    return message;
  };

  App.deptName = (dep) => (lang === "ml" && DEPTS[dep.slug] ? DEPTS[dep.slug][0] : dep.name);
  App.deptDesc = (dep) => (lang === "ml" && DEPTS[dep.slug]?.[1] === dep.description ? DEPTS[dep.slug][2] : dep.description);

  /* Status pills and wait times, in the chosen language (replace the English ones from common.js). */
  App.STATUS = {
    consulting: App.t("status.consulting", "Consulting"),
    break: App.t("status.break", "On break"),
    unavailable: App.t("status.unavailable", "Not available"),
  };
  App.pill = (status, resume) =>
    `<span class="pill ${App.esc(status)}">${App.esc(App.STATUS[status] || status)}${resume ? App.esc(App.t("status.back", ` · back ${App.time12(resume)}`, { time: App.time12(resume) })) : ""}</span>`;
  App.minutes = (m) => {
    if (m <= 0) return App.t("min.now", "now");
    if (m < 60) return App.t("min.m", `~${m} min`, { m });
    const h = Math.floor(m / 60), r = m % 60;
    return r ? App.t("min.hm", `~${h} h ${r} min`, { h, r }) : App.t("min.h", `~${h} h`, { h });
  };

  /** The button that switches to the other language. */
  App.langSwitch = (cls = "lang-switch") => {
    const other = lang === "ml" ? "en" : "ml";
    return `<button class="${cls}" type="button" data-lang-switch="${other}" lang="${other}" aria-label="${other === "ml" ? "Switch to Malayalam" : "ഇംഗ്ലീഷിലേക്ക് മാറുക"}">${LANGS[other]}</button>`;
  };

  App.setLang = (next) => {
    if (!LANGS[next]) return;
    const url = new URL(location.href);
    if (store.set(next)) url.searchParams.delete("lang");
    else url.searchParams.set("lang", next); // storage blocked: carry the choice in the address
    location.href = url.toString();
  };

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang-switch]");
    if (b) App.setLang(b.dataset.langSwitch);
  });

  /** Swaps the page's static English for Malayalam. */
  App.applyI18n = (root = document) => {
    if (lang !== "ml") return;
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const v = ML[el.dataset.i18n];
      if (v) el.textContent = v;
    });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const v = ML[el.dataset.i18nHtml];
      if (v) el.innerHTML = v; // only our own strings above, never user input
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const v = ML[el.dataset.i18nPlaceholder];
      if (v) el.placeholder = v;
    });
  };

  if (enabled) {
    document.documentElement.lang = lang;
    App.applyI18n();
  }
})();
