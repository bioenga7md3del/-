import { ref, onValue, set, push, update, remove } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { db } from "./config.js";

// Global State
window.appData = { contractors: {}, contracts: {}, monthNames: [] };
window.userRole = null;
window.appPasswords = { super: '1234', medical: '1111', non_medical: '2222' };

// --- Loading Data ---
const dbRef = ref(db, 'app_db_v1');
onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    const loader = document.getElementById('loader');
    const table = document.getElementById('mainTable');
    
    if (data) {
        window.appData.contractors = data.contractors || {};
        window.appData.contracts = data.contracts || {};
        window.appData.monthNames = data.monthNames || [];
        
        renderTable();
        updateStats();
        loader.style.display = 'none';
        table.style.display = 'table';
    } else {
        loader.innerHTML = "قاعدة البيانات جديدة. يرجى تهيئة النظام من لوحة الإدارة.";
    }
});

onValue(ref(db, 'app_settings/passwords'), (s) => { if(s.exists()) window.appPasswords = s.val(); });

// --- Functions attached to window for HTML access ---

window.showToast = function(msg) {
    const t = document.getElementById("toast");
    t.innerText = msg; t.className = "show";
    setTimeout(() => t.className = "", 2500);
}

window.manageContractors = async function() {
    if (!window.userRole || window.userRole !== 'super') return;
    const contractorsList = Object.entries(window.appData.contractors)
        .map(([id, data]) => `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:5px;">
            <span>${data.name}</span>
            <button onclick="deleteContractor('${id}')" style="background:#e74c3c; color:white; padding:2px 8px; font-size:10px;">حذف</button>
        </div>`).join('');

    const { value: newName } = await Swal.fire({
        title: 'إدارة المقاولين',
        html: `<div style="text-align:right; max-height:200px; overflow-y:auto; margin-bottom:10px; border:1px solid #ddd; padding:5px;">${contractorsList || '<p>لا يوجد</p>'}</div><input id="new-cont-name" class="swal2-input" placeholder="اسم مقاول جديد...">`,
        showCancelButton: true, confirmButtonText: 'إضافة مقاول', preConfirm: () => document.getElementById('new-cont-name').value
    });

    if (newName) {
        set(push(ref(db, 'app_db_v1/contractors')), { name: newName }).then(() => Swal.fire('تم', 'تم الإضافة', 'success'));
    }
};

window.deleteContractor = function(id) {
    const hasContracts = Object.values(window.appData.contracts).some(c => c.contractorId === id);
    if (hasContracts) { Swal.fire('خطأ', 'لا يمكن حذف المقاول لارتباطه بعقود', 'error'); return; }
    remove(ref(db, `app_db_v1/contractors/${id}`));
};

window.addNewContract = async function() {
    if (!window.userRole || window.userRole !== 'super') return;
    let options = '';
    for (const [id, data] of Object.entries(window.appData.contractors)) { options += `<option value="${id}">${data.name}</option>`; }
    if (options === '') { Swal.fire('تنبيه', 'أضف مقاولين أولاً', 'warning'); return; }

    const { value: val } = await Swal.fire({
        title: 'إضافة عقد',
        html: `<input id="sw-hos" class="swal2-input" placeholder="المستشفى"><select id="sw-con" class="swal2-select" style="width:100%">${options}</select><select id="sw-typ" class="swal2-select" style="width:100%"><option value="طبي">طبي</option><option value="غير طبي">غير طبي</option></select>`,
        showCancelButton: true, confirmButtonText: 'حفظ',
        preConfirm: () => ({ hospital: document.getElementById('sw-hos').value, contractorId: document.getElementById('sw-con').value, type: document.getElementById('sw-typ').value })
    });

    if (val && val.hospital) {
        const newMonths = Array(window.appData.monthNames.length).fill().map(() => ({ status: "late", financeStatus: "late", claimNum: "", letterNum: "", submissionDate: "", returnNotes: "" }));
        push(ref(db, 'app_db_v1/contracts'), { ...val, months: newMonths, notes: "" }).then(() => Swal.fire('تم', 'تمت الإضافة', 'success'));
    }
};

window.renderTable = function() {
    const { contracts, contractors, monthNames } = window.appData;
    const searchHosp = document.getElementById('searchHospital').value.toLowerCase();
    const searchCont = document.getElementById('searchContractor').value.toLowerCase();
    const filterType = document.getElementById('typeFilter').value;

    const headerRow = document.getElementById('headerRow');
    headerRow.innerHTML = `<th class="sticky-col-1">الموقع / المستشفى</th><th class="sticky-col-2">نوع العقد</th><th class="sticky-col-3">المقاول</th><th style="min-width:60px;">المتأخرة</th>`;
    monthNames.forEach((m) => { headerRow.innerHTML += `<th style="min-width:100px;">${m}</th>`; });
    headerRow.innerHTML += `<th style="min-width:200px;">ملاحظات</th>`;

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    Object.entries(contracts).map(([id, data]) => ({...data, id})).forEach(row => {
        const cName = contractors[row.contractorId] ? contractors[row.contractorId].name : "غير معروف";
        if (row.hospital.toLowerCase().includes(searchHosp) && cName.toLowerCase().includes(searchCont) && (filterType === 'all' || row.type === filterType)) {
            const tr = document.createElement('tr');
            const typeClass = row.type === 'طبي' ? 'type-medical' : 'type-non-medical';
            const lateCount = (row.months || []).filter(m => m.financeStatus === 'late').length;
            
            tr.innerHTML = `<td class="sticky-col-1">${row.hospital}</td><td class="sticky-col-2"><span class="${typeClass}">${row.type}</span></td><td class="sticky-col-3">${cName}</td><td><span class="badge ${lateCount > 0 ? 'badge-red' : 'badge-green'}">${lateCount}</span></td>`;
            
            (row.months || []).forEach((m, idx) => {
                let icon = '✘', css = 'status-late', title = 'لم يرفع';
                if (m.financeStatus === 'sent') { icon = '✅'; css = 'status-ok'; title = `مطالبة: ${m.claimNum}\nخطاب: ${m.letterNum}\nتاريخ: ${m.submissionDate}`; }
                else if (m.financeStatus === 'returned') { icon = '⚠️'; css = 'status-returned'; title = `إعادة: ${m.returnNotes}`; }
                tr.innerHTML += `<td class="${css}" title="${title}" onclick="handleCellClick('${row.id}', ${idx})">${icon}</td>`;
            });
            const noteEdit = canEdit(row.type) ? `onclick="editNote('${row.id}')"` : '';
            tr.innerHTML += `<td ${noteEdit} style="font-size:12px; cursor:pointer;">${row.notes || ''}</td>`;
            tbody.appendChild(tr);
        }
    });
    updateStats();
};

window.handleCellClick = async function(contractId, monthIdx) {
    const contract = window.appData.contracts[contractId];
    if (!canEdit(contract.type)) return;
    const mData = contract.months[monthIdx];
    const mName = window.appData.monthNames[monthIdx];
    const curStatus = mData.financeStatus || 'late';

    const { value: v } = await Swal.fire({
        title: `${contract.hospital} - ${mName}`,
        html: `<div style="text-align:right;"><label>رقم المطالبة</label><input id="sw-claim" class="swal2-input" value="${mData.claimNum||''}"><label>رقم الخطاب</label><input id="sw-letter" class="swal2-input" value="${mData.letterNum||''}"><label>تاريخ الرفع</label><input id="sw-date" class="swal2-input" type="date" value="${mData.submissionDate||''}"><label>الحالة</label><select id="sw-status" class="swal2-select"><option value="late" ${curStatus==='late'?'selected':''}>لم يرفع (متأخر)</option><option value="sent" ${curStatus==='sent'?'selected':''}>تم الرفع للمالية</option><option value="returned" ${curStatus==='returned'?'selected':''}>إعادة للموقع</option></select><div id="note-area" style="display:${curStatus==='returned'?'block':'none'}"><label>ملاحظات</label><textarea id="sw-notes" class="swal2-textarea">${mData.returnNotes||''}</textarea></div></div>`,
        didOpen: () => document.getElementById('sw-status').addEventListener('change', (e) => document.getElementById('note-area').style.display = e.target.value==='returned'?'block':'none'),
        showCancelButton: true, confirmButtonText: 'حفظ',
        preConfirm: () => ({ claimNum: document.getElementById('sw-claim').value, letterNum: document.getElementById('sw-letter').value, submissionDate: document.getElementById('sw-date').value, financeStatus: document.getElementById('sw-status').value, returnNotes: document.getElementById('sw-notes').value })
    });

    if (v) update(ref(db, `app_db_v1/contracts/${contractId}/months/${monthIdx}`), v).then(() => window.showToast("تم التحديث"));
};

window.editNote = async function(contractId) {
    const { value: text } = await Swal.fire({ title: 'ملاحظات العقد', input: 'textarea', inputValue: window.appData.contracts[contractId].notes || '', showCancelButton: true });
    if (text !== undefined) update(ref(db, `app_db_v1/contracts/${contractId}`), { notes: text }).then(() => window.showToast("تم حفظ الملاحظة"));
};

window.systemReset = async function() {
    if (!window.userRole || window.userRole !== 'super') return;
    if ((await Swal.fire({ title: 'تهيئة كاملة؟', text: 'سيتم مسح البيانات!', icon: 'warning', showCancelButton: true })).isConfirmed) {
        set(ref(db, 'app_db_v1'), { 
            monthNames: ["أكتوبر 25", "سبتمبر 25", "أغسطس 25", "يوليو 25", "يونيو 25", "مايو 25", "أبريل 24", "مارس 25", "فبراير 25", "يناير 25", "ديسمبر 24", "نوفمبر 24"],
            contractors: { "c1": { name: "شركة الخليجية" } }, contracts: {} 
        }).then(() => location.reload());
    }
};

window.addNewMonthAutomatic = async function() {
    if (!window.userRole || window.userRole !== 'super') return;
    const d = new Date(); d.setMonth(d.getMonth()-1);
    const monthsAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    const newCol = `${monthsAr[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    
    if ((await Swal.fire({ title: `إضافة شهر ${newCol}؟`, icon: 'question', showCancelButton: true })).isConfirmed) {
        const newMonthNames = [newCol, ...window.appData.monthNames];
        if (newMonthNames.length > 12) newMonthNames.pop();
        const updates = { 'app_db_v1/monthNames': newMonthNames };
        
        Object.entries(window.appData.contracts).forEach(([id, contract]) => {
            const newMonths = [{ status: "late", financeStatus: "late", claimNum: "", letterNum: "", submissionDate: "", returnNotes: "" }, ...contract.months];
            if (newMonths.length > 12) newMonths.pop();
            updates[`app_db_v1/contracts/${id}/months`] = newMonths;
        });
        update(ref(db), updates).then(() => window.showToast("تم إقفال الشهر"));
    }
};

window.updateStats = function() {
    const contracts = Object.values(window.appData.contracts);
    document.getElementById('countHospitals').innerText = new Set(contracts.map(c => c.hospital)).size;
    document.getElementById('countContractors').innerText = Object.keys(window.appData.contractors).length;
    document.getElementById('countContracts').innerText = contracts.length;
    let late = 0; contracts.forEach(c => c.months.forEach(m => { if(m.financeStatus === 'late') late++; }));
    document.getElementById('countLate').innerText = late;
};

window.canEdit = function(type) {
    if (window.userRole === 'super') return true;
    if (window.userRole === 'medical' && type === 'طبي') return true;
    if (window.userRole === 'non-medical' && type === 'غير طبي') return true;
    return false;
};

window.adminLogin = async function() {
    const { value: pass } = await Swal.fire({ title: 'كلمة المرور', input: 'password' });
    if (pass === window.appPasswords.super) window.userRole = 'super';
    else if (pass === window.appPasswords.medical) window.userRole = 'medical';
    else if (pass === window.appPasswords.non_medical) window.userRole = 'non-medical';
    else return Swal.fire('خطأ', 'كلمة المرور خاطئة', 'error');

    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminControls').style.display = 'flex';
    document.getElementById('roleDisplay').innerText = window.userRole === 'super' ? '(مدير عام)' : '(مشرف)';
    document.querySelectorAll('.super-admin-only').forEach(b => b.style.display = window.userRole === 'super' ? 'inline-block' : 'none');
    window.renderTable();
};
