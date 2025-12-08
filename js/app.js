import * as DB from "./db.js";
import * as Auth from "./auth.js";
import * as UI from "./ui.js";

// --- Global State ---
window.appData = { contractors: {}, contracts: {}, monthNames: [] };
window.userRole = null;
window.appPasswords = { super: '1234', medical: '1111', non_medical: '2222' };

// --- 1. Init ---
UI.initTooltip();

DB.listenToData((data) => {
    document.getElementById('loader').style.display = 'none';
    if (data) {
        window.appData.contractors = data.contractors || {};
        window.appData.contracts = data.contracts || {};
        window.appData.monthNames = data.monthNames || [];
    }
    try {
        refreshView();
        document.getElementById('mainTable').style.display = 'table';
    } catch (e) { console.error("Render Error:", e); }
}, console.error);

DB.listenToPasswords((pass) => window.appPasswords = pass);

// --- 2. Refresh Helpers ---
function refreshView() {
    // تحديث الجدول الرئيسي
    const rows = UI.renderTable(window.appData, window.userRole, Auth.canEdit);
    // تحديث إحصائيات الداشبورد الرئيسية
    UI.updateStats(rows, window.appData);
    
    // تحديث صفحات الإدارة (الكروت) إذا كان أدمن
    if (window.userRole && window.userRole !== 'viewer') {
        UI.renderCards(window.appData, 'contract');
        UI.renderCards(window.appData, 'contractor');
    }
}

// --- 3. Global Functions (Binding HTML to JS) ---

// ✅ هذا هو الإصلاح: تعريف دالة الفلترة لصفحة العقود
window.renderContractsCards = function() {
    UI.renderCards(window.appData, 'contract');
};

// Login
window.adminLogin = async function() {
    const { value: pass } = await Swal.fire({ title: 'دخول', input: 'password', confirmButtonText: 'دخول' });
    if (!pass) return;
    
    const res = Auth.checkLogin(pass, window.appPasswords);
    if (!res) return Swal.fire('خطأ', 'كلمة المرور خطأ', 'error');
    
    window.userRole = res.role;
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('dashboardControls').classList.remove('hidden');
    document.getElementById('loginBtn').classList.add('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    document.getElementById('roleDisplay').innerText = res.name;
    
    const isSuper = window.userRole === 'super';
    const isViewer = window.userRole === 'viewer';
    document.querySelectorAll('.super-admin-only').forEach(el => el.style.display = isSuper ? 'inline-block' : 'none');
    document.querySelectorAll('.restricted-tab').forEach(el => el.style.display = isViewer ? 'none' : 'block');
    
    refreshView();
};

window.switchView = function(viewId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    const map = {'dashboard-view':0, 'contracts-view':1, 'contractors-view':2};
    const navs = document.querySelectorAll('.nav-item');
    if(navs[map[viewId]]) navs[map[viewId]].classList.add('active');
};

// ربط دوال الـ UI بالنافذة العامة
window.showTooltip = UI.showTooltip;
window.hideTooltip = UI.hideTooltip;
window.renderTable = refreshView; // عند البحث في الجدول الرئيسي

// --- CRUD Operations ---
window.saveContract = function() {
    const id = document.getElementById('form-contract-id').value;
    const data = {
        contractName: document.getElementById('form-contract-name').value,
        hospital: document.getElementById('form-contract-name').value, 
        type: document.getElementById('form-type').value,
        contractorId: document.getElementById('form-contractor').value,
        startDate: document.getElementById('form-start-date').value,
        endDate: document.getElementById('form-end-date').value,
        duration: document.getElementById('form-duration').value,
        value: document.getElementById('form-value').value,
        contractNumber: document.getElementById('form-contract-num').value
    };
    
    if(!data.contractName || !data.contractorId) return Swal.fire('تنبيه', 'بيانات ناقصة', 'error');

    if(id) {
        const old = window.appData.contracts[id];
        data.months = old.months || []; data.notes = old.notes || "";
        DB.updateContract(id, data).then(() => { UI.showToast("تم التعديل"); UI.toggleModal('contractModal', false); });
    } else {
        const count = window.appData.monthNames ? window.appData.monthNames.length : 0;
        data.months = Array(count).fill().map(() => ({status:"late", financeStatus:"late"}));
        data.notes = "";
        DB.addContract(data).then(() => { UI.showToast("تم الحفظ"); UI.toggleModal('contractModal', false); });
    }
};

window.deleteContract = async (id) => { if((await Swal.fire({title:'حذف؟',icon:'warning',showCancelButton:true})).isConfirmed) DB.deleteContract(id); };

window.prepareEditContract = function(id) {
    const c = window.appData.contracts[id];
    fillSelect();
    document.getElementById('form-contract-id').value = id;
    document.getElementById('form-contract-name').value = c.contractName || c.hospital;
    document.getElementById('form-type').value = c.type;
    document.getElementById('form-contractor').value = c.contractorId;
    document.getElementById('form-start-date').value = c.startDate || "";
    document.getElementById('form-end-date').value = c.endDate || "";
    document.getElementById('form-duration').value = c.duration || "";
    document.getElementById('form-value').value = c.value || "";
    document.getElementById('form-contract-num').value = c.contractNumber || "";
    UI.toggleModal('contractModal', true);
};

window.saveContractor = function() {
    const id = document.getElementById('form-contractor-id').value;
    const name = document.getElementById('form-new-contractor').value;
    if(!name) return;
    const p = id ? DB.updateContractor(id, name) : DB.addContractor(name);
    p.then(() => { UI.showToast("تم"); UI.toggleModal('contractorModal', false); });
};

window.prepareEditContractor = function(id, name) {
    document.getElementById('form-contractor-id').value = id;
    document.getElementById('form-new-contractor').value = name;
    UI.toggleModal('contractorModal', true);
};

window.deleteContractor = function(id) {
    const has = Object.values(window.appData.contracts).some(c => c.contractorId === id);
    if(has) Swal.fire('لا','مرتبط بعقود','error'); else DB.deleteContractor(id);
};

window.handleKpiCell = async function(cid, midx) {
    if (!Auth.canEdit(window.userRole, window.appData.contracts[cid].type)) return;
    const m = window.appData.contracts[cid].months[midx];
    if(!m) return UI.showToast("حدث الشهور أولاً");
    
    const {value:v} = await Swal.fire({
        title: window.appData.monthNames[midx],
        html: `<select id="sw-st" class="form-control"><option value="late" ${m.financeStatus==='late'?'selected':''}>متأخر</option><option value="sent" ${m.financeStatus==='sent'?'selected':''}>تم الرفع</option><option value="returned" ${m.financeStatus==='returned'?'selected':''}>إعادة</option></select><input id="sw-cn" class="form-control" placeholder="رقم المطالبة" value="${m.claimNum||''}" style="margin:5px 0"><input id="sw-ln" class="form-control" placeholder="رقم الخطاب" value="${m.letterNum||''}" style="margin:5px 0"><input id="sw-dt" class="form-control" type="date" value="${m.submissionDate||''}" style="margin:5px 0"><input id="sw-nt" class="form-control" placeholder="ملاحظات" value="${m.returnNotes||''}" style="margin:5px 0">`,
        preConfirm: () => ({ financeStatus:document.getElementById('sw-st').value, claimNum:document.getElementById('sw-cn').value, letterNum:document.getElementById('sw-ln').value, submissionDate:document.getElementById('sw-dt').value, returnNotes:document.getElementById('sw-nt').value })
    });
    
    if(v) DB.updateMonthStatus(cid, midx, v).then(() => { window.appData.contracts[cid].months[midx] = v; refreshView(); UI.showToast("تم"); });
};

window.editNote = async function(cid) {
    if (!Auth.canEdit(window.userRole, window.appData.contracts[cid].type)) return;
    const {value:t} = await Swal.fire({input:'textarea', inputValue:window.appData.contracts[cid].notes});
    if(t!==undefined) DB.updateContract(cid, {notes:t});
};

window.refreshMonthsSystem = async function() {
    if(!window.userRole) return;
    if(!(await Swal.fire({title:'تحديث؟',icon:'warning',showCancelButton:true})).isConfirmed) return;
    const now = new Date();
    const arM = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    let mNames = [];
    for(let i=0; i<now.getMonth(); i++) mNames.push(`${arM[i]} ${now.getFullYear()}`);
    mNames.reverse();
    DB.updateMonthsList(mNames);
    Object.entries(window.appData.contracts).forEach(([id, c]) => {
        const adj = new Array(mNames.length).fill(null).map((_,i) => (c.months||[])[i] || {status:"late", financeStatus:"late"});
        DB.updateContractMonths(id, adj);
    });
    UI.showToast("تم التحديث");
};

window.systemReset = async function() {
    if(window.userRole!=='super') return;
    if((await Swal.fire({title:'مسح؟',icon:'warning',showCancelButton:true})).isConfirmed) {
        DB.resetDatabase().then(()=>location.reload());
        DB.savePasswords({ super:'1234', medical:'1111', non_medical:'2222' });
    }
};

window.exportToExcel = UI.exportToExcel = function() {
    const ws = XLSX.utils.table_to_sheet(document.getElementById('mainTable'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KPI");
    XLSX.writeFile(wb, "KPI_Report.xlsx");
};

window.openModal = function(id) {
    UI.toggleModal(id, true);
    if(id==='contractModal') fillSelect();
    if(id==='contractorModal' && !document.getElementById('form-contractor-id').value) document.getElementById('form-new-contractor').value='';
    if(id==='contractModal' && !document.getElementById('form-contract-id').value) {
        document.getElementById('form-contract-name').value='';
        document.getElementById('form-contract-num').value='';
        document.getElementById('form-duration').value='';
        document.getElementById('form-value').value='';
        document.getElementById('form-start-date').value='';
        document.getElementById('form-end-date').value='';
    }
};
window.closeModal = function(id) {
    UI.toggleModal(id, false);
    if(id==='contractModal') document.getElementById('form-contract-id').value='';
    if(id==='contractorModal') document.getElementById('form-contractor-id').value='';
};
function fillSelect() {
    const s = document.getElementById('form-contractor');
    if(!s) return;
    const curr = s.value;
    s.innerHTML = '<option value="">اختر...</option>';
    Object.entries(window.appData.contractors).forEach(([id,v])=> s.innerHTML+=`<option value="${id}">${v.name}</option>`);
    s.value = curr;
}
window.showToast = UI.showToast;
window.changePasswords = async function() {
    if (!window.userRole || window.userRole !== 'super') return;
    const { value: f } = await Swal.fire({
        title: 'تغيير كلمات المرور',
        html: '<input id="p1" class="swal2-input" value="'+window.appPasswords.super+'"><input id="p2" class="swal2-input" value="'+window.appPasswords.medical+'"><input id="p3" class="swal2-input" value="'+window.appPasswords.non_medical+'">',
        preConfirm: () => ({ super: document.getElementById('p1').value, medical: document.getElementById('p2').value, non_medical: document.getElementById('p3').value })
    });
    if (f) DB.savePasswords(f).then(() => { window.appPasswords = f; UI.showToast('تم الحفظ'); });
};
