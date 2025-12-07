import { ref, onValue, set, push, update, remove } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { db } from "./config.js";

// --- الحالة العامة (Global State) ---
window.appData = { contractors: {}, contracts: {}, monthNames: [] };
window.userRole = null;
window.appPasswords = { super: '1234', medical: '1111', non_medical: '2222' };
let myChart = null;

// --- 1. تحميل البيانات من فيربيز ---
const dbRef = ref(db, 'app_db_v2'); 
onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    const loader = document.getElementById('loader');
    const table = document.getElementById('mainTable');
    
    // إخفاء شاشة التحميل دائماً للسماح بالدخول
    if (loader) loader.style.display = 'none';

    if (data) {
        window.appData.contractors = data.contractors || {};
        window.appData.contracts = data.contracts || {};
        window.appData.monthNames = data.monthNames || [];
        
        // محاولة تحديث العرض
        try {
            if (window.userRole) refreshAllViews(); // تحديث فقط إذا كان مسجلاً للدخول
            if (table) table.style.display = 'table';
        } catch (e) {
            console.error("خطأ في العرض:", e);
        }
    } else {
        // قاعدة بيانات جديدة
        window.appData = { contractors: {}, contracts: {}, monthNames: [] };
        if (table) table.style.display = 'table';
    }
}, (error) => {
    console.error("Firebase Error:", error);
    if(loader) loader.innerText = "خطأ في الاتصال";
});

// تحميل كلمات المرور
onValue(ref(db, 'app_settings/passwords'), (s) => { 
    if(s.exists()) window.appPasswords = s.val(); 
});

// --- 2. نظام التوجيه (Navigation) ---
window.switchView = function(viewId) {
    // إخفاء كل الأقسام
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    // إظهار القسم المطلوب
    const target = document.getElementById(viewId);
    if(target) target.classList.add('active');
    
    // تلوين التبويب
    const navMap = { 'dashboard-view': 0, 'contracts-view': 1, 'contractors-view': 2 };
    const navItems = document.querySelectorAll('.nav-item');
    if(navItems[navMap[viewId]]) navItems[navMap[viewId]].classList.add('active');
}

function refreshAllViews() {
    renderTable(); 
    renderContractsCards(); 
    renderContractorsCards(); 
    updateStats();
}

// --- 3. رسم الجدول الرئيسي (Dashboard Table) ---
window.renderTable = function() {
    const { contracts, contractors, monthNames } = window.appData;
    
    // التأكد من وجود عناصر البحث
    const searchHospEl = document.getElementById('searchHospital');
    const searchContEl = document.getElementById('searchContractor');
    if (!searchHospEl || !searchContEl) return;

    const searchHosp = searchHospEl.value.toLowerCase();
    const searchCont = searchContEl.value.toLowerCase();
    const filter = document.getElementById('typeFilter').value;

    const hRow = document.getElementById('headerRow');
    const tbody = document.getElementById('tableBody');
    if(!hRow || !tbody) return;

    // رسم الهيدر
    let headerHTML = `
        <th class="sticky-col-1">الموقع</th>
        <th class="sticky-col-2">النوع</th>
        <th class="sticky-col-3">المقاول</th>
        <th style="min-width:40px">تأخير</th>
    `;
    
    if (Array.isArray(monthNames) && monthNames.length > 0) {
        monthNames.forEach(m => headerHTML += `<th style="min-width:100px">${m}</th>`);
    } else {
        headerHTML += `<th style="background:var(--warning); color:#333;">⚠️ يرجى تحديث الشهور</th>`;
    }
    
    headerHTML += `<th style="min-width:150px">ملاحظات</th>`;
    hRow.innerHTML = headerHTML;

    // رسم الصفوف
    tbody.innerHTML = '';
    const rowsArr = Object.entries(contracts).map(([id, val]) => ({...val, id}));

    rowsArr.forEach(row => {
        const cName = (contractors[row.contractorId]?.name) || "غير معروف";
        const hospName = row.hospital || "بدون اسم";
        
        const match = hospName.toLowerCase().includes(searchHosp) && 
                      cName.toLowerCase().includes(searchCont) && 
                      (filter === 'all' || row.type === filter);

        if(match) {
            const tr = document.createElement('tr');
            tr.className = row.type === 'طبي' ? 'row-medical' : 'row-non-medical';
            
            // حساب المتأخرات
            const late = (row.months||[]).filter(m => m && m.financeStatus === 'late').length;
            const badge = late > 0 ? 'badge-red' : 'badge-green';
            
            // --- بيانات التلميح (Tooltip Data) ---
            let valFmt = '-';
            if(row.value) valFmt = Number(row.value).toLocaleString();
            
            const tip = `
📄 رقم العقد: ${row.contractNumber || '-'}
💰 القيمة: ${valFmt} ريال
📅 البداية: ${row.startDate || '-'}
📅 النهاية: ${row.endDate || '-'}
            `.trim();

            tr.innerHTML = `
                <td class="sticky-col-1">${hospName}</td>
                <td class="sticky-col-2">
                    <div class="tooltip-container">
                        <span class="contract-tag ${row.type==='طبي'?'tag-med':'tag-non'}">${row.type}</span>
                        <span class="tooltip-text">${tip}</span>
                    </div>
                </td>
                <td class="sticky-col-3">${cName}</td>
                <td><span class="badge ${badge}">${late}</span></td>
            `;

            // خلايا الشهور
            if (Array.isArray(monthNames) && monthNames.length > 0) {
                monthNames.forEach((mName, idx) => {
                    const md = (row.months && row.months[idx]) ? row.months[idx] : {financeStatus:'late'};
                    
                    let ic='✘', cl='status-late', ti='لم يرفع';
                    if(md.financeStatus === 'sent') { 
                        ic='✅'; cl='status-ok'; 
                        ti=`مطالبة: ${md.claimNum||'-'}\nخطاب: ${md.letterNum||'-'}\nتاريخ: ${md.submissionDate||'-'}`; 
                    }
                    else if(md.financeStatus === 'returned') { 
                        ic='⚠️'; cl='status-returned'; 
                        ti=`إعادة للموقع!\nالسبب: ${md.returnNotes||'-'}`; 
                    }
                    
                    tr.innerHTML += `<td class="${cl}">
                        <div class="tooltip-container" onclick="handleKpiCell('${row.id}', ${idx})">
                            <span>${ic}</span>
                            <span class="tooltip-text">${ti}</span>
                        </div>
                    </td>`;
                });
            } else { 
                tr.innerHTML += `<td style="color:#999;">-</td>`; 
            }

            const en = canEdit(row.type) ? `onclick="editNote('${row.id}')"` : '';
            tr.innerHTML += `<td ${en} style="cursor:pointer; font-size:11px;">${row.notes||''}</td>`;
            tbody.appendChild(tr);
        }
    });
    
    // تحديث الداش بورد بناءً على الفلتر الحالي
    updateDashboard(rowsArr.filter(row => {
        const cName = (contractors[row.contractorId]?.name) || "";
        return row.hospital.toLowerCase().includes(searchHosp) && 
               cName.toLowerCase().includes(searchCont) && 
               (filter === 'all' || row.type === filter);
    }));
};

// --- 4. لوحة الإحصائيات (Dashboard Stats) ---
function updateDashboard(rows) {
    if(!rows) return;
    
    const uniqueHospitals = new Set(rows.map(r => r.hospital)).size;
    const totalLate = rows.reduce((sum, row) => sum + ((row.months||[]).filter(m => m && m.financeStatus === 'late').length), 0);
    
    const totalCells = rows.length * (window.appData.monthNames.length || 1);
    let totalSubmitted = 0;
    rows.forEach(r => { (r.months||[]).forEach(m => { if(m && m.financeStatus === 'sent') totalSubmitted++; }); });
    
    const compliance = totalCells > 0 ? Math.round((totalSubmitted / totalCells) * 100) : 0;

    // تحديث النصوص في HTML
    const elHosp = document.getElementById('countHospitals'); if(elHosp) elHosp.innerText = uniqueHospitals;
    const elCont = document.getElementById('countContracts'); if(elCont) elCont.innerText = rows.length;
    const elLate = document.getElementById('countLate'); if(elLate) elLate.innerText = totalLate;
    const elComp = document.getElementById('complianceRate'); if(elComp) elComp.innerText = compliance + '%';

    // تحديث الرسم البياني
    const canvas = document.getElementById('kpiChart');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'doughnut',
            data: { 
                labels: ['مرفوع', 'متأخر/إعادة'], 
                datasets: [{data: [totalSubmitted, (totalCells - totalSubmitted)], backgroundColor: ['#27ae60', '#c0392b'], borderWidth: 0}] 
            },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 10 } } } } }
        });
    }
}

// --- 5. إدارة العقود والمقاولين (Cards) ---
function renderContractsCards() {
    const grid = document.getElementById('contractsGrid');
    if(!grid) return; grid.innerHTML = '';
    
    Object.entries(window.appData.contracts).forEach(([id, row]) => {
        const cName = window.appData.contractors[row.contractorId]?.name || "غير معروف";
        const valFmt = row.value ? Number(row.value).toLocaleString() : '-';
        const card = document.createElement('div'); card.className = 'data-card';
        card.innerHTML = `
            <div class="card-header"><div><div class="card-title">${row.hospital}</div><div style="font-size:11px;color:#777">${row.contractNumber||'-'}</div></div><span class="contract-tag ${row.type==='طبي'?'tag-med':'tag-non'}">${row.type}</span></div>
            <div class="card-body">
                <div class="row"><span>المقاول:</span><b>${cName}</b></div>
                <div class="row"><span>القيمة:</span><b>${valFmt}</b></div>
                <div class="row"><span>النهاية:</span><b>${row.endDate||'-'}</b></div>
            </div>
            <div class="card-actions"><button class="btn-primary" onclick="prepareEditContract('${id}')">تعديل</button><button class="btn-danger" onclick="deleteContract('${id}')">حذف</button></div>
        `;
        grid.appendChild(card);
    });
}

function renderContractorsCards() {
    const grid = document.getElementById('contractorsGrid');
    if(!grid) return; grid.innerHTML = '';
    Object.entries(window.appData.contractors).forEach(([id, row]) => {
        const card = document.createElement('div'); card.className = 'data-card';
        card.innerHTML = `
            <div class="card-header" style="border:none;"><div class="card-title">${row.name}</div></div>
            <div class="card-actions"><button class="btn-primary" onclick="prepareEditContractor('${id}','${row.name}')">تعديل</button><button class="btn-danger" onclick="deleteContractor('${id}')">حذف</button></div>
        `;
        grid.appendChild(card);
    });
}

// --- 6. عمليات الإضافة والحفظ (CRUD) ---
window.saveContract = function() {
    const id = document.getElementById('form-contract-id').value;
    const hosp = document.getElementById('form-hospital').value;
    const contId = document.getElementById('form-contractor').value;
    const type = document.getElementById('form-type').value;
    
    if(!hosp || !contId) { Swal.fire('نقص بيانات','المستشفى والمقاول مطلوبان','error'); return; }

    const data = {
        hospital: hosp, type: type, contractorId: contId,
        startDate: document.getElementById('form-start-date').value,
        endDate: document.getElementById('form-end-date').value,
        value: document.getElementById('form-value').value,
        contractNumber: document.getElementById('form-contract-num').value
    };

    if (id) { // تعديل
        const existing = window.appData.contracts[id];
        data.months = existing.months || []; 
        data.notes = existing.notes || "";
        update(ref(db, `app_db_v2/contracts/${id}`), data).then(() => { showToast("تم التعديل"); closeModal('contractModal'); });
    } else { // جديد
        const mCount = window.appData.monthNames.length;
        data.months = Array(mCount).fill().map(() => ({ status: "late", financeStatus: "late", claimNum: "", letterNum: "", submissionDate: "", returnNotes: "" }));
        data.notes = "";
        push(ref(db, 'app_db_v2/contracts'), data).then(() => { showToast("تم الحفظ"); closeModal('contractModal'); });
    }
};

window.prepareEditContract = function(id) {
    const c = window.appData.contracts[id];
    fillContractorSelect();
    document.getElementById('form-contract-id').value = id;
    document.getElementById('form-hospital').value = c.hospital;
    document.getElementById('form-type').value = c.type;
    document.getElementById('form-contractor').value = c.contractorId;
    document.getElementById('form-start-date').value = c.startDate;
    document.getElementById('form-end-date').value = c.endDate;
    document.getElementById('form-value').value = c.value;
    document.getElementById('form-contract-num').value = c.contractNumber;
    openModal('contractModal');
};

window.deleteContract = async function(id) {
    if((await Swal.fire({title:'حذف العقد؟', icon:'warning', showCancelButton:true})).isConfirmed) {
        remove(ref(db, `app_db_v2/contracts/${id}`)).then(() => showToast("تم الحذف"));
    }
};

window.saveContractor = function() {
    const id = document.getElementById('form-contractor-id').value;
    const name = document.getElementById('form-new-contractor').value;
    if(!name) return;
    if(id) update(ref(db, `app_db_v2/contractors/${id}`), {name}).then(()=>{showToast("تم"); closeModal('contractorModal');});
    else push(ref(db, 'app_db_v2/contractors'), {name}).then(()=>{showToast("تم"); closeModal('contractorModal');});
};

window.prepareEditContractor = function(id, name) {
    document.getElementById('form-contractor-id').value = id;
    document.getElementById('form-new-contractor').value = name;
    openModal('contractorModal');
};

window.deleteContractor = function(id) {
    const has = Object.values(window.appData.contracts).some(c => c.contractorId === id);
    if(has) { Swal.fire('خطأ','المقاول مرتبط بعقود','error'); return; }
    remove(ref(db, `app_db_v2/contractors/${id}`));
};

// --- 7. التفاعل مع الخلايا (Workflow) ---
window.handleKpiCell = async function(cid, midx) {
    const c = window.appData.contracts[cid];
    if(!canEdit(c.type)) return;
    if(!c.months || !c.months[midx]) { showToast("حدث الشهور أولاً"); return; }
    
    const m = c.months[midx];
    const {value:v} = await Swal.fire({
        title: window.appData.monthNames[midx],
        html: `<select id="sw-st" class="form-control"><option value="late" ${m.financeStatus==='late'?'selected':''}>متأخر</option><option value="sent" ${m.financeStatus==='sent'?'selected':''}>تم الرفع</option><option value="returned" ${m.financeStatus==='returned'?'selected':''}>إعادة</option></select><input id="sw-cn" class="form-control" placeholder="رقم المطالبة" value="${m.claimNum||''}" style="margin-top:5px;"><input id="sw-ln" class="form-control" placeholder="رقم الخطاب" value="${m.letterNum||''}" style="margin-top:5px;"><input id="sw-dt" class="form-control" type="date" value="${m.submissionDate||''}" style="margin-top:5px;"><input id="sw-nt" class="form-control" placeholder="ملاحظات" value="${m.returnNotes||''}" style="margin-top:5px;">`,
        preConfirm: () => ({ financeStatus:document.getElementById('sw-st').value, claimNum:document.getElementById('sw-cn').value, letterNum:document.getElementById('sw-ln').value, submissionDate:document.getElementById('sw-dt').value, returnNotes:document.getElementById('sw-nt').value })
    });
    
    if(v) {
        update(ref(db, `app_db_v2/contracts/${cid}/months/${midx}`), v).then(() => {
            // تحديث محلي سريع
            window.appData.contracts[cid].months[midx] = v;
            renderTable(); 
            showToast("تم");
        });
    }
};

window.editNote = async function(cid) {
    const {value:t} = await Swal.fire({input:'textarea', inputValue:window.appData.contracts[cid].notes});
    if(t!==undefined) update(ref(db, `app_db_v2/contracts/${cid}`), {notes:t});
}

// --- 8. أدوات النظام (شهر جديد، تصدير، تهيئة) ---
window.refreshMonthsSystem = async function() {
    if(!window.userRole) return;
    if(!(await Swal.fire({title:'تحديث الشهور؟', text:'سيتم إنشاء الشهور من يناير للسنة الحالية.', icon:'warning', showCancelButton:true})).isConfirmed) return;
    
    const now = new Date();
    const arM = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    let mNames = [];
    // من يناير حتى الشهر الحالي
    for(let i=0; i<now.getMonth(); i++) mNames.push(`${arM[i]} ${now.getFullYear()}`);
    mNames.reverse();
    
    const u = {'app_db_v2/monthNames': mNames};
    Object.entries(window.appData.contracts).forEach(([id, c]) => {
        // التأكد من أن كل عقد لديه عدد شهور مطابق للجدول
        const adj = new Array(mNames.length).fill(null).map((_,i) => (c.months||[])[i] || {status:"late", financeStatus:"late", claimNum:"", letterNum:"", submissionDate:"", returnNotes:""});
        u[`app_db_v2/contracts/${id}/months`] = adj;
    });
    update(ref(db), u).then(() => showToast("تم التحديث"));
};

window.systemReset = async function() {
    if(window.userRole!=='super') return;
    if((await Swal.fire({title:'مسح الكل؟', text:'سيتم مسح جميع البيانات!', icon:'warning', showCancelButton:true})).isConfirmed) {
        set(ref(db, 'app_db_v2'), {monthNames:[], contractors:{}, contracts:{}});
        set(ref(db, 'app_settings/passwords'), { super: '1234', medical: '1111', non_medical: '2222' })
        .then(()=>location.reload());
    }
};

window.changePasswords = async function() {
    if (!window.userRole || window.userRole !== 'super') return;
    const { value: f } = await Swal.fire({
        title: 'تغيير كلمات المرور',
        html:
            '<label>المدير العام</label><input id="p1" class="swal2-input" value="' + window.appPasswords.super + '">' +
            '<label>مشرف طبي</label><input id="p2" class="swal2-input" value="' + window.appPasswords.medical + '">' +
            '<label>مشرف غير طبي</label><input id="p3" class="swal2-input" value="' + window.appPasswords.non_medical + '">',
        focusConfirm: false, showCancelButton: true, confirmButtonText: 'حفظ',
        preConfirm: () => ({ super: document.getElementById('p1').value, medical: document.getElementById('p2').value, non_medical: document.getElementById('p3').value })
    });
    if (f) {
        set(ref(db, 'app_settings/passwords'), f).then(() => { window.appPasswords = f; window.showToast('تم الحفظ'); });
    }
}

window.exportToExcel = function() {
    const ws = XLSX.utils.table_to_sheet(document.getElementById('mainTable'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KPI Report");
    XLSX.writeFile(wb, "KPI_Report.xlsx");
}

// --- 9. تسجيل الدخول والتحقق ---
window.adminLogin = async function() {
    const { value: pass } = await Swal.fire({
        title: 'تسجيل الدخول', input: 'password', confirmButtonText: 'دخول', confirmButtonColor: '#3498db'
    });
    if (!pass) return;

    const cleanPass = String(pass).trim();
    if (cleanPass == window.appPasswords.super) window.userRole = 'super';
    else if (cleanPass == window.appPasswords.medical) window.userRole = 'medical';
    else if (cleanPass == window.appPasswords.non_medical) window.userRole = 'non_medical';
    else { Swal.fire('خطأ', 'كلمة المرور غير صحيحة', 'error'); return; }

    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('dashboardControls').classList.remove('hidden');
    document.getElementById('loginBtn').classList.add('hidden');
    document.getElementById('logoutBtn').classList.remove('hidden');
    document.getElementById('roleDisplay').innerText = (window.userRole==='super') ? '(مدير عام)' : '(مشرف)';
    
    document.querySelectorAll('.super-admin-only').forEach(b => b.style.display = window.userRole === 'super' ? 'inline-block' : 'none');
    document.querySelectorAll('.restricted-tab').forEach(t => t.style.display = window.userRole === 'super' ? 'block' : 'none');
    
    refreshAllViews();
};

function canEdit(type) {
    if(window.userRole==='super') return true;
    if(window.userRole==='medical' && type==='طبي') return true;
    if(window.userRole==='non_medical' && type==='غير طبي') return true;
    return false;
}

// Helpers
window.openModal = function(id) {
    document.getElementById(id).style.display = 'flex';
    if(id === 'contractModal') fillContractorSelect();
    if(id === 'contractorModal' && !document.getElementById('form-contractor-id').value) {
        document.getElementById('form-new-contractor').value = '';
    }
};
window.closeModal = function(id) {
    document.getElementById(id).style.display = 'none';
    if(id==='contractModal') document.getElementById('form-contract-id').value = '';
    if(id==='contractorModal') document.getElementById('form-contractor-id').value = '';
};
function fillContractorSelect() {
    const s = document.getElementById('form-contractor');
    const curr = s.value;
    s.innerHTML = '<option value="">اختر...</option>';
    Object.entries(window.appData.contractors).forEach(([id,v])=> s.innerHTML+=`<option value="${id}">${v.name}</option>`);
    s.value = curr;
}
window.showToast = function(msg) {
    const t = document.getElementById("toast"); t.innerText = msg; t.className = "show"; setTimeout(() => t.className = "", 2500);
}
