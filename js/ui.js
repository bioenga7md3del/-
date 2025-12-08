// --- تهيئة التلميح ---
export function initTooltip() {
    if (!document.getElementById('global-tooltip')) {
        const div = document.createElement('div');
        div.id = 'global-tooltip';
        div.style.cssText = "position:fixed; background:rgba(44,62,80,0.95); color:#fff; padding:10px 15px; border-radius:8px; font-size:12px; z-index:9999; pointer-events:none; display:none; white-space:pre-line; box-shadow:0 4px 15px rgba(0,0,0,0.3); text-align:right;";
        document.body.appendChild(div);
    }
}

export function showTooltip(e, text) {
    const t = document.getElementById('global-tooltip');
    if (t && text) {
        t.innerText = text; t.style.display = 'block';
        let top = e.clientY + 15, left = e.clientX + 15;
        if (left + 220 > window.innerWidth) left = e.clientX - 225;
        if (top + 100 > window.innerHeight) top = e.clientY - 100;
        t.style.top = top + 'px'; t.style.left = left + 'px';
    }
}
export function hideTooltip() { const t = document.getElementById('global-tooltip'); if (t) t.style.display = 'none'; }

function getContractStatus(start, end) {
    if(!start || !end) return { text: "غير محدد", badge: "badge-grey", is_active: false };
    const today = new Date();
    if (today < new Date(start)) return { text: "لم يبدأ", badge: "badge-orange", is_active: false };
    if (today > new Date(end)) return { text: "منتهي", badge: "badge-red", is_active: false };
    return { text: "ساري", badge: "badge-green", is_active: true };
}

// --- رسم الجدول الرئيسي ---
export function renderTable(appData, userRole, canEditFunc) {
    const { contracts, contractors, monthNames } = appData;
    const sHosp = document.getElementById('searchHospital')?.value.toLowerCase() || "";
    const sCont = document.getElementById('searchContractor')?.value.toLowerCase() || "";
    const filter = document.getElementById('typeFilter')?.value || "all";
    const tbody = document.getElementById('tableBody');
    const hRow = document.getElementById('headerRow');

    if (!tbody || !hRow) return;

    let hHTML = `<th class="sticky-col-1">اسم العقد</th><th class="sticky-col-2">النوع</th><th class="sticky-col-3">المقاول</th><th style="min-width:40px">تأخير</th>`;
    if (monthNames.length) monthNames.forEach(m => hHTML += `<th style="min-width:100px">${m}</th>`);
    else hHTML += `<th>-</th>`;
    hHTML += `<th style="min-width:150px">ملاحظات</th>`;
    hRow.innerHTML = hHTML;

    tbody.innerHTML = '';
    const rows = Object.entries(contracts).map(([id, val]) => ({...val, id}));
    
    if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="15" style="padding:20px;color:#777">لا توجد بيانات</td></tr>`; return; }

    const filtered = rows.filter(r => {
        const cName = contractors[r.contractorId]?.name || "";
        const cTitle = r.contractName || r.hospital || "";
        return (cTitle).toLowerCase().includes(sHosp) && 
               cName.toLowerCase().includes(sCont) && 
               (filter === 'all' || r.type === filter);
    });

    // ترتيب: الاسم ثم النوع
    filtered.sort((a, b) => {
        const nA = a.contractName || a.hospital || "";
        const nB = b.contractName || b.hospital || "";
        return nA.localeCompare(nB, 'ar');
    });

    filtered.forEach(row => {
        const cName = contractors[row.contractorId]?.name || "غير معروف";
        const cTitle = row.contractName || row.hospital || "بدون اسم";
        const late = (row.months||[]).filter(m => m && m.financeStatus === 'late').length;
        const badge = late > 0 ? 'badge-red' : 'badge-green';
        let valFmt = row.value ? Number(row.value).toLocaleString() : '-';
        const st = getContractStatus(row.startDate, row.endDate);
        const tip = `📄 رقم العقد: ${row.contractNumber||'-'}\n💰 القيمة: ${valFmt} ريال\n⏳ المدة: ${row.duration||'-'}\n📅 البداية: ${row.startDate||'-'}\n📅 النهاية: ${row.endDate||'-'}\n📊 الحالة: ${st.text}`;

        const tr = document.createElement('tr');
        tr.className = row.type === 'طبي' ? 'row-medical' : 'row-non-medical';
        
        tr.innerHTML = `
            <td class="sticky-col-1">${cTitle} <span class="badge ${st.badge}" style="font-size:9px; margin-right:5px;">${st.text}</span></td>
            <td class="sticky-col-2" onmousemove="window.showTooltip(event, '${tip.replace(/\n/g, '\\n')}')" onmouseleave="window.hideTooltip()" style="cursor:help">
                <span class="contract-tag ${row.type==='طبي'?'tag-med':'tag-non'}">${row.type}</span>
            </td>
            <td class="sticky-col-3">${cName}</td>
            <td><span class="badge ${badge}">${late}</span></td>
        `;

        if (monthNames.length) {
            monthNames.forEach((m, idx) => {
                const md = (row.months && row.months[idx]) ? row.months[idx] : {financeStatus:'late'};
                let ic='✘', cl='status-late', ti='لم يرفع';
                if(md.financeStatus === 'sent') { ic='✅'; cl='status-ok'; ti=`مطالبة: ${md.claimNum||'-'}\nخطاب: ${md.letterNum||'-'}\nتاريخ: ${md.submissionDate||'-'}`; }
                else if(md.financeStatus === 'returned') { ic='⚠️'; cl='status-returned'; ti=`إعادة: ${md.returnNotes||'-'}`; }
                
                const clickAttr = canEditFunc(userRole, row.type) ? `onclick="window.handleKpiCell('${row.id}', ${idx})"` : '';
                const cursor = canEditFunc(userRole, row.type) ? 'pointer' : 'default';

                tr.innerHTML += `<td class="${cl}" style="cursor:${cursor}">
                    <div ${clickAttr} onmousemove="window.showTooltip(event, '${ti.replace(/\n/g, '\\n')}')" onmouseleave="window.hideTooltip()">${ic}</div>
                </td>`;
            });
        } else { tr.innerHTML += `<td>-</td>`; }

        const en = canEditFunc(userRole, row.type) ? `onclick="window.editNote('${row.id}')"` : '';
        tr.innerHTML += `<td ${en} style="cursor:${canEditFunc(userRole, row.type)?'pointer':'default'}; font-size:11px;">${row.notes||''}</td>`;
        tbody.appendChild(tr);
    });

    return filtered;
}

// --- رسم البطاقات + الإحصائيات المالية ---
export function renderCards(appData, type) {
    const grid = document.getElementById(type === 'contract' ? 'contractsGrid' : 'contractorsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (type === 'contract') {
        // قراءة الفلاتر
        const fName = document.getElementById('filterContractName')?.value.toLowerCase() || "";
        const fStatus = document.getElementById('filterContractStatus')?.value || "all";
        const fType = document.getElementById('filterContractType2')?.value || "all";

        let activeCount = 0;
        let expiredCount = 0;
        let totalMed = 0;
        let totalNonMed = 0;

        const allContracts = Object.entries(appData.contracts);

        // 1. حساب الإحصائيات (على كل العقود، بغض النظر عن البحث)
        allContracts.forEach(([, row]) => {
            const st = getContractStatus(row.startDate, row.endDate);
            if(st.is_active) activeCount++;
            if(st.text === 'منتهي') expiredCount++;
            
            const val = parseFloat(row.value) || 0;
            if(row.type === 'طبي') totalMed += val;
            if(row.type === 'غير طبي') totalNonMed += val;
        });

        // تحديث أرقام الداش بورد المصغر
        if(document.getElementById('cardActiveContracts')) {
            document.getElementById('cardActiveContracts').innerText = activeCount;
            document.getElementById('cardExpiredContracts').innerText = expiredCount;
            document.getElementById('cardTotalMedical').innerText = totalMed.toLocaleString() + ' ريال';
            document.getElementById('cardTotalNonMedical').innerText = totalNonMed.toLocaleString() + ' ريال';
        }

        // 2. الفلترة والرسم
        const filtered = allContracts.filter(([, row]) => {
            const name = row.contractName || row.hospital || "";
            const st = getContractStatus(row.startDate, row.endDate);
            
            const matchName = name.toLowerCase().includes(fName);
            const matchStatus = fStatus === 'all' || 
                                (fStatus === 'active' && st.is_active) || 
                                (fStatus === 'expired' && st.text === 'منتهي');
            const matchType = fType === 'all' || row.type === fType;

            return matchName && matchStatus && matchType;
        });

        // الرسم
        filtered.forEach(([id, row]) => {
            const cName = appData.contractors[row.contractorId]?.name || "-";
            const st = getContractStatus(row.startDate, row.endDate);
            const name = row.contractName || row.hospital;
            const valFmt = row.value ? Number(row.value).toLocaleString() : '-';

            const div = document.createElement('div'); div.className = 'data-card';
            div.innerHTML = `
                <div class="card-header">
                    <div><div class="card-title">${name}</div><span class="badge ${st.badge}" style="font-size:10px">${st.text}</span></div>
                    <span class="contract-tag ${row.type==='طبي'?'tag-med':'tag-non'}">${row.type}</span>
                </div>
                <div class="card-body">
                    <div class="row"><span>المقاول:</span><b>${cName}</b></div>
                    <div class="row"><span>القيمة:</span><b>${valFmt}</b></div>
                    <div class="row"><span>النهاية:</span><b>${row.endDate||'-'}</b></div>
                </div>
                <div class="card-actions"><button class="btn-primary" onclick="window.prepareEditContract('${id}')">تعديل</button><button class="btn-danger" onclick="window.deleteContract('${id}')">حذف</button></div>
            `;
            grid.appendChild(div);
        });

    } else {
        // Contractors
        Object.entries(appData.contractors).forEach(([id, row]) => {
            const div = document.createElement('div'); div.className = 'data-card';
            div.innerHTML = `<div class="card-header" style="border:none"><div class="card-title">${row.name}</div></div><div class="card-actions"><button class="btn-primary" onclick="window.prepareEditContractor('${id}','${row.name}')">تعديل</button><button class="btn-danger" onclick="window.deleteContractor('${id}')">حذف</button></div>`;
            grid.appendChild(div);
        });
    }
}

// --- تحديث الإحصائيات (الرئيسية) ---
export function updateStats(rows, appData) {
    if (!rows || !appData) return;
    const totalLate = rows.reduce((s, r) => s + ((r.months||[]).filter(m => m && m.financeStatus === 'late').length), 0);
    const totalCells = rows.length * (appData.monthNames ? appData.monthNames.length : 1);
    let totalSubmitted = 0;
    let active = 0, expired = 0;

    rows.forEach(r => {
        const st = getContractStatus(r.startDate, r.endDate);
        if(st.text === 'ساري') active++;
        if(st.text === 'منتهي') expired++;
        (r.months||[]).forEach(m => { if(m && m.financeStatus === 'sent') totalSubmitted++; });
    });
    
    const elHosp = document.getElementById('countHospitals'); if(elHosp) elHosp.innerText = new Set(rows.map(r=>r.hospital)).size;
    const elCont = document.getElementById('countContracts'); if(elCont) elCont.innerText = rows.length;
    const elLate = document.getElementById('countLate'); if(elLate) elLate.innerText = totalLate;
    const elActive = document.getElementById('countActive'); if(elActive) elActive.innerText = active;
    const elExpired = document.getElementById('countExpired'); if(elExpired) elExpired.innerText = expired;
    
    const elComp = document.getElementById('complianceRate'); 
    if(elComp) elComp.innerText = totalCells > 0 ? Math.round((totalSubmitted/totalCells)*100)+'%' : '0%';

    const ctx = document.getElementById('kpiChart')?.getContext('2d');
    if (ctx) {
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, { type: 'doughnut', data: { labels:['مرفوع','متأخر'], datasets:[{data:[totalSubmitted, totalCells-totalSubmitted], backgroundColor:['#27ae60','#c0392b']}] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
    }
}

export function showToast(msg) {
    const t = document.getElementById("toast"); if(t) { t.innerText = msg; t.className = "show"; setTimeout(() => t.className = "", 2500); }
}
export function toggleModal(id, show) { const m = document.getElementById(id); if(m) m.style.display = show ? 'flex' : 'none'; }
