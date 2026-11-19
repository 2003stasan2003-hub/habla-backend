function detectDefaultAppLang() {
    const navLang = (navigator.language || '').toLowerCase();
    if (navLang.startsWith('uk')) return 'Ukrainian';
    if (navLang.startsWith('en')) return 'English';
    if (navLang.startsWith('es')) return 'Spanish';
    if (navLang.startsWith('de')) return 'German';
    if (navLang.startsWith('fr')) return 'French';
    return 'Ukrainian';
}

let savedInterfaceLang = localStorage.getItem('habla_interface_lang') || detectDefaultAppLang();
if (savedInterfaceLang === 'Russian') savedInterfaceLang = 'Ukrainian';
interfaceLangSelect.value = savedInterfaceLang;
applyLocalization(savedInterfaceLang);
