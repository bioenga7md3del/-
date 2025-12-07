import { ref, onValue, set, push, update, remove } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { db } from "./config.js";

// Global State
window.appData = { contractors: {}, contracts: {}, monthNames: [] };
window.userRole = null;
window.appPasswords = { super: '1234', medical: '1111', non_medical: '2222' };

// --- Loading Data ---
const dbRef = ref(db, 'app_db_v2'); // V2 for structural changes
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
        loader.innerHTML = "النظام جاهز. الرجاء تسجيل الدخول وتهيئة النظام.";
    }
});

// Load Passwords
onValue(ref(db, 'app_settings/passwords'), (s) => { if(s.exists()) window.appPasswords = s.val(); });

// --- Helper Functions ---
window.showToast = function(msg) {
    const t = document.getElementById("toast"); t.innerText = msg; t.className = "show";
    setTimeout(() => t.className = "", 2500);
}

// --- Modal Functions (فتح وإغلاق الصفحات) ---
window.openModal = function(id) {
    document.getElementById(id).style.display = 'flex';
    if(id === 'contractorModal') renderContractorsList();
    if(id === 'contractModal') fillContractorSelect();
}
window.closeModal = function(id) {
    document.getElementById(id).style.display = 'none';
}

// --- Month Logic (من بداية السنة للشهر السابق) ---
window.refreshMonthsSystem = async function() {
    if (!window.userRole || window.userRole !== 'super') return;
    
    if(!(await Swal.fire({title:'تحديث الجدول الزمني؟', text:'سيتم ضبط الأعمدة من يناير للسنة الحالية حتى الشهر السابق.', icon:'warning', showCancelButton:true})).isConfirmed) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0 = Jan, 11 = Dec
    
    const arabicMonths = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    let newMonthNames = [];

    // Loop from Jan (0) to Previous Month (currentMonth - 1)
    for (let i = 0; i < currentMonth; i++) {
        newMonthNames.push(`${arabicMonths[i]} ${currentYear}`);
    }
    
    // Reverse to show latest first (Optional: remove .reverse() if you want Jan first)
    newMonthNames.reverse();

    const updates = {};
    updates['app_db_v2/monthNames'] = newMonthNames;

    // Sync all contracts to have the correct number of months
    Object.entries(window.appData.contracts).forEach(([id, contract]) => {
        // Here we ideally map existing data to new months, but for simplicity in this reset:
        // We ensure the array length matches. In a real prod env, you'd match by month name key.
        // For now, we resize the array.
        let currentMonths = contract.months || [];
        // If new list is longer, add empty; if shorter, slice (careful with data loss)
        // Simplified Logic: Just ensure structure exists.
        // Better Logic: Rebuild array based on new length
        const adjustedMonths = new Array(newMonthNames.length).fill(null).map((_, idx) => {
            return currentMonths[idx] || { status: "late", financeStatus: "late", claimNum: "", letterNum: "", submissionDate: "", returnNotes: "" };
        });
        updates[`app_db_v2/contracts/${id}/months`] = adjustedMonths;
    });

    update(ref(db), updates).then(() => {
        showToast("تم تحديث الفترات الزمنية");
    });
};

// --- Contractor Management ---
window.saveNewContractor = function() {
    const name = document.getElementById('form-new-contractor').value;
    if(!name) return;
    push(ref(db, 'app_db_v2/contractors'), { name: name })
        .then(() => { 
            document.getElementById('form-new-contractor').value = ''; 
            renderContractorsList(); 
            showToast("تمت الإضافة"); 
        });
};

function renderContractorsList() {
    const list = document.getElementById('contractorsList');
    list.innerHTML = Object.entries(window.appData.contractors).map(([id, val]) => `
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:5px;">
            <span>${val.name}</span>
            <button class="btn-danger" style="padding:2px 5px; font-size:10px;" onclick="deleteContractor('${id}')">حذف</button>
        </div>
    `).join('');
}

window.deleteContractor = function(id) {
    const hasContracts = Object.values(window.appData.contracts).some(c => c.contractorId === id);
    if(hasContracts) { Swal.fire('خطأ','مرتبط بعقود','error'); return; }
    remove(ref(db, `app_db_v2/contractors/${id}`)).then(() => renderContractorsList());
}

// --- Contract Management (New Page Logic) ---
function fillContractorSelect() {
    const sel = document.getElementById('form-contractor');
    sel.innerHTML = '<option value="">اختر المقاول...</option>';
    Object.entries(window.appData.contractors).forEach(([id, val]) => {
        sel.innerHTML += `<option value="${id}">${val.name}</option>`;
    });
}

window.saveNewContract = function() {
    const hosp = document.getElementById('form-hospital').value;
    const type = document.getElementById('form-type').value;
    const contId = document.getElementById('form-contractor').value;
    const contNum = document.getElementById('form-contract-num').value;

    if(!hosp || !contId) { Swal.fire('نقص بيانات','يرجى تعبئة الحقول الأساسية','error'); return; }

    const monthsCount = window.appData.monthNames.length;
    const emptyMonths = Array(monthsCount).fill().map(() => ({ 
        status: "late", financeStatus: "late", claimNum: "", letterNum: "", submissionDate: "", returnNotes: "" 
    }));

    const newContract = {
        hospital: hosp,
        type: type,
        contractorId: contId,
        contractNumber: contNum,
        months: emptyMonths,
        notes: ""
    };

    push(ref(db, 'app_db_v2/contracts'), newContract).then(() => {
        showToast("تم حفظ العقد");
        closeModal('contractModal');
        // Reset form
        document.getElementById('form-hospital').value = '';
        document.getElementById('form-contract-num').value = '';
    });
};

// --- Table Rendering (Updated Colors) ---
window.renderTable = function() {
    const { contracts, contractors, monthNames } = window.appData;
    const search = document.getElementById('searchBox').value.toLowerCase();
    const filter = document.getElementById('typeFilter').value;

    // Header
    const hRow = document.getElementById('headerRow');
    hRow.innerHTML = `<th class="sticky-col-1">الموقع / المستشفى</th><th class="sticky-col-2">نوع العقد</th><th class="sticky-col-3">المقاول</th><th style="min-width:50px">المتأخرات</th>`;
    monthNames.forEach(m => hRow.innerHTML += `<th style="min-width:110px">${m}</th>`);
    hRow.innerHTML += `<th style="min-width:200px">ملاحظات</th>`;

    // Body
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    Object.entries(contracts).map(([id, val])=>({...val, id})).forEach(row => {
        const cName = contractors[row.contractorId]?.name || "غير معروف";
        const txtMatch = row.hospital.toLowerCase().includes(search) || cName.toLowerCase().includes(search);
        const typeMatch = filter === 'all' || row.type === filter;

        if(txtMatch && typeMatch) {
            const tr = document.createElement('tr');
            // Add class for coloring
            tr.className = row.type === 'طبي' ? 'row-medical' : 'row-non-medical';
            
            const lateCount = (row.months||[]).filter(m => m.financeStatus === 'late').length;
            const badge = lateCount > 0 ? 'badge-red' : 'badge-green';

            tr.innerHTML = `
                <td class="sticky-col-1">${row.hospital}</td>
                <td class="sticky-col-2" style="font-weight:bold; color:${row.type==='طبي'?'var(--primary)':'#d35400'}">${row.type}</td>
                <td class="sticky-col-3">${cName}</td>
                <td><span class="badge ${badge}">${lateCount}</span></td>
            `;

            (row.months||[]).forEach((m, idx) => {
                let icon='✘', cls='status-late', tit='لم يرفع';
                if(m.financeStatus === 'sent') { icon='✅'; cls='status-ok'; tit=`مطالبة: ${m.claimNum}\nخطاب: ${m.letterNum}\nتاريخ: ${m.submissionDate}`; }
                else if(m.financeStatus === 'returned') { icon='⚠️'; cls='status-returned'; tit=`إعادة: ${m.returnNotes}`; }
                
                tr.innerHTML += `<td class="${cls}" title="${tit}" onclick="handleCell('${row.id}', ${idx})">${icon}</td>`;
            });

            const editNote = canEdit(row.type) ? `onclick="editNote('${row.id}')"` : '';
            tr.innerHTML += `<td ${editNote} style="cursor:pointer; font-size:12px;">${row.notes||''}</td>`;
            tbody.appendChild(tr);
        }
    });
    updateStats();
};

window.handleCell = async function(cid, midx) {
    const c = window.appData.contracts[cid];
    if(!canEdit(c.type)) return;
    const mData = c.months[midx];
    
    // Popup logic remains similar (SweetAlert)
    const {value: v} = await Swal.fire({
        title: 'بيانات المستخلص',
        html: `
            <input id="sw-cl" class="swal2-input" placeholder="رقم المطالبة" value="${mData.claimNum||''}">
            <input id="sw-le" class="swal2-input" placeholder="رقم الخطاب" value="${mData.letterNum||''}">
            <input id="sw-da" class="swal2-input" type="date" value="${mData.submissionDate||''}">
            <select id="sw-st" class="swal2-select">
                <option value="late" ${mData.financeStatus==='late'?'selected':''}>لم يرفع (متأخر)</option>
                <option value="sent" ${mData.financeStatus==='sent'?'selected':''}>تم الرفع للمالية</option>
                <option value="returned" ${mData.financeStatus==='returned'?'selected':''}>إعادة للموقع</option>
            </select>
            <input id="sw-no" class="swal2-input" placeholder="سبب الإعادة" value="${mData.returnNotes||''}">
        `,
        preConfirm: () => ({
            claimNum: document.getElementById('sw-cl').value,
            letterNum: document.getElementById('sw-le').value,
            submissionDate: document.getElementById('sw-da').value,
            financeStatus: document.getElementById('sw-st').value,
            returnNotes: document.getElementById('sw-no').value
        })
    });

    if(v) {
        update(ref(db, `app_db_v2/contracts/${cid}/months/${midx}`), v).then(()=>showToast("تم"));
    }
};

window.editNote = async function(cid) {
    const {value:t} = await Swal.fire({input:'textarea', inputValue:window.appData.contracts[cid].notes});
    if(t!==undefined) update(ref(db, `app_db_v2/contracts/${cid}`), {notes:t});
};

// --- System ---
window.systemReset = async function() {
    if(!window.userRole || window.userRole !== 'super') return;
    if((await Swal.fire({title:'تهيئة؟', icon:'warning', showCancelButton:true})).isConfirmed) {
        set(ref(db, 'app_db_v2'), { monthNames:[], contractors:{}, contracts:{} }).then(()=>location.reload());
    }
};

window.updateStats = function() {
    const cs = Object.values(window.appData.contracts);
    document.getElementById('countHospitals').innerText = new Set(cs.map(c=>c.hospital)).size;
    document.getElementById('countContractors').innerText = Object.keys(window.appData.contractors).length;
    document.getElementById('countContracts').innerText = cs.length;
    let l = 0; cs.forEach(c => c.months.forEach(m => {if(m.financeStatus==='late') l++}));
    document.getElementById('countLate').innerText = l;
};

window.adminLogin = async function() {
    const {value:p} = await Swal.fire({title:'كلمة المرور', input:'password'});
    if(p===window.appPasswords.super) window.userRole='super';
    else if(p===window.appPasswords.medical) window.userRole='medical';
    else if(p===window.appPasswords.non_medical) window.userRole='non_medical';
    else return Swal.fire('خطأ','','error');
    
    document.getElementById('loginSection').style.display='none';
    document.getElementById('adminControls').style.display='flex';
    document.getElementById('roleDisplay').innerText = window.userRole;
    document.querySelectorAll('.super-admin-only').forEach(b => b.style.display = window.userRole==='super'?'inline-block':'none');
    renderTable();
};

function canEdit(type) {
    if(window.userRole === 'super') return true;
    if(window.userRole === 'medical' && type === 'طبي') return true;
    if(window.userRole === 'non_medical' && type === 'غير طبي') return true;
    return false;
}
